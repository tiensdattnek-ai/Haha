/**
 * gpt.js — ATLAS: a decoder-only transformer (pre-LN, GELU MLP, weight-tied
 * head, learned positional embeddings) implemented on top of our own autodiff.
 *
 *   x -> [tok emb + pos emb] -> N x { LN -> causal MHA -> +res ; LN -> MLP -> +res } -> LN -> tied head
 */
import { Tensor, matmulT, add, gelu, causalSelfAttention, crossEntropy, noGrad, dropout } from './tensor.js';
import { Module, Linear, LayerNorm, Embedding } from './nn.js';
import { RNG } from './rng.js';

export const DEFAULT_CONFIG = {
  vocabSize: 1024,
  blockSize: 64,
  nLayer: 4,
  nHead: 4,
  nEmbd: 96,
  mlpRatio: 4,
  dropout: 0.0,
  seed: 1337,
};

class Block extends Module {
  constructor(cfg, rng) {
    super();
    const D = cfg.nEmbd;
    this.cfg = cfg;
    this.ln1 = this.registerModule('ln1', new LayerNorm(D));
    this.wqkv = this.registerParam('wqkv', Tensor.randn([D, 3 * D], 0.02, rng, true));
    this.wo = this.registerParam('wo', Tensor.randn([D, D], 0.02 / Math.sqrt(2 * cfg.nLayer), rng, true));
    this.ln2 = this.registerModule('ln2', new LayerNorm(D));
    this.fc = this.registerModule('fc', new Linear(D, D * cfg.mlpRatio, { rng, std: 0.02 }));
    this.proj = this.registerModule('proj', new Linear(D * cfg.mlpRatio, D, {
      rng,
      std: 0.02 / Math.sqrt(2 * cfg.nLayer),
    }));
  }

  forward(x, B, T, trace) {
    const a = causalSelfAttention(this.ln1.forward(x), this.wqkv, this.wo, B, T, this.cfg.nHead);
    if (trace) trace.attn.push({ B, T, H: this.cfg.nHead, data: a.attn });
    let h = add(x, this.cfg.dropout ? dropout(a, this.cfg.dropout) : a);
    const m = this.proj.forward(gelu(this.fc.forward(this.ln2.forward(h))));
    h = add(h, this.cfg.dropout ? dropout(m, this.cfg.dropout) : m);
    return h;
  }
}

export class GPT extends Module {
  constructor(config = {}) {
    super();
    this.cfg = { ...DEFAULT_CONFIG, ...config };
    if (this.cfg.nEmbd % this.cfg.nHead !== 0) throw new Error('nEmbd must be divisible by nHead');
    const rng = new RNG(this.cfg.seed);
    this.rng = rng;
    this.wte = this.registerModule('wte', new Embedding(this.cfg.vocabSize, this.cfg.nEmbd, { rng }));
    this.wpe = this.registerModule('wpe', new Embedding(this.cfg.blockSize, this.cfg.nEmbd, { rng, std: 0.01 }));
    this.blocks = [];
    for (let i = 0; i < this.cfg.nLayer; i++) {
      const b = new Block(this.cfg, rng);
      this.registerModule(`h${i}`, b);
      this.blocks.push(b);
    }
    this.lnf = this.registerModule('lnf', new LayerNorm(this.cfg.nEmbd));
  }

  /**
   * idx: Int32Array of length B*T. Returns { logits, loss, hidden, trace }.
   * targets: Int32Array of length B*T (or null).
   */
  forward(idx, B, T, targets = null, opts = {}) {
    const trace = opts.trace ? { attn: [] } : null;
    const pos = new Int32Array(B * T);
    for (let b = 0; b < B; b++) for (let t = 0; t < T; t++) pos[b * T + t] = t;
    let x = add(this.wte.forward(idx), this.wpe.forward(pos));
    for (const blk of this.blocks) x = blk.forward(x, B, T, trace);
    const hidden = this.lnf.forward(x);
    const logits = matmulT(hidden, this.wte.weight); // weight tying
    const loss = targets ? crossEntropy(logits, targets) : null;
    return { logits, loss, hidden, trace };
  }

  /** Mean-pooled final hidden state — our from-scratch sentence embedding. */
  embed(tokens) {
    const T = Math.min(tokens.length, this.cfg.blockSize);
    if (T === 0) return new Float32Array(this.cfg.nEmbd);
    const idx = Int32Array.from(tokens.slice(-T));
    return noGrad(() => {
      const { hidden } = this.forward(idx, 1, T);
      const D = this.cfg.nEmbd;
      const out = new Float32Array(D);
      // position-weighted mean pooling (later tokens carry more context)
      let wsum = 0;
      for (let t = 0; t < T; t++) {
        const w = 0.5 + t / T;
        wsum += w;
        for (let d = 0; d < D; d++) out[d] += w * hidden.data[t * D + d];
      }
      let n = 0;
      for (let d = 0; d < D; d++) {
        out[d] /= wsum;
        n += out[d] * out[d];
      }
      n = Math.sqrt(n) || 1;
      for (let d = 0; d < D; d++) out[d] /= n;
      return out;
    });
  }

  describe() {
    const groups = {};
    for (const { path, tensor } of this.namedParameters()) {
      const key = path.replace(/^h\d+\./, 'block.');
      groups[key] = (groups[key] || 0) + tensor.size;
    }
    return {
      config: this.cfg,
      params: this.numParams(),
      groups,
    };
  }
}

/** Serialise to a compact binary buffer: JSON header + f32 blob. */
export function serialize(model, meta = {}) {
  const named = model.namedParameters();
  const header = {
    magic: 'ATLAS1',
    createdAt: new Date().toISOString(),
    config: model.cfg,
    meta,
    tensors: named.map(({ path, tensor }) => ({ path, shape: tensor.shape, size: tensor.size })),
  };
  let headerJson = JSON.stringify(header);
  while ((headerJson.length + 8) % 4 !== 0) headerJson += ' ';
  const headerBuf = Buffer.from(headerJson, 'utf8');
  const total = named.reduce((a, n) => a + n.tensor.size, 0);
  const body = Buffer.alloc(total * 4);
  let off = 0;
  for (const { tensor } of named) {
    Buffer.from(tensor.data.buffer, tensor.data.byteOffset, tensor.size * 4).copy(body, off);
    off += tensor.size * 4;
  }
  const len = Buffer.alloc(8);
  len.writeUInt32LE(headerBuf.length, 0);
  len.writeUInt32LE(0x41544c53, 4);
  return Buffer.concat([len, headerBuf, body]);
}

export function deserialize(buf) {
  const headerLen = buf.readUInt32LE(0);
  const header = JSON.parse(buf.subarray(8, 8 + headerLen).toString('utf8'));
  const model = new GPT(header.config);
  const named = model.namedParameters();
  const byPath = new Map(named.map((n) => [n.path, n.tensor]));
  let off = 8 + headerLen;
  for (const t of header.tensors) {
    const target = byPath.get(t.path);
    if (!target) throw new Error(`checkpoint has unknown tensor ${t.path}`);
    const slice = buf.subarray(off, off + t.size * 4);
    const view = new Float32Array(t.size);
    Buffer.from(view.buffer).set(slice);
    target.data.set(view);
    off += t.size * 4;
  }
  return { model, header };
}
