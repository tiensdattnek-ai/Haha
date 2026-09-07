/**
 * skills.math.js — symbolic-ish and numeric mathematics.
 */
import { table, fmt, numbers, matrix } from './registry.js';
import { compileExpr, derivative, integrate, findRoots, rk4, mat, factorial, gammaFn, erf } from './mathcore.js';

const UNITS = {
  length: { m: 1, km: 1000, cm: 0.01, mm: 0.001, um: 1e-6, nm: 1e-9, mi: 1609.344, yd: 0.9144, ft: 0.3048, in: 0.0254, ly: 9.4607e15, au: 1.495978707e11, pc: 3.0857e16 },
  mass: { kg: 1, g: 0.001, mg: 1e-6, ug: 1e-9, t: 1000, lb: 0.45359237, oz: 0.028349523125, st: 6.35029318 },
  time: { s: 1, ms: 0.001, us: 1e-6, ns: 1e-9, min: 60, h: 3600, d: 86400, wk: 604800, yr: 31557600 },
  energy: { j: 1, kj: 1000, cal: 4.184, kcal: 4184, wh: 3600, kwh: 3.6e6, ev: 1.602176634e-19, btu: 1055.06 },
  data: { b: 1, kb: 1e3, mb: 1e6, gb: 1e9, tb: 1e12, kib: 1024, mib: 1048576, gib: 1073741824, tib: 1.099511627776e12 },
  pressure: { pa: 1, kpa: 1000, bar: 1e5, atm: 101325, psi: 6894.757, mmhg: 133.322 },
  angle: { rad: 1, deg: Math.PI / 180, grad: Math.PI / 200, turn: 2 * Math.PI },
};

export default [
  {
    id: 'math.calc',
    name: 'Expression Calculator',
    category: 'mathematics',
    summary: 'Parses and evaluates arbitrary expressions with 30+ functions, constants and variables.',
    tags: ['calculate', 'compute', 'arithmetic', 'evaluate', 'expression'],
    params: [
      { name: 'expression', type: 'string', required: true, description: 'e.g. "sqrt(2)*ln(10) + sin(pi/3)^2"' },
      { name: 'vars', type: 'string', default: '', description: 'assignments, e.g. "x=3, y=1.5"' },
    ],
    examples: [{ label: 'Compound', args: { expression: '1000*(1+0.07/12)^(12*10)' } }],
    match: (m) => (/[0-9]\s*[-+*/^]\s*[0-9(]|\b(calculate|compute|evaluate|what is)\b.*[0-9]/i.test(m) ? 2 : 0),
    run: ({ expression, vars = '' }) => {
      const env = {};
      for (const part of String(vars).split(/[,;]/)) {
        const m = part.match(/^\s*([a-zA-Z_]\w*)\s*=\s*(-?[\d.eE+-]+)\s*$/);
        if (m) env[m[1]] = Number(m[2]);
      }
      const fn = compileExpr(expression);
      const missing = [...fn.variables].filter((v) => !(v in env));
      if (missing.length) throw new Error(`unbound variable(s): ${missing.join(', ')} — pass them via vars, e.g. "${missing[0]}=1"`);
      const value = fn(env);
      const alt = [];
      if (Number.isFinite(value)) {
        alt.push(['Exact-ish', value.toPrecision(15)]);
        alt.push(['Scientific', value.toExponential(6)]);
        if (Math.abs(value) < 1e15) alt.push(['Rounded', value.toFixed(6)]);
        if (value > 0) alt.push(['ln / log10', `${Math.log(value).toFixed(6)} / ${Math.log10(value).toFixed(6)}`]);
        const frac = (() => {
          let bestN = 1, bestD = 1, bestErr = Infinity;
          for (let d = 1; d <= 5000; d++) {
            const n = Math.round(value * d);
            const err = Math.abs(value - n / d);
            if (err < bestErr - 1e-15) { bestErr = err; bestN = n; bestD = d; }
            if (bestErr < 1e-12) break;
          }
          return bestErr < 1e-9 ? `${bestN}/${bestD}` : null;
        })();
        if (frac) alt.push(['Rational form', frac]);
      }
      return {
        markdown: `## \`${expression}\` = **${fmt(value, 10)}**\n\n${table(['Representation', 'Value'], alt)}\n\n${Object.keys(env).length ? `**Bindings:** ${Object.entries(env).map(([k, v]) => `${k} = ${v}`).join(', ')}` : ''}\n\n<details><summary>Parse tree</summary>\n\n\`\`\`json\n${JSON.stringify(fn.ast, null, 1).slice(0, 1500)}\n\`\`\`\n</details>`,
        data: { value, ast: fn.ast, env },
      };
    },
  },

  {
    id: 'math.solve',
    name: 'Equation Solver',
    category: 'mathematics',
    summary: 'Finds all real roots of f(x)=0 (or lhs=rhs) by bracketing + bisection, with a value table.',
    tags: ['solve', 'equation', 'root', 'zero', 'x='],
    params: [
      { name: 'equation', type: 'string', required: true, description: 'e.g. "x^3 - 2x = 5" or "cos(x)-x"' },
      { name: 'lo', type: 'number', default: -50, description: 'search lower bound' },
      { name: 'hi', type: 'number', default: 50, description: 'search upper bound' },
    ],
    match: (m) => (/\bsolve\b|=\s*0\b|\broots? of\b|\bfind x\b/i.test(m) ? 3 : 0),
    run: ({ equation, lo = -50, hi = 50 }) => {
      const eq = String(equation).replace(/\s/g, '');
      const [lhs, rhs] = eq.includes('=') ? eq.split('=') : [eq, '0'];
      const f = compileExpr(`(${lhs}) - (${rhs})`);
      const varName = [...f.variables][0] || 'x';
      const g = (x) => f({ [varName]: x });
      const roots = findRoots(g, Number(lo), Number(hi));
      const rows = roots.map((r, i) => [`${varName}${i + 1}`, fmt(r, 8), fmt(g(r), 10), fmt(derivative(g, r), 4)]);
      return {
        markdown: `## Solve \`${lhs} = ${rhs}\` for \`${varName}\`

${roots.length ? table(['Root', 'Value', 'Residual f(x)', "f'(x)"], rows) : `_No sign change found in [${lo}, ${hi}]. The equation may have complex roots, tangential roots, or roots outside the window — widen \`lo\`/\`hi\`._`}

### Behaviour scan
${table([varName, 'f(x)'], Array.from({ length: 9 }, (_, i) => {
  const x = Number(lo) + ((Number(hi) - Number(lo)) * i) / 8;
  return [fmt(x, 3), fmt(g(x), 4)];
}))}

${roots.length ? `**Verification.** Each root satisfies |f(x)| < 1e-8. Multiplicity is suggested by f'(x): a derivative near zero indicates a repeated (tangential) root, which bisection finds unreliably — confirm with a plot or a Newton iteration from both sides.` : ''}`,
        data: { roots, variable: varName },
        viz: { type: 'function', lo: Number(lo), hi: Number(hi), samples: Array.from({ length: 200 }, (_, i) => { const x = Number(lo) + ((Number(hi) - Number(lo)) * i) / 199; return { x, y: g(x) }; }), roots },
      };
    },
  },

  {
    id: 'math.calculus',
    name: 'Numeric Calculus',
    category: 'mathematics',
    summary: 'Derivatives (Richardson), definite integrals (adaptive Simpson) and extrema of an expression.',
    tags: ['derivative', 'integral', 'calculus', 'differentiate', 'integrate', 'area under'],
    params: [
      { name: 'expression', type: 'string', required: true, description: 'f(x), e.g. "exp(-x^2)"' },
      { name: 'at', type: 'number', default: 1, description: 'point for the derivative' },
      { name: 'from', type: 'number', default: 0, description: 'integration lower limit' },
      { name: 'to', type: 'number', default: 1, description: 'integration upper limit' },
    ],
    match: (m) => (/\b(derivative|differentiate|integral|integrate|area under|slope of)\b/i.test(m) ? 3 : 0),
    run: ({ expression, at = 1, from = 0, to = 1 }) => {
      const f = compileExpr(expression);
      const v = [...f.variables][0] || 'x';
      const g = (x) => f({ [v]: x });
      const a = Number(at);
      const d1 = derivative(g, a);
      const d2 = (derivative(g, a + 1e-3) - derivative(g, a - 1e-3)) / 2e-3;
      const area = integrate(g, Number(from), Number(to));
      // extrema search on the integration window
      const dfun = (x) => derivative(g, x);
      const crit = findRoots(dfun, Number(from), Number(to), 800).map((x) => ({
        x, y: g(x), kind: derivative(dfun, x) > 0 ? 'minimum' : derivative(dfun, x) < 0 ? 'maximum' : 'inflection',
      }));
      return {
        markdown: `## Calculus of \`f(${v}) = ${expression}\`

${table(['Quantity', 'Value'], [
  [`f(${fmt(a, 4)})`, fmt(g(a), 8)],
  [`f'(${fmt(a, 4)})`, fmt(d1, 8)],
  [`f''(${fmt(a, 4)})`, fmt(d2, 6)],
  [`∫ from ${fmt(Number(from), 4)} to ${fmt(Number(to), 4)}`, fmt(area, 8)],
  ['Mean value on interval', fmt(area / (Number(to) - Number(from) || 1), 6)],
])}

### Critical points in [${fmt(Number(from), 3)}, ${fmt(Number(to), 3)}]
${crit.length ? table([v, 'f(x)', 'Type'], crit.map((c) => [fmt(c.x, 6), fmt(c.y, 6), c.kind])) : '_No interior critical points detected._'}

**Local behaviour at ${v} = ${fmt(a, 4)}:** the function is ${d1 > 0 ? 'increasing' : d1 < 0 ? 'decreasing' : 'stationary'} and ${d2 > 0 ? 'convex (curving upward)' : d2 < 0 ? 'concave (curving downward)' : 'locally linear'}. Second-order Taylor approximation near that point: f(${v}) ≈ ${fmt(g(a), 5)} ${d1 >= 0 ? '+' : '−'} ${fmt(Math.abs(d1), 5)}·(${v}−${fmt(a, 3)}) ${d2 >= 0 ? '+' : '−'} ${fmt(Math.abs(d2 / 2), 5)}·(${v}−${fmt(a, 3)})².`,
        data: { value: g(a), first: d1, second: d2, integral: area, critical: crit },
        viz: { type: 'function', lo: Number(from), hi: Number(to), samples: Array.from({ length: 200 }, (_, i) => { const x = Number(from) + ((Number(to) - Number(from)) * i) / 199; return { x, y: g(x) }; }), roots: crit.map((c) => c.x) },
      };
    },
  },

  {
    id: 'math.linalg',
    name: 'Linear Algebra',
    category: 'mathematics',
    summary: 'Determinant, inverse, rank-safe solve, transpose, product and symmetric eigendecomposition.',
    tags: ['matrix', 'linear algebra', 'determinant', 'inverse', 'eigen', 'solve system'],
    params: [
      { name: 'A', type: 'matrix', required: true, description: 'matrix rows, e.g. "4 1; 2 3"' },
      { name: 'b', type: 'numbers', default: '', description: 'right-hand side for Ax=b' },
      { name: 'B', type: 'matrix', default: '', description: 'second matrix for the product' },
    ],
    match: (m) => (/\b(matrix|matrices|determinant|eigen|inverse of|linear system)\b/i.test(m) ? 3 : 0),
    run: ({ A, b, B }) => {
      const M = matrix(A);
      const n = M.length;
      const square = M.every((r) => r.length === n);
      const out = [`## Linear algebra — ${n}×${M[0].length} matrix\n`];
      out.push(`$$A = \\begin{bmatrix} ${M.map((r) => r.map((v) => fmt(v, 4)).join(' & ')).join(' \\\\ ')} \\end{bmatrix}$$\n`);
      const data = {};
      if (square) {
        const det = mat.det(M);
        data.det = det;
        out.push(`**det(A) = ${fmt(det, 6)}** ${Math.abs(det) < 1e-12 ? '→ singular: no unique inverse or solution.' : '→ non-singular.'}`);
        const trace = M.reduce((a, r, i) => a + r[i], 0);
        out.push(`**trace(A) = ${fmt(trace, 6)}**\n`);
        if (Math.abs(det) > 1e-12) {
          const inv = mat.inverse(M);
          data.inverse = inv;
          out.push(`**A⁻¹**\n${table(inv[0].map((_, j) => `c${j + 1}`), inv.map((r) => r.map((v) => fmt(v, 5))))}\n`);
        }
        const sym = M.every((r, i) => r.every((v, j) => Math.abs(v - M[j][i]) < 1e-9));
        if (sym) {
          const e = mat.eigSym(M);
          data.eigenvalues = e.values;
          out.push(`**Eigenvalues (symmetric):** ${e.values.map((v) => fmt(v, 5)).join(', ')}`);
          out.push(`**Condition number:** ${fmt(Math.abs(e.values[0] / e.values[e.values.length - 1]), 4)} ${Math.abs(e.values[0] / e.values[e.values.length - 1]) > 1000 ? '→ ill-conditioned; solutions are numerically fragile.' : ''}`);
          out.push(`**Definiteness:** ${e.values.every((v) => v > 1e-10) ? 'positive definite' : e.values.every((v) => v >= -1e-10) ? 'positive semi-definite' : e.values.every((v) => v < 0) ? 'negative definite' : 'indefinite'}\n`);
        }
      }
      if (b) {
        const bv = numbers(b);
        const x = mat.solve(M, bv);
        data.solution = x;
        out.push(`**Solution of Ax = b** with b = [${bv.map((v) => fmt(v, 4)).join(', ')}]\n\n${table(['Variable', 'Value'], x.map((v, i) => [`x${i + 1}`, fmt(v, 8)]))}\n`);
        const resid = M.map((r, i) => r.reduce((s, v, j) => s + v * x[j], 0) - bv[i]);
        out.push(`Residual ‖Ax − b‖∞ = ${fmt(Math.max(...resid.map(Math.abs)), 12)}\n`);
      }
      if (B) {
        const M2 = matrix(B);
        const P = mat.mul(M, M2);
        data.product = P;
        out.push(`**A·B**\n${table(P[0].map((_, j) => `c${j + 1}`), P.map((r) => r.map((v) => fmt(v, 5))))}\n`);
      }
      return { markdown: out.join('\n'), data };
    },
  },

  {
    id: 'math.ode',
    name: 'ODE Integrator (RK4)',
    category: 'mathematics',
    summary: 'Solves dy/dx = f(x, y) with classic Runge–Kutta and reports the trajectory.',
    tags: ['ode', 'differential equation', 'runge-kutta', 'dynamics', 'simulate'],
    params: [
      { name: 'f', type: 'string', required: true, description: 'right-hand side in x and y, e.g. "-0.5*y + sin(x)"' },
      { name: 'y0', type: 'number', default: 1, description: 'initial condition y(x0)' },
      { name: 'x0', type: 'number', default: 0, description: 'start' },
      { name: 'x1', type: 'number', default: 10, description: 'end' },
      { name: 'steps', type: 'number', default: 500, description: 'integration steps' },
    ],
    match: (m) => (/\b(ode|differential equation|dy\/dx|runge|kutta|dynamical system)\b/i.test(m) ? 3 : 0),
    run: ({ f, y0 = 1, x0 = 0, x1 = 10, steps = 500 }) => {
      const fn = compileExpr(f);
      const rhs = (x, y) => fn({ x, y, t: x });
      const r = rk4(rhs, Number(x0), Number(y0), Number(x1), Number(steps));
      const trace = r.trace;
      const sample = trace.filter((_, i) => i % Math.max(1, Math.floor(trace.length / 10)) === 0);
      return {
        markdown: `## ODE solution — dy/dx = \`${f}\`, y(${x0}) = ${y0}

**y(${x1}) = ${fmt(r.y, 8)}**

${table(['x', 'y'], sample.map((p) => [fmt(p.x, 4), fmt(p.y, 6)]))}

**Qualitative behaviour.** ${Math.abs(r.y) > Math.abs(Number(y0)) * 10 ? 'The solution grows rapidly — check for stiffness and reduce the step size.' : Math.abs(r.y) < Math.abs(Number(y0)) * 0.1 ? 'The solution decays toward an attractor.' : 'The solution remains bounded on this interval.'} RK4 has local error O(h⁵); with ${steps} steps h = ${fmt((Number(x1) - Number(x0)) / Number(steps), 6)}. Halve h and compare: if the answer moves in the 6th digit, the integration has converged.`,
        data: { final: r.y, trace: trace.map((p) => ({ x: p.x, y: p.y })) },
        viz: { type: 'line', points: trace.map((p) => ({ x: p.x, y: p.y })) },
      };
    },
  },

  {
    id: 'math.optimize',
    name: 'Optimiser',
    category: 'mathematics',
    summary: 'Finds minima/maxima of an expression by golden-section search plus gradient refinement.',
    tags: ['optimi', 'minimum', 'maximum', 'argmin', 'best value'],
    params: [
      { name: 'expression', type: 'string', required: true, description: 'objective f(x)' },
      { name: 'lo', type: 'number', default: -10, description: 'lower bound' },
      { name: 'hi', type: 'number', default: 10, description: 'upper bound' },
      { name: 'goal', type: 'string', default: 'min', description: 'min | max' },
    ],
    match: (m) => (/\b(optimi[sz]|minimi[sz]|maximi[sz]|best value of|argmin|argmax)\b/i.test(m) ? 3 : 0),
    run: ({ expression, lo = -10, hi = 10, goal = 'min' }) => {
      const f = compileExpr(expression);
      const v = [...f.variables][0] || 'x';
      const sign = goal === 'max' ? -1 : 1;
      const g = (x) => sign * f({ [v]: x });
      // multi-start golden section
      const starts = 12;
      let best = { x: NaN, y: Infinity };
      const gr = (Math.sqrt(5) - 1) / 2;
      for (let s = 0; s < starts; s++) {
        let a = Number(lo) + ((Number(hi) - Number(lo)) * s) / starts;
        let b = Number(lo) + ((Number(hi) - Number(lo)) * (s + 1)) / starts;
        let c = b - gr * (b - a);
        let d = a + gr * (b - a);
        for (let i = 0; i < 200; i++) {
          if (g(c) < g(d)) b = d; else a = c;
          c = b - gr * (b - a);
          d = a + gr * (b - a);
        }
        const x = (a + b) / 2;
        const y = g(x);
        if (y < best.y) best = { x, y };
      }
      const trueY = sign * best.y;
      const curv = derivative((x) => derivative(g, x), best.x);
      return {
        markdown: `## ${goal === 'max' ? 'Maximisation' : 'Minimisation'} of \`${expression}\` on [${lo}, ${hi}]

**Optimum:** ${v}* = **${fmt(best.x, 8)}**, f(${v}*) = **${fmt(trueY, 8)}**

${table(['Diagnostic', 'Value', 'Reading'], [
  ["f'(x*)", fmt(derivative((x) => f({ [v]: x }), best.x), 8), 'should be ≈ 0 for an interior optimum'],
  ["f''(x*)", fmt(curv, 6), curv > 0 ? 'strict local optimum (curvature confirms)' : 'flat or saddle — verify with a plot'],
  ['Boundary f(lo)', fmt(f({ [v]: Number(lo) }), 6), 'compare — the optimum may be on the boundary'],
  ['Boundary f(hi)', fmt(f({ [v]: Number(hi) }), 6), ''],
])}

Multi-start golden-section search (12 restarts) was used, so a non-convex objective is unlikely to have trapped the result in the first basin — but for highly oscillatory functions confirm visually.`,
        data: { x: best.x, value: trueY },
        viz: { type: 'function', lo: Number(lo), hi: Number(hi), samples: Array.from({ length: 200 }, (_, i) => { const x = Number(lo) + ((Number(hi) - Number(lo)) * i) / 199; return { x, y: f({ [v]: x }) }; }), roots: [best.x] },
      };
    },
  },

  {
    id: 'math.units',
    name: 'Unit Converter',
    category: 'utility',
    summary: 'Converts across length, mass, time, energy, data, pressure, angle and temperature.',
    tags: ['convert', 'unit', 'units', 'metric', 'imperial'],
    params: [
      { name: 'value', type: 'number', required: true, description: 'magnitude' },
      { name: 'from', type: 'string', required: true, description: 'source unit' },
      { name: 'to', type: 'string', required: true, description: 'target unit' },
    ],
    match: (m) => (/\bconvert\b|\b\d+\s*(km|kg|lb|mi|ft|mb|gb|kwh|°?[cf])\b.*\bto\b/i.test(m) ? 2.5 : 0),
    run: ({ value, from, to }) => {
      const v = Number(value);
      const f = String(from).toLowerCase().replace(/[°\s]/g, '');
      const t = String(to).toLowerCase().replace(/[°\s]/g, '');
      const temps = { c: 1, f: 1, k: 1, celsius: 1, fahrenheit: 1, kelvin: 1 };
      if (temps[f] && temps[t]) {
        const toC = f.startsWith('c') ? v : f.startsWith('f') ? (v - 32) * (5 / 9) : v - 273.15;
        const out = t.startsWith('c') ? toC : t.startsWith('f') ? toC * (9 / 5) + 32 : toC + 273.15;
        return { markdown: `## ${v} °${from.toUpperCase()} = **${fmt(out, 6)} °${to.toUpperCase()}**\n\nAbsolute zero check: ${toC < -273.15 ? '⚠️ below absolute zero — verify the input.' : 'physical.'}`, data: { value: out } };
      }
      for (const [dim, tblu] of Object.entries(UNITS)) {
        if (tblu[f] !== undefined && tblu[t] !== undefined) {
          const out = (v * tblu[f]) / tblu[t];
          const others = Object.entries(tblu).filter(([k]) => k !== f && k !== t).slice(0, 6)
            .map(([k, s]) => [k, fmt((v * tblu[f]) / s, 6)]);
          return {
            markdown: `## ${v} ${from} = **${fmt(out, 8)} ${to}**  _(${dim})_\n\n**Also equals**\n${table(['Unit', 'Value'], others)}\n\nConversion factor: 1 ${from} = ${fmt(tblu[f] / tblu[t], 8)} ${to}`,
            data: { value: out, dimension: dim },
          };
        }
      }
      throw new Error(`no shared dimension for "${from}" → "${to}". Known units: ${Object.entries(UNITS).map(([d, u]) => `${d}: ${Object.keys(u).join('/')}`).join(' · ')}`);
    },
  },

  {
    id: 'math.combinatorics',
    name: 'Combinatorics & Probability',
    category: 'mathematics',
    summary: 'Permutations, combinations, binomial/Poisson probabilities and birthday-style collision odds.',
    tags: ['combination', 'permutation', 'binomial', 'probability', 'factorial', 'poisson'],
    params: [
      { name: 'n', type: 'number', required: true, description: 'population size / trials' },
      { name: 'k', type: 'number', required: true, description: 'chosen / successes' },
      { name: 'p', type: 'number', default: 0.5, description: 'success probability' },
    ],
    match: (m) => (/\b(combination|permutation|n choose k|binomial|poisson|probability of exactly)\b/i.test(m) ? 2.5 : 0),
    run: ({ n, k, p = 0.5 }) => {
      const N = Number(n);
      const K = Number(k);
      const P = Number(p);
      const nCk = Math.round(factorial(N) / (factorial(K) * factorial(N - K)));
      const nPk = Math.round(factorial(N) / factorial(N - K));
      const binom = nCk * Math.pow(P, K) * Math.pow(1 - P, N - K);
      let cum = 0;
      for (let i = 0; i <= K; i++) cum += (factorial(N) / (factorial(i) * factorial(N - i))) * Math.pow(P, i) * Math.pow(1 - P, N - i);
      const lambda = N * P;
      const pois = (Math.pow(lambda, K) * Math.exp(-lambda)) / factorial(K);
      const collision = 1 - Math.exp(-(K * (K - 1)) / (2 * N));
      return {
        markdown: `## Combinatorics — n = ${N}, k = ${K}, p = ${P}

${table(['Quantity', 'Value', 'Meaning'], [
  ['C(n,k)', nCk.toLocaleString(), 'unordered selections'],
  ['P(n,k)', nPk.toLocaleString(), 'ordered arrangements'],
  ['n!', N <= 170 ? factorial(N).toExponential(6) : '∞ (overflow)', 'total orderings'],
  ['Binomial P(X = k)', fmt(binom, 8), `exactly ${K} successes in ${N} trials`],
  ['Binomial P(X ≤ k)', fmt(cum, 8), 'cumulative'],
  ['Binomial P(X ≥ k)', fmt(1 - cum + binom, 8), 'upper tail'],
  ['Mean / SD', `${fmt(N * P, 4)} / ${fmt(Math.sqrt(N * P * (1 - P)), 4)}`, 'binomial moments'],
  ['Poisson P(X = k), λ=np', fmt(pois, 8), 'rare-event approximation'],
  ['Collision probability', fmt(collision, 6), `≥1 shared value among ${K} draws from ${N} slots (birthday problem)`],
])}

${N * P >= 5 && N * (1 - P) >= 5 ? '✅ Normal approximation is acceptable (np and n(1−p) ≥ 5).' : '⚠️ Normal approximation is not safe here — use exact binomial probabilities.'}`,
        data: { nCk, nPk, binomial: binom, cumulative: cum, poisson: pois },
      };
    },
  },

  {
    id: 'math.special',
    name: 'Special Functions',
    category: 'mathematics',
    summary: 'Gamma, log-gamma, beta, error function and their statistical interpretations.',
    tags: ['gamma', 'beta function', 'erf', 'special function'],
    params: [
      { name: 'x', type: 'number', required: true, description: 'argument' },
      { name: 'y', type: 'number', default: 1, description: 'second argument for Beta(x,y)' },
    ],
    match: (m) => (/\b(gamma function|erf|error function|beta function)\b/i.test(m) ? 2.5 : 0),
    run: ({ x, y = 1 }) => {
      const X = Number(x);
      const Y = Number(y);
      const betaF = (gammaFn(X) * gammaFn(Y)) / gammaFn(X + Y);
      return {
        markdown: `## Special functions at x = ${fmt(X, 6)}\n\n${table(['Function', 'Value', 'Note'], [
          ['Γ(x)', fmt(gammaFn(X), 8), 'generalised factorial: Γ(n) = (n−1)!'],
          ['ln Γ(x)', fmt(Math.log(Math.abs(gammaFn(X))), 8), 'used to keep likelihoods numerically stable'],
          [`B(${fmt(X, 3)}, ${fmt(Y, 3)})`, fmt(betaF, 8), 'normalising constant of the Beta distribution'],
          ['erf(x)', fmt(erf(X), 8), 'P(|Z| ≤ x√2) for a standard normal'],
          ['erfc(x)', fmt(1 - erf(X), 8), 'complementary tail'],
          ['Φ(x) (normal CDF)', fmt(0.5 * (1 + erf(X / Math.SQRT2)), 8), 'standard normal cumulative'],
        ])}`,
        data: { gamma: gammaFn(X), beta: betaF, erf: erf(X) },
      };
    },
  },
];
