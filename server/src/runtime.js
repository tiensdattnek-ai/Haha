/**
 * runtime.js — the ATLAS neural runtime.
 * Loads the from-scratch checkpoint, exposes generation / embedding /
 * introspection, and builds the hybrid retrieval index over the knowledge base.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { deserialize, GPT } from '../../packages/neurojs/src/gpt.js';
import { BPETokenizer } from '../../packages/neurojs/src/bpe.js';
import { generate as sampleGenerate, perplexity as scorePerplexity } from '../../packages/neurojs/src/sample.js';
import { noGrad, Tensor } from '../../packages/neurojs/src/tensor.js';
import { MLP } from '../../packages/neurojs/src/nn.js';
import { featurize, FEATURE_DIM } from '../../packages/neurojs/src/textfeat.js';
import { KNOWLEDGE } from '../../packages/corpus/src/knowledge.js';
import { words, STOPWORDS } from '../../packages/skills/src/textcore.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const MODEL_DIR = path.join(ROOT, 'data/models');

function chunkEntry(entry) {
  const sents = entry.text.split(/(?<=\.)\s+/);
  const chunks = [];
  for (let i = 0; i < sents.length; i += 3) {
    const text = sents.slice(i, i + 3).join(' ');
    if (text.trim().length > 40) {
      chunks.push({ id: `${entry.id}#${chunks.length}`, parent: entry.id, title: entry.title, field: entry.field, tags: entry.tags, text });
    }
  }
  if (!chunks.length) chunks.push({ id: `${entry.id}#0`, parent: entry.id, title: entry.title, field: entry.field, tags: entry.tags, text: entry.text });
  return chunks;
}

export class AtlasRuntime {
  constructor() {
    this.model = null;
    this.tokenizer = null;
    this.meta = null;
    this.header = null;
    this.history = null;
    this.router = null;
    this.routerLabels = [];
    this.index = [];
    this.status = 'cold';
    this.loadedAt = null;
    this.checkpointMtime = 0;
    this.stats = { generations: 0, tokensGenerated: 0, retrievals: 0, skillRuns: 0 };
  }

  get ready() {
    return !!this.model && !!this.tokenizer;
  }

  load({ quiet = false } = {}) {
    const ckpt = path.join(MODEL_DIR, 'atlas.bin');
    const tokPath = path.join(MODEL_DIR, 'tokenizer.json');
    if (!fs.existsSync(ckpt) || !fs.existsSync(tokPath)) {
      this.status = 'missing-checkpoint';
      return false;
    }
    const t0 = Date.now();
    const buf = fs.readFileSync(ckpt);
    const { model, header } = deserialize(buf);
    this.model = model;
    this.header = header;
    this.meta = header.meta || {};
    this.tokenizer = BPETokenizer.fromJSON(JSON.parse(fs.readFileSync(tokPath, 'utf8')));
    this.checkpointMtime = fs.statSync(ckpt).mtimeMs;
    const histPath = path.join(MODEL_DIR, 'training-history.json');
    if (fs.existsSync(histPath)) {
      try { this.history = JSON.parse(fs.readFileSync(histPath, 'utf8')); } catch { this.history = null; }
    }
    this.loadRouter();
    this.buildIndex();
    this.status = this.meta?.partial ? 'partial' : 'ready';
    this.loadedAt = new Date().toISOString();
    if (!quiet) {
      console.log(`[runtime] ATLAS loaded: ${model.numParams().toLocaleString()} params, vocab ${this.tokenizer.size}, ${this.index.length} passages indexed (${Date.now() - t0}ms)`);
    }
    return true;
  }

  /** hot-reload when the trainer writes a new checkpoint */
  maybeReload() {
    const ckpt = path.join(MODEL_DIR, 'atlas.bin');
    if (!fs.existsSync(ckpt)) return false;
    const m = fs.statSync(ckpt).mtimeMs;
    if (m > this.checkpointMtime + 500) {
      try {
        this.load({ quiet: true });
        console.log('[runtime] hot-reloaded updated checkpoint');
        return true;
      } catch (e) {
        console.warn('[runtime] reload failed:', e.message);
      }
    }
    return false;
  }

  loadRouter() {
    const p = path.join(MODEL_DIR, 'router.json');
    if (!fs.existsSync(p)) return;
    try {
      const j = JSON.parse(fs.readFileSync(p, 'utf8'));
      const mlp = new MLP([j.featureDim, j.hidden, j.labels.length]);
      const sd = {};
      for (const [k, v] of Object.entries(j.params)) {
        const buf = Buffer.from(v.b64, 'base64');
        const arr = new Float32Array(v.shape.reduce((a, b) => a * b, 1));
        Buffer.from(arr.buffer).set(buf);
        sd[k] = { shape: v.shape, data: arr };
      }
      mlp.loadStateDict(sd);
      this.router = mlp;
      this.routerLabels = j.labels;
      this.routerMeta = { trainedAt: j.trainedAt, samples: j.samples, accuracy: j.history?.[j.history.length - 1]?.acc };
    } catch (e) {
      console.warn('[runtime] router load failed:', e.message);
    }
  }

  /** Neural intent routing over the skill catalogue. */
  routeNeural(message, topK = 5) {
    if (!this.router) return [];
    const x = new Tensor(featurize(message), [1, FEATURE_DIM], false);
    const out = noGrad(() => this.router.forward(x));
    const max = Math.max(...out.data);
    let sum = 0;
    const probs = Array.from(out.data, (v) => { const e = Math.exp(v - max); sum += e; return e; });
    return probs
      .map((p, i) => ({ id: this.routerLabels[i], score: p / sum }))
      .sort((a, b) => b.score - a.score)
      .slice(0, topK);
  }

  buildIndex() {
    // reuse the precomputed index when it matches this checkpoint (npm run index)
    const cachePath = path.join(MODEL_DIR, 'retrieval-index.json');
    let cache = null;
    if (fs.existsSync(cachePath)) {
      try {
        const j = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
        if (j.checkpointMtime === this.checkpointMtime && j.params === this.model.numParams()) cache = j;
      } catch { /* rebuild */ }
    }
    const chunks = cache
      ? cache.chunks.map((c) => {
        const buf = Buffer.from(c.vector, 'base64');
        const vec = new Float32Array(cache.dim);
        Buffer.from(vec.buffer).set(buf);
        return { ...c, vector: vec };
      })
      : KNOWLEDGE.flatMap(chunkEntry);
    const df = new Map();
    for (const c of chunks) {
      c.terms = words(c.text).filter((w) => !STOPWORDS.has(w) && w.length > 2);
      c.tf = new Map();
      for (const t of c.terms) c.tf.set(t, (c.tf.get(t) || 0) + 1);
      for (const t of new Set(c.terms)) df.set(t, (df.get(t) || 0) + 1);
      if (!c.vector) c.vector = this.embed(`${c.title}. ${c.text}`);
    }
    this.df = df;
    this.avgLen = chunks.reduce((a, c) => a + c.terms.length, 0) / Math.max(1, chunks.length);
    this.index = chunks;
    this.indexCached = !!cache;
  }

  embed(text) {
    if (!this.ready) throw new Error('runtime not ready');
    const ids = this.tokenizer.encode(String(text).slice(0, 1200));
    return this.model.embed(ids);
  }

  /** Hybrid dense + BM25 retrieval. */
  retrieve(query, k = 4) {
    if (!this.index.length) return [];
    this.stats.retrievals++;
    const qv = this.embed(query);
    const qTerms = words(query).filter((w) => !STOPWORDS.has(w) && w.length > 2);
    const N = this.index.length;
    const k1 = 1.5;
    const b = 0.75;
    const scored = this.index.map((c) => {
      let dense = 0;
      for (let i = 0; i < qv.length; i++) dense += qv[i] * c.vector[i];
      let lex = 0;
      for (const t of qTerms) {
        const f = c.tf.get(t) || 0;
        if (!f) continue;
        const idf = Math.log(1 + (N - (this.df.get(t) || 0) + 0.5) / ((this.df.get(t) || 0) + 0.5));
        lex += idf * ((f * (k1 + 1)) / (f + k1 * (1 - b + (b * c.terms.length) / this.avgLen)));
      }
      return { chunk: c, dense, lex };
    });
    const maxLex = Math.max(...scored.map((s) => s.lex), 1e-6);
    return scored
      .map((s) => ({
        id: s.chunk.id, parent: s.chunk.parent, title: s.chunk.title, field: s.chunk.field,
        tags: s.chunk.tags, text: s.chunk.text,
        dense: s.dense, lexical: s.lex / maxLex,
        score: 0.55 * s.dense + 0.45 * (s.lex / maxLex),
      }))
      .sort((a, b2) => b2.score - a.score)
      .slice(0, k);
  }

  generate(prompt, options = {}, onToken = null) {
    if (!this.ready) throw new Error('runtime not ready');
    this.stats.generations++;
    const tokens = this.tokenizer.encode(prompt);
    const r = sampleGenerate(this.model, this.tokenizer, tokens, options, onToken);
    this.stats.tokensGenerated += r.tokens.length;
    return r;
  }

  perplexity(text) {
    return scorePerplexity(this.model, this.tokenizer.encode(text));
  }

  attention(text, layerIndex = -1) {
    const ids = this.tokenizer.encode(text).slice(0, this.model.cfg.blockSize);
    const T = ids.length;
    if (!T) throw new Error('empty prompt');
    const { trace } = noGrad(() => this.model.forward(Int32Array.from(ids), 1, T, null, { trace: true }));
    const L = trace.attn.length;
    const li = layerIndex < 0 ? L + layerIndex : Math.min(layerIndex, L - 1);
    const layer = trace.attn[li];
    const H = layer.H;
    const maps = [];
    for (let h = 0; h < H; h++) {
      const m = [];
      for (let i = 0; i < T; i++) {
        const row = [];
        for (let j = 0; j < T; j++) row.push(layer.data[((0 * H + h) * T + i) * T + j]);
        m.push(row);
      }
      maps.push(m);
    }
    return { tokens: ids.map((id) => this.tokenizer.piece(id)), maps, layerIndex: li, layers: L, heads: H };
  }

  card() {
    if (!this.ready) return { status: this.status };
    const cfg = this.model.cfg;
    return {
      status: this.status,
      name: 'ATLAS-R1',
      loadedAt: this.loadedAt,
      config: cfg,
      params: this.model.numParams(),
      groups: this.model.describe().groups,
      vocab: this.tokenizer.size,
      merges: this.tokenizer.merges.length,
      meta: this.meta,
      router: this.routerMeta || null,
      passages: this.index.length,
      knowledgeEntries: KNOWLEDGE.length,
      stats: this.stats,
      history: this.history?.history?.slice(-400) || [],
    };
  }
}

export const runtime = new AtlasRuntime();
