/**
 * index.js — the ATLAS API server.
 * Express + Server-Sent Events. Serves the built SPA in production.
 */
import express from 'express';
import cors from 'cors';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRegistry } from '../../packages/skills/src/index.js';
import { KNOWLEDGE } from '../../packages/corpus/src/knowledge.js';
import { runtime } from './runtime.js';
import { runAgent, agentContext, parseCommand } from './agent.js';
import { sessions } from './sessions.js';
import { backward } from '../../packages/neurojs/src/tensor.js';
import { AdamW, cosineSchedule } from '../../packages/neurojs/src/optim.js';
import { RNG } from '../../packages/neurojs/src/rng.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const PORT = Number(process.env.PORT || 8787);
const app = express();
const registry = createRegistry();

app.use(cors());
app.use(express.json({ limit: '8mb' }));
app.use((req, _res, next) => {
  if (req.path.startsWith('/api')) console.log(`[api] ${req.method} ${req.path}`);
  next();
});

runtime.load();
setInterval(() => runtime.maybeReload(), 15000).unref();

/* --------------------------------- meta ---------------------------------- */

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    status: runtime.status,
    ready: runtime.ready,
    uptime: process.uptime(),
    memoryMB: Math.round(process.memoryUsage().rss / 1048576),
    node: process.version,
    skills: registry.list().length,
    now: new Date().toISOString(),
  });
});

app.get('/api/model', (_req, res) => res.json(runtime.card()));

app.get('/api/skills', (_req, res) => {
  res.json({
    total: registry.list().length,
    categories: registry.categories(),
  });
});

app.get('/api/skills/search', (req, res) => res.json({ results: registry.search(req.query.q || '') }));

app.post('/api/skills/:id/run', async (req, res) => {
  try {
    const result = await registry.run(req.params.id, req.body?.args || {}, agentContext(runtime, registry));
    res.json({ ok: true, result });
  } catch (e) {
    res.status(400).json({ ok: false, error: e.message });
  }
});

app.get('/api/knowledge', (_req, res) => {
  res.json({
    entries: KNOWLEDGE.map((k) => ({ id: k.id, title: k.title, field: k.field, tags: k.tags, words: k.text.split(/\s+/).length, text: k.text })),
    fields: [...new Set(KNOWLEDGE.map((k) => k.field))],
    passages: runtime.index.length,
  });
});

app.post('/api/retrieve', (req, res) => {
  try {
    const hits = runtime.retrieve(req.body.query || '', Number(req.body.k) || 5);
    res.json({ hits });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

/* -------------------------------- neural --------------------------------- */

app.post('/api/neural/generate', (req, res) => {
  try {
    const r = runtime.generate(req.body.prompt || '', req.body.options || {});
    res.json({ ok: true, ...r });
  } catch (e) {
    res.status(400).json({ ok: false, error: e.message });
  }
});

app.post('/api/neural/tokenize', (req, res) => {
  try {
    const ids = runtime.tokenizer.encode(req.body.text || '');
    res.json({
      ids,
      pieces: ids.map((id) => ({ id, piece: runtime.tokenizer.piece(id) })),
      ratio: (req.body.text || '').length / Math.max(1, ids.length),
      vocab: runtime.tokenizer.size,
    });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.post('/api/neural/attention', (req, res) => {
  try {
    res.json(runtime.attention(req.body.text || '', Number(req.body.layer ?? -1)));
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.post('/api/neural/perplexity', (req, res) => {
  try {
    res.json(runtime.perplexity(req.body.text || ''));
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.post('/api/neural/embed', (req, res) => {
  try {
    const v = runtime.embed(req.body.text || '');
    let sim = null;
    if (req.body.compare) {
      const w = runtime.embed(req.body.compare);
      sim = Array.from(v).reduce((a, x, i) => a + x * w[i], 0);
    }
    res.json({ vector: Array.from(v), similarity: sim, neighbours: runtime.retrieve(req.body.text || '', 5) });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

/* ------------------------------- sessions -------------------------------- */

app.get('/api/sessions', (_req, res) => res.json({ sessions: sessions.list() }));
app.post('/api/sessions', (req, res) => res.json(sessions.create(req.body?.title)));
app.get('/api/sessions/:id', (req, res) => {
  const s = sessions.get(req.params.id);
  if (!s) return res.status(404).json({ error: 'not found' });
  res.json(s);
});
app.patch('/api/sessions/:id', (req, res) => res.json(sessions.rename(req.params.id, req.body?.title || 'Untitled')));
app.delete('/api/sessions/:id', (req, res) => res.json({ ok: sessions.remove(req.params.id) }));

/* --------------------------------- chat ---------------------------------- */

function sse(res) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.write(': stream open\n\n');
  return (event) => res.write(`data: ${JSON.stringify(event)}\n\n`);
}

app.post('/api/chat/stream', async (req, res) => {
  const { message = '', mode = 'deep', settings = {}, sessionId = null } = req.body || {};
  const send = sse(res);
  let closed = false;
  // NB: listen on the *response*; the request stream closes as soon as the body
  // has been parsed, which would abort the run immediately.
  res.on('close', () => { closed = true; });
  let full = '';
  const events = [];
  try {
    for await (const ev of runAgent({ message, mode, settings, runtime, registry })) {
      if (closed) break;
      if (ev.type === 'delta') full += ev.text;
      else events.push(ev);
      send(ev);
    }
  } catch (e) {
    console.error('[chat] error', e);
    send({ type: 'error', message: e.message, stack: String(e.stack || '').split('\n').slice(0, 4).join('\n') });
  }
  if (sessionId) {
    sessions.append(sessionId, { role: 'user', content: message, mode });
    sessions.append(sessionId, { role: 'assistant', content: full, events: events.filter((e) => ['analysis', 'plan', 'sources', 'skill_result', 'neural', 'done'].includes(e.type)) });
  }
  res.end();
});

/* ------------------------- live fine-tuning stream ------------------------ */

let trainingLock = false;

app.post('/api/train/stream', async (req, res) => {
  const send = sse(res);
  if (!runtime.ready) {
    send({ type: 'error', message: 'model not loaded' });
    return res.end();
  }
  if (trainingLock) {
    send({ type: 'error', message: 'a training run is already in progress' });
    return res.end();
  }
  trainingLock = true;
  const steps = Math.min(200, Math.max(5, Number(req.body?.steps) || 40));
  const lr = Math.min(3e-3, Math.max(1e-5, Number(req.body?.lr) || 6e-4));
  const batch = Math.min(8, Math.max(1, Number(req.body?.batch) || 4));
  const text = String(req.body?.text || '').trim();
  try {
    const model = runtime.model;
    const tok = runtime.tokenizer;
    const corpusPath = path.join(ROOT, 'data/models/corpus.tokens.bin');
    let data;
    if (text.length > 400) {
      data = Int32Array.from(tok.encode(text));
      send({ type: 'info', message: `fine-tuning on ${data.length} custom tokens` });
    } else if (fs.existsSync(corpusPath)) {
      const buf = fs.readFileSync(corpusPath);
      data = new Int32Array(buf.buffer, buf.byteOffset, buf.length / 4);
      send({ type: 'info', message: `continuing pretraining on ${data.length.toLocaleString()} corpus tokens` });
    } else {
      throw new Error('no training data available');
    }
    const T = model.cfg.blockSize;
    if (data.length < T + 2) throw new Error('not enough tokens to form a batch');
    const rng = new RNG(Date.now() & 0xffff);
    const opt = new AdamW(model.parameters(), { lr, weightDecay: 0.01 });
    for (let step = 0; step < steps; step++) {
      const idx = new Int32Array(batch * T);
      const tgt = new Int32Array(batch * T);
      for (let b = 0; b < batch; b++) {
        const start = rng.int(Math.max(1, data.length - T - 1));
        for (let t = 0; t < T; t++) {
          idx[b * T + t] = data[start + t];
          tgt[b * T + t] = data[start + t + 1];
        }
      }
      const st = Date.now();
      model.zeroGrad();
      const { loss } = model.forward(idx, batch, T, tgt);
      backward(loss);
      const gn = opt.clipGradNorm(1.0);
      opt.step(cosineSchedule(step, { warmup: Math.max(2, Math.round(steps * 0.1)), total: steps, maxLr: lr, minLr: lr * 0.1 }));
      send({
        type: 'step', step, steps, loss: loss.value, ppl: Math.exp(loss.value),
        gradNorm: gn, ms: Date.now() - st,
        tokensPerSecond: Math.round((batch * T * 1000) / Math.max(1, Date.now() - st)),
      });
      await new Promise((r) => setImmediate(r));
    }
    runtime.buildIndex();
    send({ type: 'done', message: 'weights updated in memory; retrieval index rebuilt' });
  } catch (e) {
    send({ type: 'error', message: e.message });
  } finally {
    trainingLock = false;
    res.end();
  }
});

/* --------------------------------- corpus -------------------------------- */

app.get('/api/corpus/sample', (req, res) => {
  const p = path.join(ROOT, 'data/corpus/atlas-corpus.txt');
  if (!fs.existsSync(p)) return res.json({ available: false });
  const stat = fs.statSync(p);
  const size = Math.min(4000, stat.size);
  const offset = Math.floor(Math.random() * Math.max(1, stat.size - size));
  const fd = fs.openSync(p, 'r');
  const buf = Buffer.alloc(size);
  fs.readSync(fd, buf, 0, size, offset);
  fs.closeSync(fd);
  let statsJson = null;
  const sp = path.join(ROOT, 'data/corpus/corpus-stats.json');
  if (fs.existsSync(sp)) statsJson = JSON.parse(fs.readFileSync(sp, 'utf8'));
  res.json({ available: true, bytes: stat.size, offset, sample: buf.toString('utf8'), stats: statsJson });
});

/* --------------------------------- static -------------------------------- */

const dist = path.join(ROOT, 'web/dist');
if (fs.existsSync(dist)) {
  app.use(express.static(dist));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api')) return next();
    res.sendFile(path.join(dist, 'index.html'));
  });
}

app.use((req, res) => res.status(404).json({ error: `no route ${req.method} ${req.path}` }));

app.listen(PORT, '0.0.0.0', () => {
  console.log(`
  ╔══════════════════════════════════════════════════╗
  ║   ATLAS Research Console — API online            ║
  ║   http://0.0.0.0:${PORT}                            ║
  ║   model: ${String(runtime.status).padEnd(38)}║
  ║   skills: ${String(registry.list().length).padEnd(37)}║
  ╚══════════════════════════════════════════════════╝`);
});
