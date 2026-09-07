/**
 * statscore.js — distributions and inference implemented from first principles:
 * incomplete beta / gamma via continued fractions, Student t, chi-square, F,
 * normal quantiles, correlation, OLS, bootstrap, and power analysis.
 */
import { lgamma, erf } from './mathcore.js';

export const SQRT2 = Math.SQRT2;

/* ------------------------------ core cdfs ------------------------------- */

export function normalPdf(x, mu = 0, sd = 1) {
  const z = (x - mu) / sd;
  return Math.exp(-0.5 * z * z) / (sd * Math.sqrt(2 * Math.PI));
}

export function normalCdf(x, mu = 0, sd = 1) {
  return 0.5 * (1 + erf((x - mu) / (sd * SQRT2)));
}

/** Acklam's inverse normal CDF, refined with one Halley step. */
export function normalInv(p, mu = 0, sd = 1) {
  if (p <= 0) return -Infinity;
  if (p >= 1) return Infinity;
  const a = [-3.969683028665376e+01, 2.209460984245205e+02, -2.759285104469687e+02, 1.383577518672690e+02, -3.066479806614716e+01, 2.506628277459239e+00];
  const b = [-5.447609879822406e+01, 1.615858368580409e+02, -1.556989798598866e+02, 6.680131188771972e+01, -1.328068155288572e+01];
  const c = [-7.784894002430293e-03, -3.223964580411365e-01, -2.400758277161838e+00, -2.549732539343734e+00, 4.374664141464968e+00, 2.938163982698783e+00];
  const d = [7.784695709041462e-03, 3.224671290700398e-01, 2.445134137142996e+00, 3.754408661907416e+00];
  const pl = 0.02425;
  let x;
  if (p < pl) {
    const q = Math.sqrt(-2 * Math.log(p));
    x = (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  } else if (p <= 1 - pl) {
    const q = p - 0.5;
    const r = q * q;
    x = (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
  } else {
    const q = Math.sqrt(-2 * Math.log(1 - p));
    x = -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
  const e = normalCdf(x) - p;
  const u = e * Math.sqrt(2 * Math.PI) * Math.exp((x * x) / 2);
  x -= u / (1 + (x * u) / 2);
  return mu + sd * x;
}

/** Regularised incomplete beta I_x(a,b) — Lentz continued fraction. */
export function incBeta(x, a, b) {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const lbeta = lgamma(a) + lgamma(b) - lgamma(a + b);
  const front = Math.exp(Math.log(x) * a + Math.log(1 - x) * b - lbeta) / a;
  const useComplement = x > (a + 1) / (a + b + 2);
  if (useComplement) return 1 - incBeta(1 - x, b, a);
  let f = 1, c = 1, d = 0;
  for (let i = 0; i <= 300; i++) {
    const m = Math.floor(i / 2);
    let numerator;
    if (i === 0) numerator = 1;
    else if (i % 2 === 0) numerator = (m * (b - m) * x) / ((a + 2 * m - 1) * (a + 2 * m));
    else numerator = -((a + m) * (a + b + m) * x) / ((a + 2 * m) * (a + 2 * m + 1));
    d = 1 + numerator * d;
    if (Math.abs(d) < 1e-30) d = 1e-30;
    d = 1 / d;
    c = 1 + numerator / c;
    if (Math.abs(c) < 1e-30) c = 1e-30;
    const cd = c * d;
    f *= cd;
    if (Math.abs(1 - cd) < 1e-12) break;
  }
  return front * (f - 1);
}

/** Regularised lower incomplete gamma P(a,x). */
export function incGamma(a, x) {
  if (x <= 0) return 0;
  if (x < a + 1) {
    let sum = 1 / a;
    let term = sum;
    for (let n = 1; n < 400; n++) {
      term *= x / (a + n);
      sum += term;
      if (Math.abs(term) < Math.abs(sum) * 1e-14) break;
    }
    return sum * Math.exp(-x + a * Math.log(x) - lgamma(a));
  }
  let b = x + 1 - a;
  let c = 1e30;
  let d = 1 / b;
  let h = d;
  for (let i = 1; i < 400; i++) {
    const an = -i * (i - a);
    b += 2;
    d = an * d + b;
    if (Math.abs(d) < 1e-30) d = 1e-30;
    c = b + an / c;
    if (Math.abs(c) < 1e-30) c = 1e-30;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < 1e-14) break;
  }
  return 1 - Math.exp(-x + a * Math.log(x) - lgamma(a)) * h;
}

export function tCdf(t, df) {
  const x = df / (df + t * t);
  const p = 0.5 * incBeta(x, df / 2, 0.5);
  return t > 0 ? 1 - p : p;
}

export function tInv(p, df) {
  let lo = -100, hi = 100;
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    if (tCdf(mid, df) < p) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}

export const chi2Cdf = (x, df) => incGamma(df / 2, x / 2);
export const chi2Sf = (x, df) => 1 - chi2Cdf(x, df);
export function fCdf(f, d1, d2) {
  if (f <= 0) return 0;
  return incBeta((d1 * f) / (d1 * f + d2), d1 / 2, d2 / 2);
}
export const fSf = (f, d1, d2) => 1 - fCdf(f, d1, d2);

/* ---------------------------- descriptives ------------------------------ */

export function describe(xs) {
  const x = xs.filter((v) => Number.isFinite(v)).slice().sort((a, b) => a - b);
  const n = x.length;
  if (!n) return null;
  const sum = x.reduce((a, b) => a + b, 0);
  const mean = sum / n;
  let m2 = 0, m3 = 0, m4 = 0;
  for (const v of x) {
    const d = v - mean;
    m2 += d * d; m3 += d ** 3; m4 += d ** 4;
  }
  const variance = n > 1 ? m2 / (n - 1) : 0;
  const sd = Math.sqrt(variance);
  const q = (p) => {
    const h = (n - 1) * p;
    const lo = Math.floor(h);
    const hi = Math.ceil(h);
    return x[lo] + (h - lo) * (x[hi] - x[lo]);
  };
  const iqr = q(0.75) - q(0.25);
  return {
    n,
    sum,
    mean,
    median: q(0.5),
    min: x[0],
    max: x[n - 1],
    range: x[n - 1] - x[0],
    variance,
    sd,
    se: sd / Math.sqrt(n),
    cv: mean !== 0 ? sd / Math.abs(mean) : null,
    q1: q(0.25),
    q3: q(0.75),
    iqr,
    skewness: sd > 0 ? (m3 / n) / Math.pow(m2 / n, 1.5) : 0,
    kurtosis: sd > 0 ? (m4 / n) / Math.pow(m2 / n, 2) - 3 : 0,
    outliers: x.filter((v) => v < q(0.25) - 1.5 * iqr || v > q(0.75) + 1.5 * iqr),
    ci95: [mean - 1.959964 * (sd / Math.sqrt(n)), mean + 1.959964 * (sd / Math.sqrt(n))],
    sorted: x,
  };
}

export function histogram(xs, bins = 12) {
  const x = xs.filter(Number.isFinite);
  if (!x.length) return [];
  const min = Math.min(...x);
  const max = Math.max(...x);
  const w = (max - min) / bins || 1;
  const out = Array.from({ length: bins }, (_, i) => ({ x0: min + i * w, x1: min + (i + 1) * w, count: 0 }));
  for (const v of x) {
    let i = Math.floor((v - min) / w);
    if (i >= bins) i = bins - 1;
    if (i < 0) i = 0;
    out[i].count++;
  }
  return out;
}

/* ------------------------------- tests ---------------------------------- */

export function oneSampleT(xs, mu0 = 0) {
  const d = describe(xs);
  const t = (d.mean - mu0) / d.se;
  const df = d.n - 1;
  const p = 2 * (1 - tCdf(Math.abs(t), df));
  const crit = tInv(0.975, df);
  return {
    test: 'One-sample t-test', n: d.n, mean: d.mean, mu0, sd: d.sd, se: d.se, t, df, p,
    ci95: [d.mean - crit * d.se, d.mean + crit * d.se],
    cohensD: (d.mean - mu0) / d.sd,
  };
}

export function twoSampleT(a, b, { welch = true, paired = false } = {}) {
  if (paired) {
    if (a.length !== b.length) throw new Error('paired test requires equal-length samples');
    const diffs = a.map((v, i) => v - b[i]);
    const r = oneSampleT(diffs, 0);
    return { ...r, test: 'Paired t-test', meanDifference: r.mean };
  }
  const A = describe(a);
  const B = describe(b);
  const diff = A.mean - B.mean;
  let se, df;
  if (welch) {
    se = Math.sqrt(A.variance / A.n + B.variance / B.n);
    df = Math.pow(A.variance / A.n + B.variance / B.n, 2)
      / (Math.pow(A.variance / A.n, 2) / (A.n - 1) + Math.pow(B.variance / B.n, 2) / (B.n - 1));
  } else {
    const sp2 = ((A.n - 1) * A.variance + (B.n - 1) * B.variance) / (A.n + B.n - 2);
    se = Math.sqrt(sp2 * (1 / A.n + 1 / B.n));
    df = A.n + B.n - 2;
  }
  const t = diff / se;
  const p = 2 * (1 - tCdf(Math.abs(t), df));
  const sp = Math.sqrt(((A.n - 1) * A.variance + (B.n - 1) * B.variance) / (A.n + B.n - 2));
  const crit = tInv(0.975, df);
  const d = diff / sp;
  const J = 1 - 3 / (4 * (A.n + B.n) - 9);
  return {
    test: welch ? "Welch's two-sample t-test" : "Student's two-sample t-test",
    groupA: { n: A.n, mean: A.mean, sd: A.sd },
    groupB: { n: B.n, mean: B.mean, sd: B.sd },
    meanDifference: diff, se, t, df, p,
    ci95: [diff - crit * se, diff + crit * se],
    cohensD: d,
    hedgesG: d * J,
  };
}

export function pearson(x, y) {
  const n = Math.min(x.length, y.length);
  const mx = x.reduce((a, b) => a + b, 0) / n;
  const my = y.reduce((a, b) => a + b, 0) / n;
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < n; i++) {
    const dx = x[i] - mx;
    const dy = y[i] - my;
    sxy += dx * dy; sxx += dx * dx; syy += dy * dy;
  }
  const r = sxy / Math.sqrt(sxx * syy);
  const df = n - 2;
  const t = r * Math.sqrt(df / (1 - r * r));
  const p = 2 * (1 - tCdf(Math.abs(t), df));
  const z = 0.5 * Math.log((1 + r) / (1 - r));
  const sez = 1 / Math.sqrt(n - 3);
  const ci = [Math.tanh(z - 1.959964 * sez), Math.tanh(z + 1.959964 * sez)];
  return { r, r2: r * r, n, df, t, p, ci95: ci, fisherZ: z };
}

export function spearman(x, y) {
  const rank = (arr) => {
    const idx = arr.map((v, i) => [v, i]).sort((a, b) => a[0] - b[0]);
    const r = new Array(arr.length);
    let i = 0;
    while (i < idx.length) {
      let j = i;
      while (j + 1 < idx.length && idx[j + 1][0] === idx[i][0]) j++;
      const avg = (i + j) / 2 + 1;
      for (let k = i; k <= j; k++) r[idx[k][1]] = avg;
      i = j + 1;
    }
    return r;
  };
  return { ...pearson(rank(x), rank(y)), test: 'Spearman rank correlation' };
}

export function chiSquare(table) {
  const rows = table.length;
  const cols = table[0].length;
  const rowSums = table.map((r) => r.reduce((a, b) => a + b, 0));
  const colSums = Array.from({ length: cols }, (_, j) => table.reduce((a, r) => a + r[j], 0));
  const total = rowSums.reduce((a, b) => a + b, 0);
  let chi2 = 0;
  const expected = [];
  for (let i = 0; i < rows; i++) {
    expected.push([]);
    for (let j = 0; j < cols; j++) {
      const e = (rowSums[i] * colSums[j]) / total;
      expected[i].push(e);
      chi2 += Math.pow(table[i][j] - e, 2) / e;
    }
  }
  const df = (rows - 1) * (cols - 1);
  const p = chi2Sf(chi2, df);
  const cramersV = Math.sqrt(chi2 / (total * Math.min(rows - 1, cols - 1)));
  return { test: 'Chi-square test of independence', chi2, df, p, expected, total, cramersV, minExpected: Math.min(...expected.flat()) };
}

export function anovaOneWay(groups) {
  const k = groups.length;
  const all = groups.flat();
  const N = all.length;
  const grand = all.reduce((a, b) => a + b, 0) / N;
  let ssb = 0, ssw = 0;
  const summary = groups.map((g) => {
    const m = g.reduce((a, b) => a + b, 0) / g.length;
    ssb += g.length * Math.pow(m - grand, 2);
    for (const v of g) ssw += Math.pow(v - m, 2);
    return { n: g.length, mean: m, sd: Math.sqrt(g.reduce((a, b) => a + (b - m) ** 2, 0) / Math.max(1, g.length - 1)) };
  });
  const dfb = k - 1;
  const dfw = N - k;
  const msb = ssb / dfb;
  const msw = ssw / dfw;
  const F = msb / msw;
  return {
    test: 'One-way ANOVA', groups: summary, F, dfBetween: dfb, dfWithin: dfw,
    p: fSf(F, dfb, dfw), etaSquared: ssb / (ssb + ssw),
    omegaSquared: (ssb - dfb * msw) / (ssb + ssw + msw), ssb, ssw, grandMean: grand,
  };
}

export function mannWhitney(a, b) {
  const all = [...a.map((v) => ({ v, g: 0 })), ...b.map((v) => ({ v, g: 1 }))].sort((p, q) => p.v - q.v);
  let i = 0;
  const ranks = new Array(all.length);
  while (i < all.length) {
    let j = i;
    while (j + 1 < all.length && all[j + 1].v === all[i].v) j++;
    const avg = (i + j) / 2 + 1;
    for (let k = i; k <= j; k++) ranks[k] = avg;
    i = j + 1;
  }
  let R1 = 0;
  all.forEach((o, idx) => { if (o.g === 0) R1 += ranks[idx]; });
  const n1 = a.length, n2 = b.length;
  const U1 = R1 - (n1 * (n1 + 1)) / 2;
  const U2 = n1 * n2 - U1;
  const U = Math.min(U1, U2);
  const mu = (n1 * n2) / 2;
  const sigma = Math.sqrt((n1 * n2 * (n1 + n2 + 1)) / 12);
  const z = (U - mu + 0.5) / sigma;
  return { test: 'Mann–Whitney U', U, U1, U2, z, p: 2 * normalCdf(-Math.abs(z)), rankBiserial: 1 - (2 * U) / (n1 * n2) };
}

/* ----------------------------- regression -------------------------------- */

export function ols(X, y, names = null) {
  // X: array of rows WITHOUT intercept
  const n = y.length;
  const p = X[0].length;
  const Xd = X.map((r) => [1, ...r]);
  const XtX = Array.from({ length: p + 1 }, (_, i) => Array.from({ length: p + 1 }, (_, j) => {
    let s = 0;
    for (let k = 0; k < n; k++) s += Xd[k][i] * Xd[k][j];
    return s;
  }));
  const Xty = Array.from({ length: p + 1 }, (_, i) => {
    let s = 0;
    for (let k = 0; k < n; k++) s += Xd[k][i] * y[k];
    return s;
  });
  // gaussian solve with inverse for standard errors
  const inv = (function invert(A) {
    const m = A.length;
    const M = A.map((r, i) => [...r, ...Array.from({ length: m }, (_, j) => (i === j ? 1 : 0))]);
    for (let i = 0; i < m; i++) {
      let piv = i;
      for (let r = i + 1; r < m; r++) if (Math.abs(M[r][i]) > Math.abs(M[piv][i])) piv = r;
      if (Math.abs(M[piv][i]) < 1e-12) throw new Error('design matrix is singular (perfect collinearity?)');
      [M[i], M[piv]] = [M[piv], M[i]];
      const d = M[i][i];
      for (let c = 0; c < 2 * m; c++) M[i][c] /= d;
      for (let r = 0; r < m; r++) {
        if (r === i) continue;
        const f = M[r][i];
        if (!f) continue;
        for (let c = 0; c < 2 * m; c++) M[r][c] -= f * M[i][c];
      }
    }
    return M.map((r) => r.slice(m));
  })(XtX);
  const beta = inv.map((row) => row.reduce((s, v, j) => s + v * Xty[j], 0));
  const fitted = Xd.map((r) => r.reduce((s, v, j) => s + v * beta[j], 0));
  const resid = y.map((v, i) => v - fitted[i]);
  const ybar = y.reduce((a, b) => a + b, 0) / n;
  const ssTot = y.reduce((a, b) => a + (b - ybar) ** 2, 0);
  const ssRes = resid.reduce((a, b) => a + b * b, 0);
  const dfRes = n - p - 1;
  const sigma2 = ssRes / dfRes;
  const se = inv.map((row, i) => Math.sqrt(sigma2 * row[i]));
  const r2 = 1 - ssRes / ssTot;
  const adjR2 = 1 - (1 - r2) * ((n - 1) / dfRes);
  const F = ((ssTot - ssRes) / p) / sigma2;
  const labels = ['(intercept)', ...(names || Array.from({ length: p }, (_, i) => `x${i + 1}`))];
  const crit = tInv(0.975, dfRes);
  const coefficients = beta.map((b, i) => {
    const t = b / se[i];
    return {
      name: labels[i], estimate: b, se: se[i], t, p: 2 * (1 - tCdf(Math.abs(t), dfRes)),
      ci95: [b - crit * se[i], b + crit * se[i]],
    };
  });
  // Durbin-Watson for autocorrelation
  let dwNum = 0;
  for (let i = 1; i < n; i++) dwNum += (resid[i] - resid[i - 1]) ** 2;
  return {
    n, p, coefficients, r2, adjR2, F, dfModel: p, dfResid: dfRes,
    pF: fSf(F, p, dfRes), sigma: Math.sqrt(sigma2), fitted, resid,
    aic: n * Math.log(ssRes / n) + 2 * (p + 1),
    bic: n * Math.log(ssRes / n) + Math.log(n) * (p + 1),
    durbinWatson: dwNum / ssRes,
    rmse: Math.sqrt(ssRes / n),
  };
}

/* ------------------------------- power ----------------------------------- */

export function powerTwoSample({ d, n, alpha = 0.05, tails = 2 }) {
  const ncp = d * Math.sqrt(n / 2);
  const crit = normalInv(1 - alpha / tails);
  return 1 - normalCdf(crit - ncp) + (tails === 2 ? normalCdf(-crit - ncp) : 0);
}

export function sampleSizeTwoSample({ d, power = 0.8, alpha = 0.05, tails = 2 }) {
  const za = normalInv(1 - alpha / tails);
  const zb = normalInv(power);
  const n = (2 * Math.pow(za + zb, 2)) / (d * d);
  return Math.ceil(n);
}

/* ------------------------------ resampling -------------------------------- */

export function bootstrapCI(xs, stat = (a) => a.reduce((p, c) => p + c, 0) / a.length, { reps = 2000, alpha = 0.05, rng } = {}) {
  const rand = rng || (() => Math.random());
  const n = xs.length;
  const dist = new Array(reps);
  for (let r = 0; r < reps; r++) {
    const sample = new Array(n);
    for (let i = 0; i < n; i++) sample[i] = xs[Math.floor(rand() * n)];
    dist[r] = stat(sample);
  }
  dist.sort((a, b) => a - b);
  return {
    estimate: stat(xs),
    ci: [dist[Math.floor((alpha / 2) * reps)], dist[Math.floor((1 - alpha / 2) * reps) - 1]],
    seBoot: Math.sqrt(dist.reduce((a, b) => a + (b - dist.reduce((p, c) => p + c, 0) / reps) ** 2, 0) / (reps - 1)),
    reps,
    dist,
  };
}

export function benjaminiHochberg(ps, q = 0.05) {
  const idx = ps.map((p, i) => ({ p, i })).sort((a, b) => a.p - b.p);
  const m = ps.length;
  let maxK = -1;
  idx.forEach((o, k) => { if (o.p <= ((k + 1) / m) * q) maxK = k; });
  const rejected = new Set(idx.slice(0, maxK + 1).map((o) => o.i));
  const adjusted = new Array(m);
  let prev = 1;
  for (let k = m - 1; k >= 0; k--) {
    prev = Math.min(prev, (m / (k + 1)) * idx[k].p);
    adjusted[idx[k].i] = Math.min(1, prev);
  }
  return { rejected: [...rejected].sort((a, b) => a - b), adjusted, threshold: maxK >= 0 ? idx[maxK].p : 0 };
}

/** Beta-Binomial conjugate update. */
export function betaBinomial({ successes, trials, priorA = 1, priorB = 1 }) {
  const a = priorA + successes;
  const b = priorB + trials - successes;
  const mean = a / (a + b);
  const varr = (a * b) / (Math.pow(a + b, 2) * (a + b + 1));
  // credible interval via bisection on the beta cdf (= incBeta)
  const quant = (p) => {
    let lo = 0, hi = 1;
    for (let i = 0; i < 200; i++) {
      const m = (lo + hi) / 2;
      if (incBeta(m, a, b) < p) lo = m; else hi = m;
    }
    return (lo + hi) / 2;
  };
  return {
    posterior: { alpha: a, beta: b }, mean, sd: Math.sqrt(varr),
    mode: a > 1 && b > 1 ? (a - 1) / (a + b - 2) : null,
    ci95: [quant(0.025), quant(0.975)],
    probGreaterThanHalf: 1 - incBeta(0.5, a, b),
  };
}

/** BIC-approximated Bayes factor from a t statistic (Wagenmakers 2007). */
export function bayesFactorFromT(t, n) {
  const bic = n * Math.log(1 + (t * t) / (n - 1)) - Math.log(n);
  return { bf01: Math.exp(bic / 2), bf10: Math.exp(-bic / 2) };
}
