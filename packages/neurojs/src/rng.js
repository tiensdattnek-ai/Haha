/**
 * Deterministic pseudo random number generators.
 * Everything in ATLAS is reproducible: same seed => same weights, same samples.
 */

/** mulberry32 — fast, decent quality, 32-bit state. */
export class RNG {
  constructor(seed = 1337) {
    this.seed = seed >>> 0;
    this.state = this.seed;
    this._spare = null;
  }

  /** uniform in [0,1) */
  next() {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** uniform in [lo, hi) */
  uniform(lo = 0, hi = 1) {
    return lo + (hi - lo) * this.next();
  }

  /** integer in [0, n) */
  int(n) {
    return Math.floor(this.next() * n) % n;
  }

  /** standard normal via Marsaglia polar (cached spare) */
  normal(mu = 0, sigma = 1) {
    if (this._spare !== null) {
      const v = this._spare;
      this._spare = null;
      return mu + sigma * v;
    }
    let u, v, s;
    do {
      u = this.next() * 2 - 1;
      v = this.next() * 2 - 1;
      s = u * u + v * v;
    } while (s >= 1 || s === 0);
    const mul = Math.sqrt((-2 * Math.log(s)) / s);
    this._spare = v * mul;
    return mu + sigma * u * mul;
  }

  pick(arr) {
    return arr[this.int(arr.length)];
  }

  /** Fisher–Yates, in place */
  shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = this.int(i + 1);
      const t = arr[i];
      arr[i] = arr[j];
      arr[j] = t;
    }
    return arr;
  }

  /** sample an index from an unnormalised weight vector */
  categorical(weights) {
    let total = 0;
    for (let i = 0; i < weights.length; i++) total += weights[i];
    let r = this.next() * total;
    for (let i = 0; i < weights.length; i++) {
      r -= weights[i];
      if (r <= 0) return i;
    }
    return weights.length - 1;
  }
}

export const defaultRNG = new RNG(20260907);
