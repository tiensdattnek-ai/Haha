/**
 * mathcore.js — a real recursive-descent expression compiler + numeric toolkit.
 * No eval, no dependencies. Supports variables, 30+ functions, implicit
 * multiplication, factorials, powers, comparison and constants.
 */

const CONSTANTS = {
  pi: Math.PI,
  e: Math.E,
  tau: Math.PI * 2,
  phi: (1 + Math.sqrt(5)) / 2,
  inf: Infinity,
  nan: NaN,
};

export function lgamma(x) {
  // Lanczos approximation
  const g = 7;
  const c = [
    0.99999999999980993, 676.5203681218851, -1259.1392167224028,
    771.32342877765313, -176.61502916214059, 12.507343278686905,
    -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7,
  ];
  if (x < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * x)) - lgamma(1 - x);
  x -= 1;
  let a = c[0];
  const t = x + g + 0.5;
  for (let i = 1; i < g + 2; i++) a += c[i] / (x + i);
  return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(a);
}

export function gammaFn(x) {
  if (x < 0.5) return Math.PI / (Math.sin(Math.PI * x) * gammaFn(1 - x));
  return Math.exp(lgamma(x));
}

export function factorial(n) {
  if (n < 0) return NaN;
  if (Number.isInteger(n) && n < 171) {
    let r = 1;
    for (let i = 2; i <= n; i++) r *= i;
    return r;
  }
  return gammaFn(n + 1);
}

export function erf(x) {
  // Abramowitz & Stegun 7.1.26 refined with sign handling
  const s = Math.sign(x);
  x = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * x);
  const y = 1 - ((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t * t * Math.exp(-x * x)
    - 0.254829592 * t * Math.exp(-x * x);
  return s * y;
}

export function erfc(x) {
  return 1 - erf(x);
}

const FUNCS = {
  sin: Math.sin, cos: Math.cos, tan: Math.tan, asin: Math.asin, acos: Math.acos, atan: Math.atan,
  sinh: Math.sinh, cosh: Math.cosh, tanh: Math.tanh, exp: Math.exp, sqrt: Math.sqrt, cbrt: Math.cbrt,
  abs: Math.abs, sign: Math.sign, floor: Math.floor, ceil: Math.ceil, round: Math.round,
  ln: Math.log, log: Math.log10, log2: Math.log2, log10: Math.log10,
  gamma: gammaFn, lgamma, erf, erfc, fact: factorial,
  deg: (x) => (x * 180) / Math.PI, rad: (x) => (x * Math.PI) / 180,
  logit: (p) => Math.log(p / (1 - p)), sigmoid: (x) => 1 / (1 + Math.exp(-x)),
  relu: (x) => Math.max(0, x), softplus: (x) => Math.log1p(Math.exp(x)),
  min: Math.min, max: Math.max, atan2: Math.atan2, pow: Math.pow, hypot: Math.hypot,
  mod: (a, b) => ((a % b) + b) % b,
};

export function tokenizeExpr(src) {
  const tokens = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (/\s/.test(c)) { i++; continue; }
    if (/[0-9.]/.test(c)) {
      let j = i;
      while (j < src.length && /[0-9._]/.test(src[j])) j++;
      if (src[j] === 'e' || src[j] === 'E') {
        let k = j + 1;
        if (src[k] === '+' || src[k] === '-') k++;
        if (/[0-9]/.test(src[k] || '')) {
          j = k;
          while (j < src.length && /[0-9]/.test(src[j])) j++;
        }
      }
      tokens.push({ t: 'num', v: parseFloat(src.slice(i, j).replace(/_/g, '')) });
      i = j;
      continue;
    }
    if (/[a-zA-Z_]/.test(c)) {
      let j = i;
      while (j < src.length && /[a-zA-Z_0-9]/.test(src[j])) j++;
      tokens.push({ t: 'id', v: src.slice(i, j) });
      i = j;
      continue;
    }
    const two = src.slice(i, i + 2);
    if (['**', '<=', '>=', '==', '!='].includes(two)) { tokens.push({ t: 'op', v: two }); i += 2; continue; }
    if ('+-*/^%(),<>!='.includes(c)) { tokens.push({ t: 'op', v: c }); i++; continue; }
    throw new Error(`unexpected character '${c}' at ${i}`);
  }
  return tokens;
}

/** Compile to an AST. */
export function parseExpr(src) {
  const tokens = tokenizeExpr(src);
  let pos = 0;
  const peek = () => tokens[pos];
  const eat = (v) => {
    const t = tokens[pos];
    if (!t || (v && t.v !== v)) throw new Error(`expected '${v}' at token ${pos}`);
    pos++;
    return t;
  };

  function parsePrimary() {
    const t = peek();
    if (!t) throw new Error('unexpected end of expression');
    if (t.t === 'num') { pos++; return { k: 'num', v: t.v }; }
    if (t.t === 'id') {
      pos++;
      if (peek() && peek().v === '(') {
        eat('(');
        const args = [];
        if (peek() && peek().v !== ')') {
          args.push(parseExpression());
          while (peek() && peek().v === ',') { eat(','); args.push(parseExpression()); }
        }
        eat(')');
        return { k: 'call', name: t.v, args };
      }
      return { k: 'var', name: t.v };
    }
    if (t.v === '(') { eat('('); const e = parseExpression(); eat(')'); return e; }
    if (t.v === '-') { pos++; return { k: 'neg', a: parseUnary() }; }
    if (t.v === '+') { pos++; return parseUnary(); }
    throw new Error(`unexpected token '${t.v}'`);
  }

  function parsePostfix() {
    let node = parsePrimary();
    while (peek() && peek().v === '!') { eat('!'); node = { k: 'call', name: 'fact', args: [node] }; }
    return node;
  }

  function parseUnary() {
    if (peek() && peek().v === '-') { pos++; return { k: 'neg', a: parseUnary() }; }
    return parsePower();
  }

  function parsePower() {
    const base = parsePostfix();
    if (peek() && (peek().v === '^' || peek().v === '**')) {
      pos++;
      return { k: 'bin', op: '^', a: base, b: parseUnary() };
    }
    return base;
  }

  function parseTerm() {
    let node = parseUnary();
    for (;;) {
      const t = peek();
      if (t && (t.v === '*' || t.v === '/' || t.v === '%')) {
        pos++;
        node = { k: 'bin', op: t.v, a: node, b: parseUnary() };
      } else if (t && (t.t === 'num' || t.t === 'id' || t.v === '(')) {
        // implicit multiplication: 2x, 3(x+1), 2 pi
        node = { k: 'bin', op: '*', a: node, b: parseUnary() };
      } else break;
    }
    return node;
  }

  function parseAdditive() {
    let node = parseTerm();
    while (peek() && (peek().v === '+' || peek().v === '-')) {
      const op = eat().v;
      node = { k: 'bin', op, a: node, b: parseTerm() };
    }
    return node;
  }

  function parseExpression() {
    let node = parseAdditive();
    while (peek() && ['<', '>', '<=', '>=', '==', '!='].includes(peek().v)) {
      const op = eat().v;
      node = { k: 'bin', op, a: node, b: parseAdditive() };
    }
    return node;
  }

  const ast = parseExpression();
  if (pos !== tokens.length) throw new Error(`unexpected trailing token '${tokens[pos].v}'`);
  return ast;
}

export function evalAst(ast, vars = {}) {
  switch (ast.k) {
    case 'num': return ast.v;
    case 'neg': return -evalAst(ast.a, vars);
    case 'var': {
      const n = ast.name;
      if (n in vars) return vars[n];
      if (n.toLowerCase() in CONSTANTS) return CONSTANTS[n.toLowerCase()];
      throw new Error(`unknown variable '${n}'`);
    }
    case 'call': {
      const f = FUNCS[ast.name] || FUNCS[ast.name.toLowerCase()];
      if (!f) throw new Error(`unknown function '${ast.name}'`);
      return f(...ast.args.map((a) => evalAst(a, vars)));
    }
    case 'bin': {
      const a = evalAst(ast.a, vars);
      const b = evalAst(ast.b, vars);
      switch (ast.op) {
        case '+': return a + b;
        case '-': return a - b;
        case '*': return a * b;
        case '/': return a / b;
        case '%': return ((a % b) + b) % b;
        case '^': return Math.pow(a, b);
        case '<': return a < b ? 1 : 0;
        case '>': return a > b ? 1 : 0;
        case '<=': return a <= b ? 1 : 0;
        case '>=': return a >= b ? 1 : 0;
        case '==': return a === b ? 1 : 0;
        case '!=': return a !== b ? 1 : 0;
        default: throw new Error(`unknown operator ${ast.op}`);
      }
    }
    default: throw new Error('bad ast');
  }
}

export function compileExpr(src) {
  const ast = parseExpr(src);
  const fn = (vars = {}) => evalAst(ast, vars);
  fn.ast = ast;
  fn.source = src;
  fn.variables = collectVars(ast);
  return fn;
}

export function collectVars(ast, out = new Set()) {
  if (!ast || typeof ast !== 'object') return out;
  if (ast.k === 'var' && !(ast.name.toLowerCase() in CONSTANTS)) out.add(ast.name);
  for (const key of ['a', 'b']) if (ast[key]) collectVars(ast[key], out);
  if (ast.args) for (const a of ast.args) collectVars(a, out);
  return out;
}

/** Symbolic-ish numeric derivative (Richardson extrapolation). */
export function derivative(fn, x, h = 1e-4) {
  const d1 = (fn(x + h) - fn(x - h)) / (2 * h);
  const d2 = (fn(x + h / 2) - fn(x - h / 2)) / h;
  return (4 * d2 - d1) / 3;
}

/** Adaptive Simpson integration. */
export function integrate(fn, a, b, tol = 1e-9, maxDepth = 24) {
  const simpson = (l, r) => {
    const m = (l + r) / 2;
    return ((r - l) / 6) * (fn(l) + 4 * fn(m) + fn(r));
  };
  const rec = (l, r, eps, whole, depth) => {
    const m = (l + r) / 2;
    const left = simpson(l, m);
    const right = simpson(m, r);
    if (depth <= 0 || Math.abs(left + right - whole) <= 15 * eps) {
      return left + right + (left + right - whole) / 15;
    }
    return rec(l, m, eps / 2, left, depth - 1) + rec(m, r, eps / 2, right, depth - 1);
  };
  return rec(a, b, tol, simpson(a, b), maxDepth);
}

/** Robust root finding: bisection bracket search + Newton polish. */
export function findRoots(fn, lo = -50, hi = 50, samples = 2000) {
  const roots = [];
  let prevX = lo;
  let prevY = fn(lo);
  for (let i = 1; i <= samples; i++) {
    const x = lo + ((hi - lo) * i) / samples;
    const y = fn(x);
    if (Number.isFinite(prevY) && Number.isFinite(y)) {
      if (prevY === 0) roots.push(prevX);
      else if (prevY * y < 0) {
        let a = prevX; let b = x; let fa = prevY;
        for (let k = 0; k < 80; k++) {
          const m = (a + b) / 2;
          const fm = fn(m);
          if (fa * fm <= 0) b = m; else { a = m; fa = fm; }
        }
        roots.push((a + b) / 2);
      }
    }
    prevX = x;
    prevY = y;
  }
  // dedupe
  return roots.filter((r, i) => i === 0 || Math.abs(r - roots[i - 1]) > 1e-6).map((r) => +r.toPrecision(12));
}

/** Runge–Kutta 4 for dy/dx = f(x, y) (scalar or vector). */
export function rk4(f, x0, y0, x1, steps = 500) {
  const vector = Array.isArray(y0);
  let y = vector ? y0.slice() : y0;
  const h = (x1 - x0) / steps;
  const trace = [{ x: x0, y: vector ? y.slice() : y }];
  const addv = (a, b, s) => (vector ? a.map((v, i) => v + s * b[i]) : a + s * b);
  for (let i = 0; i < steps; i++) {
    const x = x0 + i * h;
    const k1 = f(x, y);
    const k2 = f(x + h / 2, addv(y, k1, h / 2));
    const k3 = f(x + h / 2, addv(y, k2, h / 2));
    const k4 = f(x + h, addv(y, k3, h));
    if (vector) y = y.map((v, j) => v + (h / 6) * (k1[j] + 2 * k2[j] + 2 * k3[j] + k4[j]));
    else y = y + (h / 6) * (k1 + 2 * k2 + 2 * k3 + k4);
    if (i % Math.max(1, Math.floor(steps / 200)) === 0) trace.push({ x: x + h, y: vector ? y.slice() : y });
  }
  trace.push({ x: x1, y: vector ? y.slice() : y });
  return { y, trace };
}

/* ------------------------------- matrices ------------------------------- */

export const mat = {
  shape: (A) => [A.length, A[0].length],
  identity: (n) => Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (i === j ? 1 : 0))),
  mul(A, B) {
    const n = A.length, k = B.length, m = B[0].length;
    const C = Array.from({ length: n }, () => new Array(m).fill(0));
    for (let i = 0; i < n; i++) for (let p = 0; p < k; p++) { const a = A[i][p]; if (!a) continue; for (let j = 0; j < m; j++) C[i][j] += a * B[p][j]; }
    return C;
  },
  transpose: (A) => A[0].map((_, j) => A.map((r) => r[j])),
  det(A) {
    const n = A.length;
    const M = A.map((r) => r.slice());
    let det = 1;
    for (let i = 0; i < n; i++) {
      let p = i;
      for (let r = i + 1; r < n; r++) if (Math.abs(M[r][i]) > Math.abs(M[p][i])) p = r;
      if (Math.abs(M[p][i]) < 1e-14) return 0;
      if (p !== i) { [M[i], M[p]] = [M[p], M[i]]; det = -det; }
      det *= M[i][i];
      for (let r = i + 1; r < n; r++) {
        const f = M[r][i] / M[i][i];
        for (let c = i; c < n; c++) M[r][c] -= f * M[i][c];
      }
    }
    return det;
  },
  inverse(A) {
    const n = A.length;
    const M = A.map((r, i) => [...r, ...Array.from({ length: n }, (_, j) => (i === j ? 1 : 0))]);
    for (let i = 0; i < n; i++) {
      let p = i;
      for (let r = i + 1; r < n; r++) if (Math.abs(M[r][i]) > Math.abs(M[p][i])) p = r;
      if (Math.abs(M[p][i]) < 1e-14) throw new Error('matrix is singular');
      [M[i], M[p]] = [M[p], M[i]];
      const piv = M[i][i];
      for (let c = 0; c < 2 * n; c++) M[i][c] /= piv;
      for (let r = 0; r < n; r++) {
        if (r === i) continue;
        const f = M[r][i];
        if (!f) continue;
        for (let c = 0; c < 2 * n; c++) M[r][c] -= f * M[i][c];
      }
    }
    return M.map((r) => r.slice(n));
  },
  solve(A, b) {
    const n = A.length;
    const M = A.map((r, i) => [...r, b[i]]);
    for (let i = 0; i < n; i++) {
      let p = i;
      for (let r = i + 1; r < n; r++) if (Math.abs(M[r][i]) > Math.abs(M[p][i])) p = r;
      if (Math.abs(M[p][i]) < 1e-14) throw new Error('system is singular or ill-conditioned');
      [M[i], M[p]] = [M[p], M[i]];
      for (let r = i + 1; r < n; r++) {
        const f = M[r][i] / M[i][i];
        for (let c = i; c <= n; c++) M[r][c] -= f * M[i][c];
      }
    }
    const x = new Array(n).fill(0);
    for (let i = n - 1; i >= 0; i--) {
      let s = M[i][n];
      for (let j = i + 1; j < n; j++) s -= M[i][j] * x[j];
      x[i] = s / M[i][i];
    }
    return x;
  },
  /** symmetric eigenvalues via Jacobi rotations */
  eigSym(A, iters = 100) {
    const n = A.length;
    let M = A.map((r) => r.slice());
    let V = mat.identity(n);
    for (let sweep = 0; sweep < iters; sweep++) {
      let off = 0;
      for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) off += M[i][j] * M[i][j];
      if (off < 1e-18) break;
      for (let p = 0; p < n; p++) {
        for (let q = p + 1; q < n; q++) {
          if (Math.abs(M[p][q]) < 1e-15) continue;
          const theta = (M[q][q] - M[p][p]) / (2 * M[p][q]);
          const t = Math.sign(theta || 1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
          const c = 1 / Math.sqrt(t * t + 1);
          const s = t * c;
          const Mp = M.map((r) => r.slice());
          for (let k = 0; k < n; k++) {
            M[p][k] = c * Mp[p][k] - s * Mp[q][k];
            M[q][k] = s * Mp[p][k] + c * Mp[q][k];
          }
          const Mq = M.map((r) => r.slice());
          for (let k = 0; k < n; k++) {
            M[k][p] = c * Mq[k][p] - s * Mq[k][q];
            M[k][q] = s * Mq[k][p] + c * Mq[k][q];
          }
          const Vp = V.map((r) => r.slice());
          for (let k = 0; k < n; k++) {
            V[k][p] = c * Vp[k][p] - s * Vp[k][q];
            V[k][q] = s * Vp[k][p] + c * Vp[k][q];
          }
        }
      }
    }
    const values = M.map((r, i) => r[i]);
    const order = values.map((v, i) => i).sort((a, b) => values[b] - values[a]);
    return {
      values: order.map((i) => values[i]),
      vectors: order.map((i) => V.map((r) => r[i])),
    };
  },
};

export { CONSTANTS, FUNCS };
