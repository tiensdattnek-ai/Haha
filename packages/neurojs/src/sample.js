/**
 * sample.js — autoregressive decoding with the full option surface:
 * temperature, top-k, nucleus (top-p), typical sampling, repetition &
 * frequency penalties, presence penalty, min length, stop sequences,
 * beam-free greedy mode and reproducible seeds.
 */
import { noGrad } from './tensor.js';
import { RNG } from './rng.js';

export const DEFAULT_SAMPLING = {
  maxTokens: 120,
  temperature: 0.9,
  topK: 40,
  topP: 0.92,
  typicalP: 1.0,
  repetitionPenalty: 1.15,
  frequencyPenalty: 0.0,
  presencePenalty: 0.0,
  seed: 42,
  greedy: false,
  minTokens: 0,
  stop: [],
};

function softmaxInPlace(arr) {
  let max = -Infinity;
  for (let i = 0; i < arr.length; i++) if (arr[i] > max) max = arr[i];
  let sum = 0;
  for (let i = 0; i < arr.length; i++) {
    arr[i] = Math.exp(arr[i] - max);
    sum += arr[i];
  }
  const inv = 1 / sum;
  for (let i = 0; i < arr.length; i++) arr[i] *= inv;
  return arr;
}

/**
 * Generate tokens. `onToken(tokenId, info)` is called per step; return false to stop.
 */
export function generate(model, tokenizer, promptTokens, options = {}, onToken = null) {
  const opt = { ...DEFAULT_SAMPLING, ...options };
  const rng = new RNG(opt.seed >>> 0);
  const ctx = model.cfg.blockSize;
  const V = model.cfg.vocabSize;
  const eos = tokenizer.specialIds.get('<eos>');
  const tokens = Array.from(promptTokens);
  const generated = [];
  const counts = new Map();
  for (const t of tokens) counts.set(t, (counts.get(t) || 0) + 1);
  const steps = [];
  const t0 = Date.now();

  for (let step = 0; step < opt.maxTokens; step++) {
    const window = tokens.slice(-ctx);
    const T = window.length;
    const idx = Int32Array.from(window);
    const { logits } = noGrad(() => model.forward(idx, 1, T));
    const row = logits.data.slice((T - 1) * V, T * V);

    // ---- penalties -------------------------------------------------
    for (const [tok, c] of counts) {
      if (opt.repetitionPenalty !== 1) {
        row[tok] = row[tok] > 0 ? row[tok] / opt.repetitionPenalty : row[tok] * opt.repetitionPenalty;
      }
      if (opt.frequencyPenalty) row[tok] -= opt.frequencyPenalty * c;
      if (opt.presencePenalty) row[tok] -= opt.presencePenalty;
    }
    if (generated.length < opt.minTokens && eos !== undefined) row[eos] = -Infinity;
    // never emit structural/pad tokens mid-stream
    for (const s of ['<pad>', '<bos>', '<sys>', '<user>']) {
      const id = tokenizer.specialIds.get(s);
      if (id !== undefined) row[id] = -Infinity;
    }

    // ---- temperature ----------------------------------------------
    const temp = Math.max(1e-4, opt.temperature);
    if (!opt.greedy) for (let i = 0; i < V; i++) row[i] /= temp;
    const probs = softmaxInPlace(Float32Array.from(row));

    // ---- candidate filtering ---------------------------------------
    let order = Array.from({ length: V }, (_, i) => i);
    order.sort((a, b) => probs[b] - probs[a]);

    const topProbs = order.slice(0, 8).map((i) => ({ id: i, piece: tokenizer.piece(i), p: probs[i] }));

    let candidates = order;
    if (opt.topK > 0) candidates = candidates.slice(0, Math.min(opt.topK, V));
    if (opt.topP < 1) {
      const kept = [];
      let cum = 0;
      for (const i of candidates) {
        kept.push(i);
        cum += probs[i];
        if (cum >= opt.topP) break;
      }
      candidates = kept;
    }
    if (opt.typicalP < 1) {
      let H = 0;
      for (const i of candidates) if (probs[i] > 0) H -= probs[i] * Math.log(probs[i]);
      const scored = candidates
        .map((i) => ({ i, d: Math.abs(-Math.log(Math.max(probs[i], 1e-12)) - H) }))
        .sort((a, b) => a.d - b.d);
      const kept = [];
      let cum = 0;
      for (const s of scored) {
        kept.push(s.i);
        cum += probs[s.i];
        if (cum >= opt.typicalP) break;
      }
      candidates = kept;
    }

    let next;
    if (opt.greedy) {
      next = candidates[0];
    } else {
      const w = candidates.map((i) => probs[i]);
      next = candidates[rng.categorical(w)];
    }

    const entropy = -order.slice(0, 64).reduce((a, i) => a + (probs[i] > 0 ? probs[i] * Math.log(probs[i]) : 0), 0);
    steps.push({ token: next, piece: tokenizer.piece(next), p: probs[next], entropy, topProbs });

    if (next === eos && generated.length >= opt.minTokens) break;
    tokens.push(next);
    generated.push(next);
    counts.set(next, (counts.get(next) || 0) + 1);

    if (onToken) {
      const cont = onToken(next, steps[steps.length - 1]);
      if (cont === false) break;
    }
    if (opt.stop && opt.stop.length) {
      const tail = tokenizer.decode(generated, { skipSpecial: true });
      if (opt.stop.some((s) => s && tail.endsWith(s))) break;
    }
  }

  const text = tokenizer.decode(generated, { skipSpecial: true });
  const ms = Date.now() - t0;
  return {
    text,
    tokens: generated,
    steps,
    stats: {
      ms,
      tokens: generated.length,
      tokensPerSecond: generated.length / Math.max(ms / 1000, 1e-6),
      meanEntropy: steps.reduce((a, s) => a + s.entropy, 0) / Math.max(steps.length, 1),
      meanLogProb: steps.reduce((a, s) => a + Math.log(Math.max(s.p, 1e-12)), 0) / Math.max(steps.length, 1),
    },
  };
}

/** Teacher-forced perplexity of a token sequence — used by the analytics panel. */
export function perplexity(model, tokens) {
  const ctx = model.cfg.blockSize;
  const seq = tokens.slice(0, ctx + 1);
  if (seq.length < 2) return null;
  const T = seq.length - 1;
  const idx = Int32Array.from(seq.slice(0, T));
  const targets = Int32Array.from(seq.slice(1));
  const { loss } = noGrad(() => model.forward(idx, 1, T, targets));
  return { loss: loss.data[0], ppl: Math.exp(loss.data[0]), perToken: Array.from(loss.perToken) };
}
