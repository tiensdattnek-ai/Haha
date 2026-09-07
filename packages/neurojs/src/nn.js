/**
 * nn.js — module system, parameter registry, serialisation.
 */
import { Tensor, matmul, addBias, layerNorm, gelu, embedding } from './tensor.js';
import { defaultRNG } from './rng.js';

export class Module {
  constructor() {
    this._params = new Map();
    this._children = new Map();
  }

  registerParam(name, tensor) {
    tensor.label = name;
    this._params.set(name, tensor);
    return tensor;
  }

  registerModule(name, mod) {
    this._children.set(name, mod);
    return mod;
  }

  /** [{ path, tensor }] */
  namedParameters(prefix = '') {
    const out = [];
    for (const [k, v] of this._params) out.push({ path: prefix ? `${prefix}.${k}` : k, tensor: v });
    for (const [k, m] of this._children) out.push(...m.namedParameters(prefix ? `${prefix}.${k}` : k));
    return out;
  }

  parameters() {
    return this.namedParameters().map((p) => p.tensor);
  }

  numParams() {
    return this.parameters().reduce((a, t) => a + t.size, 0);
  }

  zeroGrad() {
    for (const p of this.parameters()) p.zeroGrad();
  }

  stateDict() {
    const out = {};
    for (const { path, tensor } of this.namedParameters()) {
      out[path] = { shape: tensor.shape, data: tensor.data };
    }
    return out;
  }

  loadStateDict(sd) {
    for (const { path, tensor } of this.namedParameters()) {
      const entry = sd[path];
      if (!entry) throw new Error(`missing parameter in checkpoint: ${path}`);
      if (entry.data.length !== tensor.size) {
        throw new Error(`shape mismatch for ${path}: ${entry.data.length} vs ${tensor.size}`);
      }
      tensor.data.set(entry.data);
    }
    return this;
  }
}

export class Linear extends Module {
  constructor(inDim, outDim, { bias = true, std = 0.02, rng = defaultRNG } = {}) {
    super();
    this.inDim = inDim;
    this.outDim = outDim;
    this.weight = this.registerParam('weight', Tensor.randn([inDim, outDim], std, rng, true));
    this.bias = bias ? this.registerParam('bias', Tensor.zeros([outDim], true)) : null;
  }

  forward(x) {
    const y = matmul(x, this.weight);
    return this.bias ? addBias(y, this.bias) : y;
  }
}

export class LayerNorm extends Module {
  constructor(dim, eps = 1e-5) {
    super();
    this.eps = eps;
    this.gain = this.registerParam('gain', Tensor.filled([dim], 1, true));
    this.bias = this.registerParam('bias', Tensor.zeros([dim], true));
  }

  forward(x) {
    return layerNorm(x, this.gain, this.bias, this.eps);
  }
}

export class Embedding extends Module {
  constructor(num, dim, { std = 0.02, rng = defaultRNG } = {}) {
    super();
    this.num = num;
    this.dim = dim;
    this.weight = this.registerParam('weight', Tensor.randn([num, dim], std, rng, true));
  }

  forward(idx) {
    return embedding(this.weight, idx);
  }
}

/** Simple MLP used by the intent router / small classifiers. */
export class MLP extends Module {
  constructor(sizes, { rng = defaultRNG, std = 0.08 } = {}) {
    super();
    this.layers = [];
    for (let i = 0; i < sizes.length - 1; i++) {
      const l = new Linear(sizes[i], sizes[i + 1], { rng, std });
      this.registerModule(`l${i}`, l);
      this.layers.push(l);
    }
  }

  forward(x) {
    let h = x;
    for (let i = 0; i < this.layers.length; i++) {
      h = this.layers[i].forward(h);
      if (i < this.layers.length - 1) h = gelu(h);
    }
    return h;
  }
}
