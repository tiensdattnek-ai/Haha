/**
 * optim.js — AdamW with decoupled weight decay, gradient clipping and
 * a warmup + cosine decay schedule. Written from scratch.
 */

export class AdamW {
  constructor(params, {
    lr = 3e-3,
    beta1 = 0.9,
    beta2 = 0.95,
    eps = 1e-8,
    weightDecay = 0.05,
    decayFilter = (t) => t.shape.length > 1,
  } = {}) {
    this.params = params;
    this.lr = lr;
    this.beta1 = beta1;
    this.beta2 = beta2;
    this.eps = eps;
    this.weightDecay = weightDecay;
    this.decayFilter = decayFilter;
    this.t = 0;
    this.m = params.map((p) => new Float32Array(p.size));
    this.v = params.map((p) => new Float32Array(p.size));
  }

  /** Global L2 clipping; returns the pre-clip grad norm. */
  clipGradNorm(maxNorm) {
    let total = 0;
    for (const p of this.params) {
      if (!p.grad) continue;
      for (let i = 0; i < p.size; i++) total += p.grad[i] * p.grad[i];
    }
    const norm = Math.sqrt(total);
    if (maxNorm > 0 && norm > maxNorm) {
      const k = maxNorm / (norm + 1e-6);
      for (const p of this.params) {
        if (!p.grad) continue;
        for (let i = 0; i < p.size; i++) p.grad[i] *= k;
      }
    }
    return norm;
  }

  step(lr = this.lr) {
    this.t++;
    const bc1 = 1 - Math.pow(this.beta1, this.t);
    const bc2 = 1 - Math.pow(this.beta2, this.t);
    for (let pi = 0; pi < this.params.length; pi++) {
      const p = this.params[pi];
      if (!p.grad) continue;
      const m = this.m[pi];
      const v = this.v[pi];
      const wd = this.decayFilter(p) ? this.weightDecay : 0;
      for (let i = 0; i < p.size; i++) {
        const g = p.grad[i];
        m[i] = this.beta1 * m[i] + (1 - this.beta1) * g;
        v[i] = this.beta2 * v[i] + (1 - this.beta2) * g * g;
        const mh = m[i] / bc1;
        const vh = v[i] / bc2;
        p.data[i] -= lr * (mh / (Math.sqrt(vh) + this.eps) + wd * p.data[i]);
      }
    }
  }

  zeroGrad() {
    for (const p of this.params) p.zeroGrad();
  }
}

/** Linear warmup -> cosine decay to minLr. */
export function cosineSchedule(step, { warmup = 100, total = 1000, maxLr = 3e-3, minLr = 3e-4 }) {
  if (step < warmup) return (maxLr * (step + 1)) / warmup;
  const p = Math.min(1, (step - warmup) / Math.max(1, total - warmup));
  return minLr + 0.5 * (maxLr - minLr) * (1 + Math.cos(Math.PI * p));
}
