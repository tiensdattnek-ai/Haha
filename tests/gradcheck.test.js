import test from 'node:test';
import assert from 'node:assert';
import { GPT, serialize, deserialize } from '../packages/neurojs/src/gpt.js';
import { backward, noGrad } from '../packages/neurojs/src/tensor.js';
import { BPETokenizer } from '../packages/neurojs/src/bpe.js';
import { RNG } from '../packages/neurojs/src/rng.js';
import { AdamW } from '../packages/neurojs/src/optim.js';

const B = 2, T = 5;
const idx = Int32Array.from([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
const tgt = Int32Array.from([2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);

test('analytic gradients match directional finite differences', () => {
  const model = new GPT({ vocabSize: 32, blockSize: 8, nLayer: 2, nHead: 2, nEmbd: 16, seed: 7 });
  model.zeroGrad();
  const { loss } = model.forward(idx, B, T, tgt);
  backward(loss);
  const rng = new RNG(11);
  let checked = 0;
  for (const { path, tensor } of model.namedParameters()) {
    // random unit-ish direction over the whole tensor => strong signal, float32 safe
    const dir = new Float32Array(tensor.size);
    let analytic = 0;
    for (let i = 0; i < tensor.size; i++) {
      dir[i] = rng.next() < 0.5 ? -1 : 1;
      analytic += dir[i] * tensor.grad[i];
    }
    const eps = 1e-2 / Math.sqrt(tensor.size);
    const backup = tensor.data.slice();
    for (let i = 0; i < tensor.size; i++) tensor.data[i] = backup[i] + eps * dir[i];
    const l1 = noGrad(() => model.forward(idx, B, T, tgt).loss.value);
    for (let i = 0; i < tensor.size; i++) tensor.data[i] = backup[i] - eps * dir[i];
    const l2 = noGrad(() => model.forward(idx, B, T, tgt).loss.value);
    tensor.data.set(backup);
    const numeric = (l1 - l2) / (2 * eps);
    const rel = Math.abs(numeric - analytic) / Math.max(2e-3, Math.abs(numeric) + Math.abs(analytic));
    assert.ok(rel < 2e-2, `grad mismatch at ${path}: num=${numeric} ana=${analytic} rel=${rel}`);
    checked++;
  }
  assert.ok(checked >= 10, 'should check every parameter tensor');
});

test('model overfits a tiny batch (learning actually happens)', () => {
  const model = new GPT({ vocabSize: 32, blockSize: 8, nLayer: 2, nHead: 2, nEmbd: 32, seed: 3 });
  const opt = new AdamW(model.parameters(), { lr: 8e-3, weightDecay: 0 });
  let first = null, last = null;
  for (let s = 0; s < 60; s++) {
    model.zeroGrad();
    const { loss } = model.forward(idx, B, T, tgt);
    backward(loss);
    opt.clipGradNorm(1.0);
    opt.step();
    if (s === 0) first = loss.data[0];
    last = loss.data[0];
  }
  assert.ok(last < first * 0.3, `loss should collapse: ${first} -> ${last}`);
});

test('checkpoint serialisation round-trips bit-exactly', () => {
  const model = new GPT({ vocabSize: 32, blockSize: 8, nLayer: 2, nHead: 2, nEmbd: 16, seed: 5 });
  const buf = serialize(model, { note: 'test' });
  const { model: clone, header } = deserialize(buf);
  assert.strictEqual(header.magic, 'ATLAS1');
  const a = model.namedParameters();
  const b = clone.namedParameters();
  assert.strictEqual(a.length, b.length);
  for (let i = 0; i < a.length; i++) {
    assert.strictEqual(a[i].path, b[i].path);
    assert.deepStrictEqual(Array.from(a[i].tensor.data), Array.from(b[i].tensor.data));
  }
});

test('bpe round-trips text and json', () => {
  const tk = new BPETokenizer();
  tk.train('the study examined statistical power across replications. the study replicated. '.repeat(40), 400);
  const s = 'the study examined statistical power (p < 0.05) — replication!';
  assert.strictEqual(tk.decode(tk.encode(s)), s);
  const j = BPETokenizer.fromJSON(JSON.parse(JSON.stringify(tk.toJSON())));
  assert.strictEqual(j.decode(j.encode(s)), s);
  assert.ok(tk.encode(s).length < s.length, 'bpe should compress');
});
