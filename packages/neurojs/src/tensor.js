/**
 * tensor.js — a tiny, fast, zero-dependency reverse-mode autodiff engine.
 *
 * Design notes
 *  - Every tensor is a flat Float32Array plus a shape. Most ops treat data as a
 *    row-major 2D matrix [rows, cols]; a 3D activation [B, T, D] is simply
 *    [B*T, D] which keeps every kernel cache friendly.
 *  - Graph is built implicitly (parents + backwardFn) and differentiated with a
 *    topological sort — the same trick Autograd/micrograd use, but on matrices.
 *  - Kernels are hand written triple loops in the i-k-j order so that the inner
 *    loop walks contiguous memory. On V8 this reaches ~1.5-2 GFLOP/s per core.
 */

import { RNG, defaultRNG } from './rng.js';

export const GRAD = { enabled: true };

export function noGrad(fn) {
  const prev = GRAD.enabled;
  GRAD.enabled = false;
  try {
    return fn();
  } finally {
    GRAD.enabled = prev;
  }
}

let TENSOR_UID = 0;

export class Tensor {
  constructor(data, shape, requiresGrad = false) {
    this.id = TENSOR_UID++;
    this.data = data instanceof Float32Array ? data : Float32Array.from(data);
    this.shape = shape;
    this.size = this.data.length;
    this.requiresGrad = requiresGrad;
    this.grad = requiresGrad ? new Float32Array(this.size) : null;
    this.parents = null;
    this.backwardFn = null;
    this.label = '';
  }

  get rows() {
    return this.shape.length === 1 ? 1 : this.shape[0];
  }

  get cols() {
    return this.shape[this.shape.length - 1];
  }

  static zeros(shape, requiresGrad = false) {
    const n = shape.reduce((a, b) => a * b, 1);
    return new Tensor(new Float32Array(n), shape, requiresGrad);
  }

  static filled(shape, v, requiresGrad = false) {
    const t = Tensor.zeros(shape, requiresGrad);
    t.data.fill(v);
    return t;
  }

  static randn(shape, std = 0.02, rng = defaultRNG, requiresGrad = true) {
    const t = Tensor.zeros(shape, requiresGrad);
    for (let i = 0; i < t.size; i++) t.data[i] = rng.normal(0, std);
    return t;
  }

  static from(arr, shape, requiresGrad = false) {
    return new Tensor(Float32Array.from(arr), shape || [arr.length], requiresGrad);
  }

  ensureGrad() {
    if (!this.grad) this.grad = new Float32Array(this.size);
    return this.grad;
  }

  zeroGrad() {
    if (this.grad) this.grad.fill(0);
  }

  clone() {
    return new Tensor(this.data.slice(), this.shape.slice(), this.requiresGrad);
  }

  /** L2 norm of the underlying data (diagnostics) */
  norm() {
    let s = 0;
    for (let i = 0; i < this.size; i++) s += this.data[i] * this.data[i];
    return Math.sqrt(s);
  }

  row(i) {
    const c = this.cols;
    return this.data.subarray(i * c, i * c + c);
  }

  toArray() {
    return Array.from(this.data);
  }
}

/** Create an op output node wired into the tape. */
function makeOutput(data, shape, parents, backwardFn) {
  const needsGrad = GRAD.enabled && parents.some((p) => p && p.requiresGrad);
  const out = new Tensor(data, shape, needsGrad);
  if (needsGrad) {
    out.parents = parents.filter(Boolean);
    out.backwardFn = backwardFn;
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * GEMM kernels
 * ------------------------------------------------------------------ */

/**
 * Hand-tuned kernels: 2 output rows x 4 reduction steps per iteration.
 * Measured ~2.4 GFLOP/s on a single sandbox core vs 0.87 for the naive loop.
 */

/** C[N,M] += A[N,K] @ B[K,M] */
export function gemmNNAcc(A, B, C, N, K, M) {
  let i = 0;
  for (; i + 1 < N; i += 2) {
    const a0o = i * K;
    const a1o = a0o + K;
    const c0 = i * M;
    const c1 = c0 + M;
    let k = 0;
    for (; k + 3 < K; k += 4) {
      const p0 = A[a0o + k], p1 = A[a0o + k + 1], p2 = A[a0o + k + 2], p3 = A[a0o + k + 3];
      const q0 = A[a1o + k], q1 = A[a1o + k + 1], q2 = A[a1o + k + 2], q3 = A[a1o + k + 3];
      const b0 = k * M, b1 = b0 + M, b2 = b1 + M, b3 = b2 + M;
      for (let j = 0; j < M; j++) {
        const x0 = B[b0 + j], x1 = B[b1 + j], x2 = B[b2 + j], x3 = B[b3 + j];
        C[c0 + j] += p0 * x0 + p1 * x1 + p2 * x2 + p3 * x3;
        C[c1 + j] += q0 * x0 + q1 * x1 + q2 * x2 + q3 * x3;
      }
    }
    for (; k < K; k++) {
      const p = A[a0o + k], q = A[a1o + k], bk = k * M;
      for (let j = 0; j < M; j++) {
        const x = B[bk + j];
        C[c0 + j] += p * x;
        C[c1 + j] += q * x;
      }
    }
  }
  for (; i < N; i++) {
    const ao = i * K, co = i * M;
    for (let k = 0; k < K; k++) {
      const a = A[ao + k];
      if (a === 0) continue;
      const bk = k * M;
      for (let j = 0; j < M; j++) C[co + j] += a * B[bk + j];
    }
  }
}

/** C[N,M] = A[N,K] @ B[K,M] */
export function gemmNN(A, B, C, N, K, M) {
  C.fill(0);
  gemmNNAcc(A, B, C, N, K, M);
}

/** C[N,M] = A[N,K] @ Bt[M,K]^T */
export function gemmNT(A, Bt, C, N, K, M) {
  for (let i = 0; i < N; i++) {
    const ai = i * K;
    const ci = i * M;
    for (let j = 0; j < M; j++) {
      const bj = j * K;
      let s0 = 0, s1 = 0, s2 = 0, s3 = 0;
      let k = 0;
      for (; k + 3 < K; k += 4) {
        s0 += A[ai + k] * Bt[bj + k];
        s1 += A[ai + k + 1] * Bt[bj + k + 1];
        s2 += A[ai + k + 2] * Bt[bj + k + 2];
        s3 += A[ai + k + 3] * Bt[bj + k + 3];
      }
      let s = s0 + s1 + s2 + s3;
      for (; k < K; k++) s += A[ai + k] * Bt[bj + k];
      C[ci + j] = s;
    }
  }
}

/** out[N,K] += D[N,M] @ B[K,M]^T   (gradient wrt A of C = A@B) */
export function accGradA(D, B, out, N, K, M) {
  for (let i = 0; i < N; i++) {
    const di = i * M;
    const oi = i * K;
    for (let k = 0; k < K; k++) {
      const bk = k * M;
      let s0 = 0, s1 = 0, s2 = 0, s3 = 0;
      let j = 0;
      for (; j + 3 < M; j += 4) {
        s0 += D[di + j] * B[bk + j];
        s1 += D[di + j + 1] * B[bk + j + 1];
        s2 += D[di + j + 2] * B[bk + j + 2];
        s3 += D[di + j + 3] * B[bk + j + 3];
      }
      let s = s0 + s1 + s2 + s3;
      for (; j < M; j++) s += D[di + j] * B[bk + j];
      out[oi + k] += s;
    }
  }
}

/** out[K,M] += A[N,K]^T @ D[N,M]   (gradient wrt B of C = A@B) */
export function accGradB(A, D, out, N, K, M) {
  for (let i = 0; i < N; i++) {
    const ai = i * K;
    const di = i * M;
    let k = 0;
    for (; k + 1 < K; k += 2) {
      const a0 = A[ai + k];
      const a1 = A[ai + k + 1];
      if (a0 === 0 && a1 === 0) continue;
      const o0 = k * M;
      const o1 = o0 + M;
      for (let j = 0; j < M; j++) {
        const d = D[di + j];
        out[o0 + j] += a0 * d;
        out[o1 + j] += a1 * d;
      }
    }
    for (; k < K; k++) {
      const a = A[ai + k];
      if (a === 0) continue;
      const ok = k * M;
      for (let j = 0; j < M; j++) out[ok + j] += a * D[di + j];
    }
  }
}

/* ------------------------------------------------------------------ *
 * Differentiable ops
 * ------------------------------------------------------------------ */

/** a[N,K] @ b[K,M] -> [N,M] */
export function matmul(a, b) {
  const N = a.rows;
  const K = a.cols;
  const M = b.cols;
  const data = new Float32Array(N * M);
  gemmNN(a.data, b.data, data, N, K, M);
  return makeOutput(data, [N, M], [a, b], (g) => {
    if (a.requiresGrad) accGradA(g, b.data, a.ensureGrad(), N, K, M);
    if (b.requiresGrad) accGradB(a.data, g, b.ensureGrad(), N, K, M);
  });
}

/** a[N,K] @ w[M,K]^T -> [N,M] — used for weight-tied projections. */
export function matmulT(a, w) {
  const N = a.rows;
  const K = a.cols;
  const M = w.rows;
  const data = new Float32Array(N * M);
  gemmNT(a.data, w.data, data, N, K, M);
  return makeOutput(data, [N, M], [a, w], (g) => {
    if (a.requiresGrad) gemmNNAcc(g, w.data, a.ensureGrad(), N, M, K);
    if (w.requiresGrad) accGradB(g, a.data, w.ensureGrad(), N, M, K);
  });
}

/** x[N,D] + b[D] broadcast over rows */
export function addBias(x, b) {
  const N = x.rows;
  const D = x.cols;
  const data = new Float32Array(x.size);
  for (let i = 0; i < N; i++) {
    const o = i * D;
    for (let j = 0; j < D; j++) data[o + j] = x.data[o + j] + b.data[j];
  }
  return makeOutput(data, x.shape.slice(), [x, b], (g) => {
    if (x.requiresGrad) {
      const gx = x.ensureGrad();
      for (let i = 0; i < x.size; i++) gx[i] += g[i];
    }
    if (b.requiresGrad) {
      const gb = b.ensureGrad();
      for (let i = 0; i < N; i++) {
        const o = i * D;
        for (let j = 0; j < D; j++) gb[j] += g[o + j];
      }
    }
  });
}

/** elementwise add of identically shaped tensors (residual streams) */
export function add(a, b) {
  const data = new Float32Array(a.size);
  for (let i = 0; i < a.size; i++) data[i] = a.data[i] + b.data[i];
  return makeOutput(data, a.shape.slice(), [a, b], (g) => {
    if (a.requiresGrad) {
      const ga = a.ensureGrad();
      for (let i = 0; i < g.length; i++) ga[i] += g[i];
    }
    if (b.requiresGrad) {
      const gb = b.ensureGrad();
      for (let i = 0; i < g.length; i++) gb[i] += g[i];
    }
  });
}

export function scale(a, k) {
  const data = new Float32Array(a.size);
  for (let i = 0; i < a.size; i++) data[i] = a.data[i] * k;
  return makeOutput(data, a.shape.slice(), [a], (g) => {
    const ga = a.ensureGrad();
    for (let i = 0; i < g.length; i++) ga[i] += g[i] * k;
  });
}

const GELU_C = Math.sqrt(2 / Math.PI);

/** tanh-approximated GELU (the GPT-2 flavour) */
export function gelu(x) {
  const n = x.size;
  const data = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const v = x.data[i];
    const inner = GELU_C * (v + 0.044715 * v * v * v);
    data[i] = 0.5 * v * (1 + Math.tanh(inner));
  }
  return makeOutput(data, x.shape.slice(), [x], (g) => {
    const gx = x.ensureGrad();
    for (let i = 0; i < n; i++) {
      const v = x.data[i];
      const inner = GELU_C * (v + 0.044715 * v * v * v);
      const t = Math.tanh(inner);
      const dinner = GELU_C * (1 + 3 * 0.044715 * v * v);
      gx[i] += g[i] * (0.5 * (1 + t) + 0.5 * v * (1 - t * t) * dinner);
    }
  });
}

/** Row-wise LayerNorm with learned gain/bias. */
export function layerNorm(x, gain, bias, eps = 1e-5) {
  const N = x.rows;
  const D = x.cols;
  const data = new Float32Array(x.size);
  const mean = new Float32Array(N);
  const rstd = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const o = i * D;
    let m = 0;
    for (let j = 0; j < D; j++) m += x.data[o + j];
    m /= D;
    let v = 0;
    for (let j = 0; j < D; j++) {
      const d = x.data[o + j] - m;
      v += d * d;
    }
    v /= D;
    const r = 1 / Math.sqrt(v + eps);
    mean[i] = m;
    rstd[i] = r;
    for (let j = 0; j < D; j++) {
      data[o + j] = (x.data[o + j] - m) * r * gain.data[j] + bias.data[j];
    }
  }
  return makeOutput(data, x.shape.slice(), [x, gain, bias], (g) => {
    const gx = x.requiresGrad ? x.ensureGrad() : null;
    const gg = gain.requiresGrad ? gain.ensureGrad() : null;
    const gb = bias.requiresGrad ? bias.ensureGrad() : null;
    for (let i = 0; i < N; i++) {
      const o = i * D;
      const m = mean[i];
      const r = rstd[i];
      let dnormSum = 0;
      let dnormXhatSum = 0;
      for (let j = 0; j < D; j++) {
        const xhat = (x.data[o + j] - m) * r;
        const dnorm = g[o + j] * gain.data[j];
        dnormSum += dnorm;
        dnormXhatSum += dnorm * xhat;
        if (gg) gg[j] += g[o + j] * xhat;
        if (gb) gb[j] += g[o + j];
      }
      if (gx) {
        for (let j = 0; j < D; j++) {
          const xhat = (x.data[o + j] - m) * r;
          const dnorm = g[o + j] * gain.data[j];
          gx[o + j] += r * (dnorm - dnormSum / D - (xhat * dnormXhatSum) / D);
        }
      }
    }
  });
}

/** Embedding lookup: idx (Int32Array length N) into table[V,D] -> [N,D] */
export function embedding(table, idx) {
  const N = idx.length;
  const D = table.cols;
  const data = new Float32Array(N * D);
  for (let i = 0; i < N; i++) {
    const src = idx[i] * D;
    data.set(table.data.subarray(src, src + D), i * D);
  }
  return makeOutput(data, [N, D], [table], (g) => {
    const gt = table.ensureGrad();
    for (let i = 0; i < N; i++) {
      const dst = idx[i] * D;
      const o = i * D;
      for (let j = 0; j < D; j++) gt[dst + j] += g[o + j];
    }
  });
}

/**
 * Fused causal multi-head self-attention.
 *  x   : [B*T, D]
 *  wqkv: [D, 3D]   wo: [D, D]
 * Returns { out, attn } where attn is the [B, H, T, T] probability tensor
 * (kept as a plain Float32Array so the UI can render heat maps).
 */
export function causalSelfAttention(x, wqkv, wo, B, T, H, opts = {}) {
  const D = x.cols;
  const hd = D / H;
  const scaleF = 1 / Math.sqrt(hd);
  const N = B * T;

  const qkv = new Float32Array(N * 3 * D);
  gemmNN(x.data, wqkv.data, qkv, N, D, 3 * D);

  const attn = new Float32Array(B * H * T * T);
  const ctx = new Float32Array(N * D);

  for (let b = 0; b < B; b++) {
    for (let h = 0; h < H; h++) {
      const aBase = ((b * H + h) * T) * T;
      for (let t = 0; t < T; t++) {
        const qOff = (b * T + t) * 3 * D + h * hd;
        let max = -Infinity;
        const rowOff = aBase + t * T;
        for (let s = 0; s <= t; s++) {
          const kOff = (b * T + s) * 3 * D + D + h * hd;
          let dot = 0;
          for (let d = 0; d < hd; d++) dot += qkv[qOff + d] * qkv[kOff + d];
          dot *= scaleF;
          attn[rowOff + s] = dot;
          if (dot > max) max = dot;
        }
        let sum = 0;
        for (let s = 0; s <= t; s++) {
          const e = Math.exp(attn[rowOff + s] - max);
          attn[rowOff + s] = e;
          sum += e;
        }
        const inv = 1 / sum;
        const cOff = (b * T + t) * D + h * hd;
        for (let s = 0; s <= t; s++) {
          const p = attn[rowOff + s] * inv;
          attn[rowOff + s] = p;
          const vOff = (b * T + s) * 3 * D + 2 * D + h * hd;
          for (let d = 0; d < hd; d++) ctx[cOff + d] += p * qkv[vOff + d];
        }
      }
    }
  }

  const ctxT = new Tensor(ctx, [N, D], false);
  const outData = new Float32Array(N * D);
  gemmNN(ctx, wo.data, outData, N, D, D);

  const out = makeOutput(outData, [N, D], [x, wqkv, wo], (g) => {
    // dCtx = g @ wo^T ; dWo = ctx^T @ g
    const dCtx = new Float32Array(N * D);
    accGradA(g, wo.data, dCtx, N, D, D);
    if (wo.requiresGrad) accGradB(ctx, g, wo.ensureGrad(), N, D, D);

    const dqkv = new Float32Array(N * 3 * D);
    for (let b = 0; b < B; b++) {
      for (let h = 0; h < H; h++) {
        const aBase = ((b * H + h) * T) * T;
        for (let t = 0; t < T; t++) {
          const rowOff = aBase + t * T;
          const cOff = (b * T + t) * D + h * hd;
          const qOff = (b * T + t) * 3 * D + h * hd;
          // dP[s] = sum_d dCtx[t,d] * V[s,d]
          const dP = new Float32Array(t + 1);
          for (let s = 0; s <= t; s++) {
            const vOff = (b * T + s) * 3 * D + 2 * D + h * hd;
            let acc = 0;
            const p = attn[rowOff + s];
            for (let d = 0; d < hd; d++) {
              acc += dCtx[cOff + d] * qkv[vOff + d];
              dqkv[vOff + d] += p * dCtx[cOff + d];
            }
            dP[s] = acc;
          }
          // softmax jacobian
          let dot = 0;
          for (let s = 0; s <= t; s++) dot += dP[s] * attn[rowOff + s];
          for (let s = 0; s <= t; s++) {
            const dScore = attn[rowOff + s] * (dP[s] - dot) * scaleF;
            if (dScore === 0) continue;
            const kOff = (b * T + s) * 3 * D + D + h * hd;
            for (let d = 0; d < hd; d++) {
              dqkv[qOff + d] += dScore * qkv[kOff + d];
              dqkv[kOff + d] += dScore * qkv[qOff + d];
            }
          }
        }
      }
    }
    if (x.requiresGrad) accGradA(dqkv, wqkv.data, x.ensureGrad(), N, D, 3 * D);
    if (wqkv.requiresGrad) accGradB(x.data, dqkv, wqkv.ensureGrad(), N, D, 3 * D);
  });

  out.attn = attn;
  out.ctx = ctxT;
  if (opts.keepQKV) out.qkv = qkv;
  return out;
}

/**
 * Softmax cross entropy over rows. targets: Int32Array (-1 == ignore).
 * Returns a scalar Tensor; also stores per-token loss for perplexity views.
 */
export function crossEntropy(logits, targets) {
  const N = logits.rows;
  const V = logits.cols;
  const probs = new Float32Array(N * V);
  const perToken = new Float32Array(N);
  let loss = 0;
  let count = 0;
  for (let i = 0; i < N; i++) {
    const o = i * V;
    let max = -Infinity;
    for (let j = 0; j < V; j++) if (logits.data[o + j] > max) max = logits.data[o + j];
    let sum = 0;
    for (let j = 0; j < V; j++) {
      const e = Math.exp(logits.data[o + j] - max);
      probs[o + j] = e;
      sum += e;
    }
    const inv = 1 / sum;
    for (let j = 0; j < V; j++) probs[o + j] *= inv;
    const t = targets[i];
    if (t >= 0) {
      const p = Math.max(probs[o + t], 1e-12);
      perToken[i] = -Math.log(p);
      loss += perToken[i];
      count++;
    }
  }
  const mean = count > 0 ? loss / count : 0;
  const out = makeOutput(Float32Array.of(mean), [1], [logits], (g) => {
    const gl = logits.ensureGrad();
    const k = g[0] / Math.max(count, 1);
    for (let i = 0; i < N; i++) {
      const t = targets[i];
      if (t < 0) continue;
      const o = i * V;
      for (let j = 0; j < V; j++) gl[o + j] += k * probs[o + j];
      gl[o + t] -= k;
    }
  });
  out.value = mean; // float64 copy (float32 storage loses resolution for tiny deltas)
  out.probs = probs;
  out.perToken = perToken;
  out.count = count;
  return out;
}

/** Inverted dropout (training only). */
export function dropout(x, p, rng = defaultRNG) {
  if (!GRAD.enabled || p <= 0) return x;
  const keep = 1 - p;
  const mask = new Float32Array(x.size);
  const data = new Float32Array(x.size);
  for (let i = 0; i < x.size; i++) {
    const m = rng.next() < keep ? 1 / keep : 0;
    mask[i] = m;
    data[i] = x.data[i] * m;
  }
  return makeOutput(data, x.shape.slice(), [x], (g) => {
    const gx = x.ensureGrad();
    for (let i = 0; i < g.length; i++) gx[i] += g[i] * mask[i];
  });
}

/** Topological backward pass from a scalar root. */
export function backward(root) {
  const topo = [];
  const seen = new Set();
  const stack = [[root, false]];
  while (stack.length) {
    const frame = stack.pop();
    const node = frame[0];
    if (frame[1]) {
      topo.push(node);
      continue;
    }
    if (seen.has(node.id)) continue;
    seen.add(node.id);
    stack.push([node, true]);
    if (node.parents) for (const p of node.parents) if (p.requiresGrad && !seen.has(p.id)) stack.push([p, false]);
  }
  root.ensureGrad();
  root.grad.fill(1);
  for (let i = topo.length - 1; i >= 0; i--) {
    const n = topo[i];
    if (n.backwardFn && n.grad) n.backwardFn(n.grad);
  }
  return topo.length;
}

export { RNG };
