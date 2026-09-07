/**
 * skills.stats.js — inferential statistics as first-class skills.
 */
import { table, fmt, pval, numbers, matrix, parseTable } from './registry.js';
import {
  describe, histogram, oneSampleT, twoSampleT, pearson, spearman, chiSquare, anovaOneWay,
  mannWhitney, ols, powerTwoSample, sampleSizeTwoSample, bootstrapCI, benjaminiHochberg,
  betaBinomial, bayesFactorFromT, normalCdf, normalInv, normalPdf, tCdf, chi2Sf, fSf,
} from './statscore.js';

const sparkline = (counts) => {
  const chars = '▁▂▃▄▅▆▇█';
  const max = Math.max(...counts, 1);
  return counts.map((c) => chars[Math.min(7, Math.round((c / max) * 7))]).join('');
};

const interpretP = (p) => (p < 0.001 ? 'very strong evidence against the null model'
  : p < 0.01 ? 'strong evidence against the null model'
    : p < 0.05 ? 'moderate evidence against the null model'
      : p < 0.1 ? 'weak / ambiguous evidence' : 'no evidence against the null model');

const dLabel = (d) => {
  const a = Math.abs(d);
  return a < 0.2 ? 'negligible' : a < 0.5 ? 'small' : a < 0.8 ? 'medium' : a < 1.2 ? 'large' : 'very large';
};

export default [
  {
    id: 'stats.describe',
    name: 'Descriptive Statistics',
    category: 'statistics',
    summary: 'Full univariate summary: moments, quantiles, outliers, CI, distribution shape and a histogram.',
    tags: ['describe', 'mean', 'median', 'sd', 'summary', 'distribution'],
    params: [{ name: 'data', type: 'numbers', required: true, description: 'numeric sample' }],
    match: (m) => (/\b(mean|median|standard deviation|describe|summar(y|ise) (the )?data|quartile|variance)\b/i.test(m) ? 2.5 : 0),
    run: ({ data }) => {
      const x = numbers(data);
      if (x.length < 2) throw new Error('need at least 2 numeric values');
      const d = describe(x);
      const h = histogram(x, Math.min(16, Math.max(6, Math.round(Math.sqrt(x.length)))));
      const shape = Math.abs(d.skewness) < 0.5 ? 'approximately symmetric' : d.skewness > 0 ? 'right-skewed' : 'left-skewed';
      const tails = d.kurtosis > 1 ? 'heavy-tailed' : d.kurtosis < -1 ? 'light-tailed / platykurtic' : 'mesokurtic';
      return {
        markdown: `## Descriptive statistics (n = ${d.n})

${table(['Statistic', 'Value', 'Statistic', 'Value'], [
  ['Mean', fmt(d.mean), 'Median', fmt(d.median)],
  ['SD', fmt(d.sd), 'Variance', fmt(d.variance)],
  ['SE of mean', fmt(d.se), '95% CI of mean', `[${fmt(d.ci95[0])}, ${fmt(d.ci95[1])}]`],
  ['Min / Max', `${fmt(d.min)} / ${fmt(d.max)}`, 'Range', fmt(d.range)],
  ['Q1 / Q3', `${fmt(d.q1)} / ${fmt(d.q3)}`, 'IQR', fmt(d.iqr)],
  ['Skewness', fmt(d.skewness, 3), 'Excess kurtosis', fmt(d.kurtosis, 3)],
  ['CV', d.cv === null ? '—' : fmt(d.cv, 3), 'Sum', fmt(d.sum)],
])}

**Distribution:** ${shape}, ${tails}.
\`${sparkline(h.map((b) => b.count))}\`  (${fmt(d.min, 2)} → ${fmt(d.max, 2)})

${d.outliers.length ? `**Tukey outliers (${d.outliers.length}):** ${d.outliers.map((o) => fmt(o)).join(', ')}. Decide *before* analysis whether the exclusion rule was pre-specified.` : '**No Tukey-fence outliers.**'}

> Reporting note: with n = ${d.n}, the mean is estimated to ±${fmt(1.96 * d.se, 3)} at 95% confidence. ${d.n < 30 ? 'Small n — prefer the t-interval shown above and consider a bootstrap.' : 'n is adequate for CLT-based intervals unless the tails are extreme.'}`,
        data: { ...d, sorted: undefined, histogram: h },
        viz: { type: 'histogram', bins: h, mean: d.mean, median: d.median, ci: d.ci95 },
      };
    },
  },

  {
    id: 'stats.ttest',
    name: 't-test (one / two sample, paired, Welch)',
    category: 'statistics',
    summary: 'Compares means with effect sizes, intervals, Bayes factor and an interpretation paragraph.',
    tags: ['t-test', 'ttest', 'compare means', 'welch', 'paired', 'significance'],
    params: [
      { name: 'a', type: 'numbers', required: true, description: 'first sample' },
      { name: 'b', type: 'numbers', default: '', description: 'second sample (omit for one-sample)' },
      { name: 'mu', type: 'number', default: 0, description: 'null value for one-sample test' },
      { name: 'paired', type: 'boolean', default: false, description: 'paired samples' },
      { name: 'welch', type: 'boolean', default: true, description: 'do not assume equal variances' },
    ],
    match: (m) => (/\b(t.?test|compare (the )?(two )?(groups|means)|significant difference)\b/i.test(m) ? 3 : 0),
    run: ({ a, b, mu = 0, paired = false, welch = true }) => {
      const A = numbers(a);
      const B = b ? numbers(b) : [];
      const r = B.length ? twoSampleT(A, B, { welch: welch !== false && !paired, paired: !!paired }) : oneSampleT(A, Number(mu) || 0);
      const bf = bayesFactorFromT(r.t, B.length ? A.length + B.length : A.length);
      const d = r.cohensD;
      return {
        markdown: `## ${r.test}

${B.length ? table(['Group', 'n', 'Mean', 'SD'], [
    ['A', r.groupA?.n ?? A.length, fmt(r.groupA?.mean ?? 0), fmt(r.groupA?.sd ?? 0)],
    ['B', r.groupB?.n ?? B.length, fmt(r.groupB?.mean ?? 0), fmt(r.groupB?.sd ?? 0)],
  ]) : table(['n', 'Mean', 'SD', 'Null μ₀'], [[r.n, fmt(r.mean), fmt(r.sd), fmt(r.mu0)]])}

${table(['Quantity', 'Value'], [
  ['t', fmt(r.t, 4)],
  ['df', fmt(r.df, 2)],
  ['p (two-tailed)', pval(r.p)],
  [B.length ? 'Mean difference' : 'Mean − μ₀', fmt(r.meanDifference ?? r.mean - r.mu0)],
  ['95% CI of difference', `[${fmt(r.ci95[0])}, ${fmt(r.ci95[1])}]`],
  ["Cohen's d", `${fmt(d, 3)} (${dLabel(d)})`],
  ...(r.hedgesG !== undefined ? [["Hedges' g", fmt(r.hedgesG, 3)]] : []),
  ['BF₁₀ (BIC approx.)', fmt(bf.bf10, 3)],
])}

**Interpretation.** The data provide ${interpretP(r.p)} (p ${pval(r.p)}). The estimated difference is ${fmt(r.meanDifference ?? r.mean - r.mu0)} with a 95% interval of [${fmt(r.ci95[0])}, ${fmt(r.ci95[1])}] — the interval, not the p-value, is what bounds the practical conclusion. Standardised magnitude is **${dLabel(d)}** (d = ${fmt(d, 2)}). The approximate Bayes factor of ${fmt(bf.bf10, 2)} means the data are ${bf.bf10 > 1 ? `${fmt(bf.bf10, 1)}× more likely under the alternative` : `${fmt(bf.bf01, 1)}× more likely under the null`}.

> Assumption check: ${B.length && !paired ? `Welch's correction ${welch !== false ? 'is applied, so unequal variances are handled' : 'is off — verify variance homogeneity'}.` : 'Paired/one-sample tests assume the differences are approximately normal; with small n inspect a QQ-plot or use a permutation test.'}`,
        data: { ...r, bayesFactor: bf },
        viz: { type: 'meanCompare', a: A, b: B, ci: r.ci95 },
      };
    },
  },

  {
    id: 'stats.anova',
    name: 'One-way ANOVA',
    category: 'statistics',
    summary: 'Compares 3+ group means with F, η², ω² and post-hoc guidance.',
    tags: ['anova', 'groups', 'f-test', 'variance'],
    params: [{ name: 'groups', type: 'matrix', required: true, description: 'rows = groups, e.g. "1 2 3; 4 5 6; 7 8 9"' }],
    match: (m) => (/\banova|three groups|multiple groups|f.?test\b/i.test(m) ? 3 : 0),
    run: ({ groups }) => {
      const g = matrix(groups).filter((r) => r.length > 1);
      if (g.length < 2) throw new Error('need at least 2 groups (rows separated by ";")');
      const r = anovaOneWay(g);
      return {
        markdown: `## One-way ANOVA (k = ${g.length})

${table(['Group', 'n', 'Mean', 'SD'], r.groups.map((s, i) => [`G${i + 1}`, s.n, fmt(s.mean), fmt(s.sd)]))}

${table(['Source', 'SS', 'df', 'MS', 'F', 'p'], [
  ['Between', fmt(r.ssb), r.dfBetween, fmt(r.ssb / r.dfBetween), fmt(r.F, 3), pval(r.p)],
  ['Within', fmt(r.ssw), r.dfWithin, fmt(r.ssw / r.dfWithin), '', ''],
])}

- **η² = ${fmt(r.etaSquared, 3)}** (proportion of variance between groups, biased upward in small samples)
- **ω² = ${fmt(r.omegaSquared, 3)}** (less biased — report this one)
- Grand mean = ${fmt(r.grandMean)}

**Interpretation.** ${interpretP(r.p)}. An omnibus F only says *some* difference exists; it does not identify which pair. Follow with pre-specified contrasts (not all pairwise comparisons) and control the family-wise error rate with Holm, or the FDR with Benjamini–Hochberg if the comparisons are exploratory.

> Assumptions: independence, approximately normal residuals, homogeneous variances. With unequal n and unequal variances prefer Welch's ANOVA.`,
        data: r,
      };
    },
  },

  {
    id: 'stats.correlation',
    name: 'Correlation (Pearson & Spearman)',
    category: 'statistics',
    summary: 'Linear and rank correlation with Fisher-z intervals, plus an anti-causal caution.',
    tags: ['correlation', 'pearson', 'spearman', 'association', 'r'],
    params: [
      { name: 'x', type: 'numbers', required: true, description: 'first variable' },
      { name: 'y', type: 'numbers', required: true, description: 'second variable' },
    ],
    match: (m) => (/\bcorrelat|associat|relationship between|scatter\b/i.test(m) ? 2.5 : 0),
    run: ({ x, y }) => {
      const X = numbers(x);
      const Y = numbers(y);
      if (X.length !== Y.length) throw new Error(`x and y must have equal length (${X.length} vs ${Y.length})`);
      const p = pearson(X, Y);
      const s = spearman(X, Y);
      const strength = Math.abs(p.r) < 0.1 ? 'negligible' : Math.abs(p.r) < 0.3 ? 'weak' : Math.abs(p.r) < 0.5 ? 'moderate' : Math.abs(p.r) < 0.7 ? 'strong' : 'very strong';
      return {
        markdown: `## Correlation analysis (n = ${p.n})

${table(['Coefficient', 'Estimate', '95% CI', 't', 'p'], [
  ['Pearson r', fmt(p.r, 4), `[${fmt(p.ci95[0], 3)}, ${fmt(p.ci95[1], 3)}]`, fmt(p.t, 3), pval(p.p)],
  ['Spearman ρ', fmt(s.r, 4), `[${fmt(s.ci95[0], 3)}, ${fmt(s.ci95[1], 3)}]`, fmt(s.t, 3), pval(s.p)],
])}

- **r² = ${fmt(p.r2, 3)}** — ${(p.r2 * 100).toFixed(1)}% of the variance is shared.
- Relationship strength: **${strength}**, direction ${p.r >= 0 ? 'positive' : 'negative'}.
- Pearson vs Spearman gap: ${fmt(Math.abs(p.r - s.r), 3)} ${Math.abs(p.r - s.r) > 0.1 ? '→ non-linearity or influential points are likely; inspect the scatter.' : '→ consistent, so monotonic and linear structure agree.'}

**Caution.** ${interpretP(p.p)}, but a correlation identifies no causal direction and no absence of a common cause. Before writing a causal sentence, name the assumed graph, the adjustment set, and the design feature that blocks the back door.

> With n = ${p.n}, the interval width is ${fmt(p.ci95[1] - p.ci95[0], 3)}; correlations need roughly n ≥ 250 before the estimate stabilises.`,
        data: { pearson: p, spearman: s },
        viz: { type: 'scatter', x: X, y: Y, r: p.r },
      };
    },
  },

  {
    id: 'stats.regression',
    name: 'OLS Regression',
    category: 'statistics',
    summary: 'Multiple linear regression with coefficient table, diagnostics, AIC/BIC and Durbin–Watson.',
    tags: ['regression', 'ols', 'linear model', 'predict', 'coefficients'],
    params: [
      { name: 'y', type: 'numbers', required: true, description: 'outcome vector' },
      { name: 'X', type: 'matrix', required: true, description: 'predictor rows, e.g. "1 2; 3 4; 5 6"' },
      { name: 'names', type: 'string', default: '', description: 'comma-separated predictor names' },
    ],
    match: (m) => (/\bregress|ols|linear model|predict .* from|beta coefficient\b/i.test(m) ? 3 : 0),
    run: ({ y, X, names = '' }) => {
      const Y = numbers(y);
      const M = matrix(X);
      if (M.length !== Y.length) throw new Error(`X has ${M.length} rows but y has ${Y.length} values`);
      const nm = names ? String(names).split(',').map((s) => s.trim()) : null;
      const r = ols(M, Y, nm);
      const sig = r.coefficients.filter((c) => c.p < 0.05 && c.name !== '(intercept)');
      return {
        markdown: `## OLS regression — n = ${r.n}, p = ${r.p}

${table(['Term', 'Estimate', 'SE', 't', 'p', '95% CI'], r.coefficients.map((c) => [
  `\`${c.name}\``, fmt(c.estimate), fmt(c.se), fmt(c.t, 3), pval(c.p), `[${fmt(c.ci95[0], 3)}, ${fmt(c.ci95[1], 3)}]`,
]))}

${table(['Fit', 'Value', 'Fit', 'Value'], [
  ['R²', fmt(r.r2, 4), 'Adj. R²', fmt(r.adjR2, 4)],
  ['F', `${fmt(r.F, 3)} (${r.dfModel}, ${r.dfResid})`, 'p(F)', pval(r.pF)],
  ['Residual SE', fmt(r.sigma), 'RMSE', fmt(r.rmse)],
  ['AIC', fmt(r.aic, 2), 'BIC', fmt(r.bic, 2)],
  ['Durbin–Watson', fmt(r.durbinWatson, 3), 'df resid', r.dfResid],
])}

**Reading the model.** The model explains ${(r.r2 * 100).toFixed(1)}% of the variance (adjusted ${(r.adjR2 * 100).toFixed(1)}%), and the omnibus F-test gives p ${pval(r.pF)}. ${sig.length ? `Coefficients reliably distinguishable from zero: ${sig.map((c) => `\`${c.name}\` (${fmt(c.estimate, 3)})`).join(', ')}.` : 'No slope is reliably distinguishable from zero at α = 0.05.'}

**Diagnostics.** Durbin–Watson = ${fmt(r.durbinWatson, 2)} ${r.durbinWatson < 1.5 ? '→ positive residual autocorrelation; standard errors are too small.' : r.durbinWatson > 2.5 ? '→ negative autocorrelation; check the ordering of observations.' : '→ no strong autocorrelation.'} ${r.n < 10 * (r.p + 1) ? `⚠️ Only ${(r.n / (r.p + 1)).toFixed(1)} observations per parameter — the fit is unstable; regularise or reduce predictors.` : 'Observations-per-parameter ratio is acceptable.'}

> A coefficient is a conditional association. It becomes a causal effect only under an identification argument the regression itself cannot supply.`,
        data: { ...r, fitted: r.fitted.slice(0, 200), resid: r.resid.slice(0, 200) },
        viz: { type: 'residuals', fitted: r.fitted, resid: r.resid },
      };
    },
  },

  {
    id: 'stats.chisq',
    name: 'Chi-square / Contingency',
    category: 'statistics',
    summary: 'Test of independence with expected counts, Cramér’s V and small-cell warnings.',
    tags: ['chi-square', 'chisq', 'contingency', 'categorical', 'independence'],
    params: [{ name: 'table', type: 'matrix', required: true, description: 'contingency table rows, e.g. "10 20; 30 40"' }],
    match: (m) => (/\bchi.?squ|contingency|categorical (data|test)|cross.?tab\b/i.test(m) ? 3 : 0),
    run: ({ table: t }) => {
      const T = matrix(t);
      const r = chiSquare(T);
      return {
        markdown: `## Chi-square test of independence

**Observed**
${table(T[0].map((_, j) => `C${j + 1}`), T.map((row) => row.map((v) => String(v))))}

**Expected under independence**
${table(T[0].map((_, j) => `C${j + 1}`), r.expected.map((row) => row.map((v) => fmt(v, 2))))}

${table(['Quantity', 'Value'], [
  ['χ²', fmt(r.chi2, 4)], ['df', r.df], ['p', pval(r.p)], ['N', r.total],
  ["Cramér's V", `${fmt(r.cramersV, 3)} (${r.cramersV < 0.1 ? 'negligible' : r.cramersV < 0.3 ? 'small' : r.cramersV < 0.5 ? 'medium' : 'large'})`],
  ['Min expected count', fmt(r.minExpected, 2)],
])}

**Interpretation.** ${interpretP(r.p)}. Association strength (Cramér's V) is ${fmt(r.cramersV, 2)}.
${r.minExpected < 5 ? `⚠️ **Minimum expected count is ${fmt(r.minExpected, 2)} (< 5)** — the χ² approximation is unreliable. Use Fisher's exact test or collapse categories with a pre-specified rule.` : '✅ All expected counts ≥ 5, so the asymptotic approximation is acceptable.'}

> Standardised residuals identify *where* the association lives; report them rather than only the omnibus statistic.`,
        data: r,
      };
    },
  },

  {
    id: 'stats.nonparametric',
    name: 'Mann–Whitney U',
    category: 'statistics',
    summary: 'Distribution-free comparison of two samples with rank-biserial effect size.',
    tags: ['nonparametric', 'mann-whitney', 'wilcoxon', 'rank', 'skewed'],
    params: [
      { name: 'a', type: 'numbers', required: true, description: 'sample A' },
      { name: 'b', type: 'numbers', required: true, description: 'sample B' },
    ],
    match: (m) => (/\b(mann.?whitney|wilcoxon|non.?parametric|rank test|skewed data)\b/i.test(m) ? 3 : 0),
    run: ({ a, b }) => {
      const r = mannWhitney(numbers(a), numbers(b));
      return {
        markdown: `## Mann–Whitney U test

${table(['Quantity', 'Value'], [
  ['U', fmt(r.U, 2)], ['U₁ / U₂', `${fmt(r.U1, 1)} / ${fmt(r.U2, 1)}`],
  ['z (continuity corrected)', fmt(r.z, 3)], ['p (two-tailed)', pval(r.p)],
  ['Rank-biserial r', `${fmt(r.rankBiserial, 3)} (${dLabel(r.rankBiserial * 2)})`],
])}

**Interpretation.** ${interpretP(r.p)}. The rank-biserial correlation of ${fmt(r.rankBiserial, 2)} means that in ${((r.rankBiserial + 1) / 2 * 100).toFixed(0)}% of random cross-group pairs the first sample scores higher.

> Mann–Whitney tests stochastic dominance, not means. If the shapes differ, a "significant" result may reflect a spread difference rather than a location shift.`,
        data: r,
      };
    },
  },

  {
    id: 'stats.power',
    name: 'Power & Sample Size',
    category: 'statistics',
    summary: 'Power curve, required n, and the type-M exaggeration factor for underpowered designs.',
    tags: ['power', 'sample size', 'n', 'design', 'alpha', 'beta'],
    params: [
      { name: 'd', type: 'number', required: true, description: "Cohen's d (smallest effect of interest)" },
      { name: 'n', type: 'number', default: 0, description: 'per-group n (0 = solve for n)' },
      { name: 'power', type: 'number', default: 0.8, description: 'target power' },
      { name: 'alpha', type: 'number', default: 0.05, description: 'significance level' },
    ],
    match: (m) => (/\b(power analysis|sample size|how many (participants|subjects|samples)|statistical power)\b/i.test(m) ? 3.5 : 0),
    run: ({ d, n = 0, power = 0.8, alpha = 0.05 }) => {
      const D = Number(d);
      const A = Number(alpha) || 0.05;
      const needed = sampleSizeTwoSample({ d: D, power: Number(power) || 0.8, alpha: A });
      const curve = [10, 20, 30, 50, 75, 100, 150, 200, 300, 500].map((nn) => ({ n: nn, power: powerTwoSample({ d: D, n: nn, alpha: A }) }));
      const actual = n > 0 ? powerTwoSample({ d: D, n: Number(n), alpha: A }) : null;
      // type M: expected |estimate| given significance / true effect
      const typeM = (nn) => {
        const se = Math.sqrt(2 / nn);
        const crit = normalInv(1 - A / 2) * se;
        const num = D * (1 - normalCdf((crit - D) / se)) + se * normalPdf((crit - D) / se) + (D * normalCdf((-crit - D) / se) - se * normalPdf((-crit - D) / se)) * -1;
        const pr = 1 - normalCdf((crit - D) / se) + normalCdf((-crit - D) / se);
        return Math.abs(num / pr / D);
      };
      return {
        markdown: `## Power analysis — two-group comparison

**Target:** detect d = ${fmt(D, 3)} at α = ${A}, power = ${fmt(Number(power) || 0.8, 2)}
**Required n = ${needed} per group  (${needed * 2} total)**

${actual !== null ? `**Your design:** n = ${n} per group → power = **${(actual * 100).toFixed(1)}%**${actual < 0.5 ? ` ⚠️ Under 50% power: a significant result would be exaggerated by roughly **${typeM(Number(n)).toFixed(1)}×** (type-M error), and the sign can be wrong (type-S).` : actual < 0.8 ? ' — below the conventional 80% floor.' : ' — adequately powered.'}\n` : ''}
### Power curve
${table(['n / group', 'Power', ''], curve.map((c) => [c.n, `${(c.power * 100).toFixed(1)}%`, '█'.repeat(Math.round(c.power * 20)).padEnd(20, '·')]))}

### How to choose d honestly
1. **Do not** use the pilot estimate — it is noisy and biased upward.
2. Use the smallest effect that would change a decision (SESOI), derived from cost, benefit or theory.
3. If no SESOI exists, run an **equivalence test** against a bound you can defend, or a precision-based design that fixes the CI width instead of power.

> Rule of thumb: halving the detectable effect size quadruples the required sample.`,
        data: { requiredN: needed, curve, actualPower: actual },
        viz: { type: 'powerCurve', curve },
      };
    },
  },

  {
    id: 'stats.bayes',
    name: 'Bayesian Update',
    category: 'statistics',
    summary: 'Beta-binomial conjugate updating, credible intervals and diagnostic Bayes rule for tests.',
    tags: ['bayes', 'posterior', 'prior', 'credible interval', 'diagnostic'],
    params: [
      { name: 'successes', type: 'number', required: true, description: 'observed successes' },
      { name: 'trials', type: 'number', required: true, description: 'number of trials' },
      { name: 'priorA', type: 'number', default: 1, description: 'Beta prior α' },
      { name: 'priorB', type: 'number', default: 1, description: 'Beta prior β' },
    ],
    match: (m) => (/\bbayes|posterior|prior|credible interval|update (my )?belief\b/i.test(m) ? 3 : 0),
    run: ({ successes, trials, priorA = 1, priorB = 1 }) => {
      const r = betaBinomial({
        successes: Number(successes), trials: Number(trials),
        priorA: Number(priorA) || 1, priorB: Number(priorB) || 1,
      });
      const mle = Number(successes) / Number(trials);
      return {
        markdown: `## Bayesian update — Beta–Binomial

**Prior:** Beta(${priorA}, ${priorB})  →  **Data:** ${successes}/${trials}  →  **Posterior:** Beta(${fmt(r.posterior.alpha, 2)}, ${fmt(r.posterior.beta, 2)})

${table(['Quantity', 'Value'], [
  ['Posterior mean', fmt(r.mean, 4)],
  ['Posterior mode (MAP)', r.mode === null ? '—' : fmt(r.mode, 4)],
  ['Posterior SD', fmt(r.sd, 4)],
  ['95% credible interval', `[${fmt(r.ci95[0], 4)}, ${fmt(r.ci95[1], 4)}]`],
  ['P(θ > 0.5 | data)', fmt(r.probGreaterThanHalf, 4)],
  ['Maximum likelihood estimate', fmt(mle, 4)],
  ['Shrinkage toward prior', fmt(Math.abs(mle - r.mean), 4)],
])}

**Interpretation.** Given the prior and the data, there is a 95% probability that θ lies in [${fmt(r.ci95[0], 3)}, ${fmt(r.ci95[1], 3)}] — this is the statement people mistakenly attribute to confidence intervals. The posterior pulled the raw rate of ${fmt(mle, 3)} toward the prior by ${fmt(Math.abs(mle - r.mean), 4)}; with more data that shrinkage shrinks.

### Sensitivity to the prior
| Prior | Posterior mean | 95% CrI |
| --- | --- | --- |
${[[1, 1, 'uniform'], [0.5, 0.5, 'Jeffreys'], [2, 2, 'weakly sceptical'], [10, 10, 'strongly sceptical']].map(([a, b, label]) => {
  const alt = betaBinomial({ successes: Number(successes), trials: Number(trials), priorA: a, priorB: b });
  return `| Beta(${a},${b}) — ${label} | ${fmt(alt.mean, 4)} | [${fmt(alt.ci95[0], 3)}, ${fmt(alt.ci95[1], 3)}] |`;
}).join('\n')}

> If the conclusion flips across this table, the data are not driving it — say so explicitly in the paper.`,
        data: r,
        viz: { type: 'beta', alpha: r.posterior.alpha, beta: r.posterior.beta, ci: r.ci95 },
      };
    },
  },

  {
    id: 'stats.multiplicity',
    name: 'Multiple Comparison Control',
    category: 'statistics',
    summary: 'Bonferroni, Holm and Benjamini–Hochberg adjustment of a p-value family.',
    tags: ['multiple comparisons', 'fdr', 'bonferroni', 'holm', 'correction'],
    params: [
      { name: 'pvalues', type: 'numbers', required: true, description: 'family of p-values' },
      { name: 'q', type: 'number', default: 0.05, description: 'FDR level / alpha' },
    ],
    match: (m) => (/\b(multiple compar|bonferroni|fdr|false discovery|holm|correct(ion|ed) p)\b/i.test(m) ? 3 : 0),
    run: ({ pvalues, q = 0.05 }) => {
      const ps = numbers(pvalues).filter((p) => p >= 0 && p <= 1);
      const m = ps.length;
      const Q = Number(q) || 0.05;
      const bh = benjaminiHochberg(ps, Q);
      const bonf = ps.map((p) => Math.min(1, p * m));
      const order = ps.map((p, i) => ({ p, i })).sort((a, b) => a.p - b.p);
      const holm = new Array(m);
      let running = 0;
      order.forEach((o, k) => {
        running = Math.max(running, Math.min(1, (m - k) * o.p));
        holm[o.i] = running;
      });
      return {
        markdown: `## Multiplicity control (m = ${m}, level = ${Q})

${table(['#', 'raw p', 'Bonferroni', 'Holm', 'BH (FDR)', 'BH reject?'], ps.map((p, i) => [
  i + 1, fmt(p, 5), fmt(bonf[i], 5), fmt(holm[i], 5), fmt(bh.adjusted[i], 5), bh.rejected.includes(i) ? '✅' : '—',
]))}

- Uncorrected discoveries at α=${Q}: **${ps.filter((p) => p < Q).length}**
- Holm (FWER) discoveries: **${holm.filter((p) => p < Q).length}**
- Benjamini–Hochberg (FDR) discoveries: **${bh.rejected.length}**
- Expected false positives with no correction: **${fmt(m * Q, 2)}**

**Which to use.** Control the FWER (Holm — uniformly better than Bonferroni) when any single false positive is costly, e.g. confirmatory primary outcomes. Control the FDR (BH) in exploratory screens where a known fraction of false leads is tolerable. Neither procedure repairs hypotheses invented after seeing the data.`,
        data: { bh, bonferroni: bonf, holm },
      };
    },
  },

  {
    id: 'stats.bootstrap',
    name: 'Bootstrap & Permutation',
    category: 'statistics',
    summary: 'Resampling CI for the mean/median plus an exact-ish permutation test between groups.',
    tags: ['bootstrap', 'permutation', 'resampling', 'nonparametric', 'ci'],
    params: [
      { name: 'a', type: 'numbers', required: true, description: 'sample A' },
      { name: 'b', type: 'numbers', default: '', description: 'sample B (enables permutation test)' },
      { name: 'reps', type: 'number', default: 4000, description: 'resamples' },
      { name: 'statistic', type: 'string', default: 'mean', description: 'mean | median' },
    ],
    match: (m) => (/\b(bootstrap|permutation|resampl|randomi[sz]ation test)\b/i.test(m) ? 3 : 0),
    run: ({ a, b, reps = 4000, statistic = 'mean' }) => {
      const A = numbers(a);
      const B = b ? numbers(b) : [];
      let seed = 987654321;
      const rand = () => {
        seed = (seed * 1103515245 + 12345) & 0x7fffffff;
        return seed / 0x7fffffff;
      };
      const stat = statistic === 'median'
        ? (xs) => { const s = xs.slice().sort((p, q) => p - q); const n = s.length; return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2; }
        : (xs) => xs.reduce((p, c) => p + c, 0) / xs.length;
      const boot = bootstrapCI(A, stat, { reps: Number(reps), rng: rand });
      let perm = null;
      if (B.length) {
        const obs = stat(A) - stat(B);
        const pool = [...A, ...B];
        let extreme = 0;
        const R = Number(reps);
        for (let r = 0; r < R; r++) {
          const shuffled = pool.slice();
          for (let i = shuffled.length - 1; i > 0; i--) {
            const j = Math.floor(rand() * (i + 1));
            [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
          }
          const diff = stat(shuffled.slice(0, A.length)) - stat(shuffled.slice(A.length));
          if (Math.abs(diff) >= Math.abs(obs)) extreme++;
        }
        perm = { observed: obs, p: (extreme + 1) / (R + 1), reps: R };
      }
      return {
        markdown: `## Resampling inference (${reps} replicates)

**Bootstrap ${statistic} of A**
${table(['Estimate', '95% percentile CI', 'Bootstrap SE'], [[fmt(boot.estimate), `[${fmt(boot.ci[0])}, ${fmt(boot.ci[1])}]`, fmt(boot.seBoot)]])}

${perm ? `**Permutation test A vs B**
${table(['Observed difference', 'p (two-tailed)', 'Replicates'], [[fmt(perm.observed), pval(perm.p), perm.reps]])}

The permutation p-value makes no distributional assumption: it is the exact proportion of random relabelings that produce a difference at least as extreme as the observed one. ${interpretP(perm.p)}.` : '_Provide sample B to run a permutation test._'}

> Percentile intervals are adequate when the bootstrap distribution is roughly symmetric; use BCa when it is skewed or the statistic is biased.`,
        data: { bootstrap: { ...boot, dist: undefined }, permutation: perm },
        viz: { type: 'bootstrap', dist: boot.dist.filter((_, i) => i % 4 === 0), ci: boot.ci, estimate: boot.estimate },
      };
    },
  },

  {
    id: 'stats.distribution',
    name: 'Distribution Calculator',
    category: 'statistics',
    summary: 'PDF/CDF/quantiles for normal, t, chi-square and F, with tail-probability reasoning.',
    tags: ['distribution', 'normal', 'z-score', 'quantile', 'cdf', 'critical value'],
    params: [
      { name: 'dist', type: 'string', required: true, description: 'normal | t | chi2 | f' },
      { name: 'x', type: 'number', required: true, description: 'value (or probability if mode=quantile)' },
      { name: 'df', type: 'number', default: 10, description: 'degrees of freedom (df1 for F)' },
      { name: 'df2', type: 'number', default: 10, description: 'second df for F' },
      { name: 'mode', type: 'string', default: 'cdf', description: 'cdf | pdf | quantile' },
    ],
    match: (m) => (/\b(z.?score|critical value|p.?value from|cdf|percentile of|quantile)\b/i.test(m) ? 2.5 : 0),
    run: ({ dist, x, df = 10, df2 = 10, mode = 'cdf' }) => {
      const X = Number(x);
      const d1 = Number(df);
      const d2 = Number(df2);
      const D = String(dist).toLowerCase();
      let rows = [];
      if (D.startsWith('n')) {
        rows = [
          ['P(X ≤ x)', fmt(normalCdf(X), 6)], ['P(X > x)', fmt(1 - normalCdf(X), 6)],
          ['Two-tailed p', fmt(2 * (1 - normalCdf(Math.abs(X))), 6)], ['pdf(x)', fmt(normalPdf(X), 6)],
          ['Quantile for p=x', Math.abs(X) <= 1 ? fmt(normalInv(X), 6) : '—'],
        ];
      } else if (D.startsWith('t')) {
        rows = [
          [`P(T ≤ ${fmt(X, 3)} | df=${d1})`, fmt(tCdf(X, d1), 6)],
          ['One-tailed p', fmt(1 - tCdf(Math.abs(X), d1), 6)],
          ['Two-tailed p', fmt(2 * (1 - tCdf(Math.abs(X), d1)), 6)],
        ];
      } else if (D.startsWith('c') || D.includes('χ')) {
        rows = [[`P(χ² ≤ ${fmt(X, 3)} | df=${d1})`, fmt(1 - chi2Sf(X, d1), 6)], ['Upper tail p', fmt(chi2Sf(X, d1), 6)]];
      } else {
        rows = [[`P(F ≤ ${fmt(X, 3)} | ${d1},${d2})`, fmt(1 - fSf(X, d1, d2), 6)], ['Upper tail p', fmt(fSf(X, d1, d2), 6)]];
      }
      return {
        markdown: `## ${D} distribution — x = ${fmt(X, 4)}${D.startsWith('n') ? '' : `, df = ${d1}${D.startsWith('f') ? `, ${d2}` : ''}`}\n\n${table(['Quantity', 'Value'], rows)}\n\n**Common critical values (two-tailed)**\n${table(['α', 'z', `t(${d1})`], [['0.10', fmt(normalInv(0.95), 3), fmt(-1 * (function () { let lo = -50, hi = 50; for (let i = 0; i < 200; i++) { const m = (lo + hi) / 2; if (tCdf(m, d1) < 0.05) lo = m; else hi = m; } return (lo + hi) / 2; })(), 3)], ['0.05', fmt(normalInv(0.975), 3), fmt(-1 * (function () { let lo = -50, hi = 50; for (let i = 0; i < 200; i++) { const m = (lo + hi) / 2; if (tCdf(m, d1) < 0.025) lo = m; else hi = m; } return (lo + hi) / 2; })(), 3)], ['0.01', fmt(normalInv(0.995), 3), fmt(-1 * (function () { let lo = -50, hi = 50; for (let i = 0; i < 200; i++) { const m = (lo + hi) / 2; if (tCdf(m, d1) < 0.005) lo = m; else hi = m; } return (lo + hi) / 2; })(), 3)]])}`,
        data: { dist: D, x: X, rows },
      };
    },
  },

  {
    id: 'stats.montecarlo',
    name: 'Monte Carlo Simulator',
    category: 'statistics',
    summary: 'Simulates a design or estimator to recover its sampling distribution, bias and coverage.',
    tags: ['monte carlo', 'simulation', 'coverage', 'bias', 'simulate'],
    params: [
      { name: 'trueEffect', type: 'number', default: 0.3, description: 'true standardised effect' },
      { name: 'n', type: 'number', default: 50, description: 'per-group n' },
      { name: 'sims', type: 'number', default: 2000, description: 'simulations' },
      { name: 'alpha', type: 'number', default: 0.05, description: 'alpha' },
    ],
    match: (m) => (/\b(monte carlo|simulat|what if i ran)\b/i.test(m) ? 2.5 : 0),
    run: ({ trueEffect = 0.3, n = 50, sims = 2000, alpha = 0.05 }) => {
      const D = Number(trueEffect);
      const N = Number(n);
      const S = Math.min(20000, Number(sims));
      const A = Number(alpha);
      let seed = 424242;
      const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
      const norm = () => {
        let u = 0, v = 0, s = 0;
        do { u = rnd() * 2 - 1; v = rnd() * 2 - 1; s = u * u + v * v; } while (s >= 1 || s === 0);
        return u * Math.sqrt((-2 * Math.log(s)) / s);
      };
      let sig = 0, covered = 0, signErrors = 0;
      const estimates = [];
      const sigEstimates = [];
      for (let s = 0; s < S; s++) {
        let sa = 0, sb = 0, ssa = 0, ssb = 0;
        for (let i = 0; i < N; i++) {
          const a = norm() + D;
          const b = norm();
          sa += a; ssa += a * a; sb += b; ssb += b * b;
        }
        const ma = sa / N, mb = sb / N;
        const va = (ssa - N * ma * ma) / (N - 1);
        const vb = (ssb - N * mb * mb) / (N - 1);
        const se = Math.sqrt(va / N + vb / N);
        const diff = ma - mb;
        estimates.push(diff);
        const crit = 1.96;
        const lo = diff - crit * se;
        const hi = diff + crit * se;
        if (D >= lo && D <= hi) covered++;
        if (Math.abs(diff / se) > normalInv(1 - A / 2)) {
          sig++;
          sigEstimates.push(diff);
          if (Math.sign(diff) !== Math.sign(D) && D !== 0) signErrors++;
        }
      }
      const mean = estimates.reduce((p, c) => p + c, 0) / S;
      const typeM = sigEstimates.length ? (sigEstimates.reduce((p, c) => p + Math.abs(c), 0) / sigEstimates.length) / Math.abs(D || 1) : NaN;
      return {
        markdown: `## Monte Carlo — ${S.toLocaleString()} simulated studies

**Data-generating process:** two groups, n = ${N} each, true standardised difference δ = ${fmt(D, 3)}, α = ${A}.

${table(['Property', 'Value', 'Meaning'], [
  ['Empirical power', `${((sig / S) * 100).toFixed(1)}%`, 'proportion of studies reaching significance'],
  ['Mean estimate', fmt(mean, 4), `bias = ${fmt(mean - D, 4)}`],
  ['CI coverage', `${((covered / S) * 100).toFixed(1)}%`, 'should be ≈ 95%'],
  ['Type-M (exaggeration)', Number.isFinite(typeM) ? `${typeM.toFixed(2)}×` : '—', 'average inflation among *significant* results'],
  ['Type-S (sign error)', sig ? `${((signErrors / sig) * 100).toFixed(2)}%` : '—', 'significant results with the wrong sign'],
])}

**What this shows.** ${sig / S < 0.5 ? `At this sample size the design finds the effect less than half the time, and the studies that *do* reach significance overstate it by about ${Number.isFinite(typeM) ? typeM.toFixed(1) : '?'}×. Publishing only significant results from designs like this generates a literature of inflated effects.` : 'The design is adequately powered; significant estimates are close to unbiased.'}

> Run this before collecting data, not after. Simulation is the cheapest form of peer review.`,
        data: { power: sig / S, coverage: covered / S, meanEstimate: mean, typeM, typeS: sig ? signErrors / sig : 0 },
        viz: { type: 'histogram', bins: histogram(estimates, 24).map((b) => b), mean, median: mean, ci: [D, D] },
      };
    },
  },
];
