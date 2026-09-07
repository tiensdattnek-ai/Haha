#!/usr/bin/env node
/**
 * train.js — trains the ATLAS language model from scratch.
 *
 *   node scripts/train.js --steps 900 --embd 128 --layer 4 --head 4 --ctx 96 --batch 12
 *
 * Everything (tokenizer, weights, optimiser state schedule) is produced here;
 * there is no pretrained artefact anywhere in this repository.
 */
import fs from 'node:fs';
import path from 'node:path';
import { GPT, serialize } from '../packages/neurojs/src/gpt.js';
import { BPETokenizer } from '../packages/neurojs/src/bpe.js';
import { AdamW, cosineSchedule } from '../packages/neurojs/src/optim.js';
import { backward, noGrad } from '../packages/neurojs/src/tensor.js';
import { RNG } from '../packages/neurojs/src/rng.js';
import { generate } from '../packages/neurojs/src/sample.js';

function arg(name, def) {
  const i = process.argv.indexOf(`--${name}`);
  if (i > -1 && process.argv[i + 1]) return process.argv[i + 1];
  const env = process.env[`ATLAS_${name.toUpperCase()}`];
  return env !== undefined ? env : def;
}

const CFG = {
  vocab: Number(arg('vocab', 1024)),
  ctx: Number(arg('ctx', 96)),
  layer: Number(arg('layer', 4)),
  head: Number(arg('head', 4)),
  embd: Number(arg('embd', 128)),
  batch: Number(arg('batch', 12)),
  steps: Number(arg('steps', 900)),
  lr: Number(arg('lr', 3.5e-3)),
  minLr: Number(arg('minlr', 3e-4)),
  warmup: Number(arg('warmup', 60)),
  clip: Number(arg('clip', 1.0)),
  wd: Number(arg('wd', 0.05)),
  evalEvery: Number(arg('evalevery', 25)),
  evalBatches: Number(arg('evalbatches', 6)),
  seed: Number(arg('seed', 1337)),
  out: arg('out', 'data/models'),
};

const corpusPath = path.resolve('data/corpus/atlas-corpus.txt');
if (!fs.existsSync(corpusPath)) {
  console.error('corpus missing — run: npm run corpus');
  process.exit(1);
}
const text = fs.readFileSync(corpusPath, 'utf8');
fs.mkdirSync(path.resolve(CFG.out), { recursive: true });

console.log('┌─ ATLAS training run ─────────────────────────────────');
console.log('│ corpus     :', text.length.toLocaleString(), 'chars');

// ---------------------------------------------------------------- tokenizer
let tokenizer;
const tokPath = path.join(CFG.out, 'tokenizer.json');
const t0 = Date.now();
if (fs.existsSync(tokPath) && !process.argv.includes('--retokenize')) {
  tokenizer = BPETokenizer.fromJSON(JSON.parse(fs.readFileSync(tokPath, 'utf8')));
  console.log('│ tokenizer  : loaded', tokenizer.size, 'tokens');
} else {
  tokenizer = new BPETokenizer();
  tokenizer.train(text.slice(0, 700_000), CFG.vocab, { verbose: true });
  fs.writeFileSync(tokPath, JSON.stringify(tokenizer.toJSON()));
  console.log('│ tokenizer  : trained', tokenizer.size, 'tokens in', Date.now() - t0, 'ms');
}

// ---------------------------------------------------------------- encoding
const encPath = path.join(CFG.out, 'corpus.tokens.bin');
let data;
if (fs.existsSync(encPath) && !process.argv.includes('--retokenize')) {
  const buf = fs.readFileSync(encPath);
  data = new Int32Array(buf.buffer, buf.byteOffset, buf.length / 4);
  console.log('│ tokens     : loaded', data.length.toLocaleString());
} else {
  const te = Date.now();
  const ids = tokenizer.encode(text);
  data = Int32Array.from(ids);
  fs.writeFileSync(encPath, Buffer.from(data.buffer, data.byteOffset, data.length * 4));
  console.log('│ tokens     :', data.length.toLocaleString(), `(${(text.length / data.length).toFixed(2)} chars/token, ${Date.now() - te}ms)`);
}

const nTrain = Math.floor(data.length * 0.97);
const train = data.subarray(0, nTrain);
const val = data.subarray(nTrain);

// ---------------------------------------------------------------- model
const model = new GPT({
  vocabSize: tokenizer.size,
  blockSize: CFG.ctx,
  nLayer: CFG.layer,
  nHead: CFG.head,
  nEmbd: CFG.embd,
  seed: CFG.seed,
});
console.log('│ parameters :', model.numParams().toLocaleString());
console.log('│ arch       :', `L${CFG.layer} H${CFG.head} D${CFG.embd} ctx${CFG.ctx} V${tokenizer.size}`);
console.log('│ schedule   :', `${CFG.steps} steps, batch ${CFG.batch}, lr ${CFG.lr} -> ${CFG.minLr}`);
console.log('└──────────────────────────────────────────────────────');

const rng = new RNG(CFG.seed ^ 0x5f3759df);
function batch(src, B, T) {
  const idx = new Int32Array(B * T);
  const tgt = new Int32Array(B * T);
  for (let b = 0; b < B; b++) {
    const start = rng.int(Math.max(1, src.length - T - 1));
    for (let t = 0; t < T; t++) {
      idx[b * T + t] = src[start + t];
      tgt[b * T + t] = src[start + t + 1];
    }
  }
  return { idx, tgt };
}

function evaluate(src, batches) {
  let total = 0;
  for (let i = 0; i < batches; i++) {
    const { idx, tgt } = batch(src, CFG.batch, CFG.ctx);
    const l = noGrad(() => model.forward(idx, CFG.batch, CFG.ctx, tgt).loss.value);
    total += l;
  }
  return total / batches;
}

const opt = new AdamW(model.parameters(), { lr: CFG.lr, weightDecay: CFG.wd, beta2: 0.95 });
const history = [];
const started = Date.now();
let best = Infinity;

for (let step = 0; step < CFG.steps; step++) {
  const lr = cosineSchedule(step, { warmup: CFG.warmup, total: CFG.steps, maxLr: CFG.lr, minLr: CFG.minLr });
  const { idx, tgt } = batch(train, CFG.batch, CFG.ctx);
  const st = Date.now();
  model.zeroGrad();
  const { loss } = model.forward(idx, CFG.batch, CFG.ctx, tgt);
  backward(loss);
  const gnorm = opt.clipGradNorm(CFG.clip);
  opt.step(lr);
  const ms = Date.now() - st;

  if (step % 5 === 0 || step === CFG.steps - 1) {
    const rec = {
      step,
      loss: loss.value,
      ppl: Math.exp(loss.value),
      lr,
      gradNorm: gnorm,
      ms,
      tokensPerSecond: Math.round((CFG.batch * CFG.ctx * 1000) / ms),
      elapsed: Date.now() - started,
    };
    history.push(rec);
  }
  if (step > 0 && step % 100 === 0) {
    // periodic checkpoint so the console can hot-load a model mid-run
    fs.writeFileSync(path.join(CFG.out, 'atlas.bin'), serialize(model, {
      trainedAt: new Date().toISOString(), partial: true, step, steps: CFG.steps,
      params: model.numParams(), tokens: data.length, corpusChars: text.length,
    }));
    fs.writeFileSync(path.join(CFG.out, 'training-history.json'), JSON.stringify({ meta: { partial: true, step, steps: CFG.steps }, history }, null, 2));
  }
  if (step % CFG.evalEvery === 0 || step === CFG.steps - 1) {
    const vl = evaluate(val, CFG.evalBatches);
    const h = history[history.length - 1] || {};
    h.valLoss = vl;
    h.valPpl = Math.exp(vl);
    if (vl < best) best = vl;
    const pct = ((step / CFG.steps) * 100).toFixed(0).padStart(3);
    const eta = ((Date.now() - started) / Math.max(step, 1)) * (CFG.steps - step) / 1000;
    console.log(
      `${pct}% step ${String(step).padStart(4)} | loss ${loss.value.toFixed(4)} | val ${vl.toFixed(4)} | ppl ${Math.exp(vl).toFixed(1)} | lr ${lr.toExponential(2)} | |g| ${gnorm.toFixed(2)} | ${ms}ms/step | eta ${eta.toFixed(0)}s`,
    );
  }
}

const trainLoss = evaluate(train, 8);
const valLoss = evaluate(val, 8);
console.log(`\nfinal: train ${trainLoss.toFixed(4)} (ppl ${Math.exp(trainLoss).toFixed(2)}) | val ${valLoss.toFixed(4)} (ppl ${Math.exp(valLoss).toFixed(2)})`);

// ---------------------------------------------------------------- samples
const probes = [
  '<bos><user> how many participants do I need? <atlas>',
  '<bos><user> can I claim causation here? <atlas>',
  '<bos>A preregistered randomised controlled trial in machine learning',
];
const samples = [];
for (const p of probes) {
  const r = generate(model, tokenizer, tokenizer.encode(p), {
    maxTokens: 60, temperature: 0.8, topK: 40, topP: 0.9, seed: 3,
  });
  samples.push({ prompt: p, text: r.text });
  console.log(`\n▸ ${p}\n  ${r.text.trim().slice(0, 400)}`);
}

const meta = {
  trainedAt: new Date().toISOString(),
  corpusChars: text.length,
  tokens: data.length,
  steps: CFG.steps,
  batch: CFG.batch,
  finalTrainLoss: trainLoss,
  finalValLoss: valLoss,
  bestValLoss: best,
  perplexity: Math.exp(valLoss),
  params: model.numParams(),
  wallClockSeconds: (Date.now() - started) / 1000,
  optimizer: { name: 'AdamW', lr: CFG.lr, minLr: CFG.minLr, weightDecay: CFG.wd, clip: CFG.clip, warmup: CFG.warmup },
  samples,
};

fs.writeFileSync(path.join(CFG.out, 'atlas.bin'), serialize(model, meta));
fs.writeFileSync(path.join(CFG.out, 'training-history.json'), JSON.stringify({ meta, history }, null, 2));
console.log(`\nsaved -> ${path.join(CFG.out, 'atlas.bin')} (${(fs.statSync(path.join(CFG.out, 'atlas.bin')).size / 1024).toFixed(0)} KB)`);
