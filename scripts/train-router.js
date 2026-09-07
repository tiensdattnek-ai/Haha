#!/usr/bin/env node
/**
 * train-router.js — trains the neural intent router from scratch.
 *
 * A hashed bag-of-ngrams MLP classifier over every registered skill, trained on
 * paraphrase templates synthesised from each skill's name, tags and examples.
 * Same autodiff engine as the language model; no external ML dependency.
 */
import fs from 'node:fs';
import path from 'node:path';
import { MLP } from '../packages/neurojs/src/nn.js';
import { Tensor, crossEntropy, backward, noGrad } from '../packages/neurojs/src/tensor.js';
import { AdamW, cosineSchedule } from '../packages/neurojs/src/optim.js';
import { RNG } from '../packages/neurojs/src/rng.js';
import { featurize, FEATURE_DIM } from '../packages/neurojs/src/textfeat.js';
import { createRegistry } from '../packages/skills/src/index.js';

const OUT = path.resolve('data/models');
fs.mkdirSync(OUT, { recursive: true });

const registry = createRegistry();
const skills = registry.list();
const labels = skills.map((s) => s.id);
const rng = new RNG(4242);

const TEMPLATES = [
  (x) => `${x}`,
  (x) => `help me with ${x}`,
  (x) => `how do i ${x}`,
  (x) => `can you ${x} for me`,
  (x) => `i need ${x}`,
  (x) => `${x} please`,
  (x) => `run ${x} on this`,
  (x) => `what about ${x}?`,
  (x) => `i want to ${x} in my study`,
  (x) => `${x} for my research project`,
  (x) => `quick question about ${x}`,
  (x) => `use ${x} here`,
];

const samples = [];
for (let li = 0; li < skills.length; li++) {
  const s = skills[li];
  const phrases = new Set();
  const bank = [s.name.toLowerCase(), s.summary.toLowerCase(), ...s.tags.map((t) => t.toLowerCase()), s.id.replace(/[.]/g, ' ')];
  for (const b of bank) {
    for (const tpl of TEMPLATES) phrases.add(tpl(b));
  }
  // tag pair combinations for lexical robustness
  for (let i = 0; i < s.tags.length; i++) {
    for (let j = i + 1; j < s.tags.length; j++) {
      phrases.add(`${s.tags[i]} ${s.tags[j]}`);
      phrases.add(`how to ${s.tags[i]} and ${s.tags[j]}`);
    }
  }
  for (const ex of s.examples || []) {
    phrases.add(`${ex.label} ${Object.values(ex.args).join(' ')}`.toLowerCase().slice(0, 120));
  }
  for (const p of phrases) samples.push({ x: p, y: li });
}

rng.shuffle(samples);
const split = Math.floor(samples.length * 0.9);
const train = samples.slice(0, split);
const val = samples.slice(split);

console.log(`router: ${labels.length} classes, ${samples.length} synthetic phrases (${train.length} train / ${val.length} val)`);

const HID = 192;
const model = new MLP([FEATURE_DIM, HID, labels.length], { rng, std: 0.06 });
console.log('router parameters:', model.numParams().toLocaleString());

// pre-featurise
const feats = samples.map((s) => featurize(s.x));
const trainIdx = samples.map((_, i) => i).slice(0, split);
const valIdx = samples.map((_, i) => i).slice(split);

const opt = new AdamW(model.parameters(), { lr: 6e-3, weightDecay: 1e-4 });
const STEPS = Number(process.env.ROUTER_STEPS || 900);
const BATCH = 96;
const history = [];

function batchOf(indices) {
  const B = Math.min(BATCH, indices.length);
  const x = new Float32Array(B * FEATURE_DIM);
  const y = new Int32Array(B);
  for (let b = 0; b < B; b++) {
    const i = indices[rng.int(indices.length)];
    x.set(feats[i], b * FEATURE_DIM);
    y[b] = samples[i].y;
  }
  return { x: new Tensor(x, [B, FEATURE_DIM], false), y };
}

for (let step = 0; step < STEPS; step++) {
  const lr = cosineSchedule(step, { warmup: 40, total: STEPS, maxLr: 6e-3, minLr: 5e-4 });
  const { x, y } = batchOf(trainIdx);
  model.zeroGrad();
  const logits = model.forward(x);
  const loss = crossEntropy(logits, y);
  backward(loss);
  opt.clipGradNorm(2);
  opt.step(lr);
  if (step % 50 === 0 || step === STEPS - 1) {
    // validation accuracy
    let correct = 0;
    for (const i of valIdx) {
      const t = new Tensor(feats[i], [1, FEATURE_DIM], false);
      const out = noGrad(() => model.forward(t));
      let best = 0;
      for (let k = 1; k < labels.length; k++) if (out.data[k] > out.data[best]) best = k;
      if (best === samples[i].y) correct++;
    }
    const acc = correct / Math.max(1, valIdx.length);
    history.push({ step, loss: loss.value, acc });
    console.log(`step ${String(step).padStart(4)} | loss ${loss.value.toFixed(4)} | val acc ${(acc * 100).toFixed(1)}%`);
  }
}

const sd = model.stateDict();
const payload = {
  version: 1,
  featureDim: FEATURE_DIM,
  hidden: HID,
  labels,
  trainedAt: new Date().toISOString(),
  samples: samples.length,
  history,
  params: Object.fromEntries(Object.entries(sd).map(([k, v]) => [k, {
    shape: v.shape,
    b64: Buffer.from(v.data.buffer, v.data.byteOffset, v.data.length * 4).toString('base64'),
  }])),
};
fs.writeFileSync(path.join(OUT, 'router.json'), JSON.stringify(payload));
console.log(`saved -> ${path.join(OUT, 'router.json')} (${(fs.statSync(path.join(OUT, 'router.json')).size / 1024).toFixed(0)} KB)`);

// smoke test
const probes = ['how many participants do i need', 'compare these two groups', 'summarise this paper',
  'format this citation in apa', 'what is the derivative of x^2', 'critique my study design',
  'run this javascript', 'show me the attention heads'];
for (const p of probes) {
  const t = new Tensor(featurize(p), [1, FEATURE_DIM], false);
  const out = noGrad(() => model.forward(t));
  const ranked = labels.map((l, i) => ({ l, s: out.data[i] })).sort((a, b) => b.s - a.s).slice(0, 3);
  console.log(`  "${p}" → ${ranked.map((r) => r.l).join(', ')}`);
}
