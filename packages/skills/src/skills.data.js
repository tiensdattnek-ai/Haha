/**
 * skills.data.js — data wrangling, code execution, graphs and utilities.
 */
import { table, fmt, pval, numbers, matrix, parseTable, bar } from './registry.js';
import { describe, pearson, ols, histogram } from './statscore.js';

export default [
  {
    id: 'data.csv',
    name: 'Dataset Profiler',
    category: 'data',
    summary: 'Parses CSV/TSV, profiles every column, finds correlations and flags data-quality issues.',
    tags: ['csv', 'dataset', 'data', 'columns', 'profile', 'eda'],
    params: [{ name: 'csv', type: 'string', required: true, description: 'CSV/TSV text with a header row' }],
    match: (m) => (/\b(csv|dataset|data ?frame|columns?|my data)\b/i.test(m) ? 2.5 : 0),
    run: ({ csv }) => {
      const t = parseTable(csv);
      const numeric = t.columns.filter((c) => c.numeric);
      const rows = t.columns.map((c) => {
        if (c.numeric) {
          const d = describe(c.values.filter((v) => typeof v === 'number'));
          return [`\`${c.name}\``, 'numeric', d.n, fmt(d.mean, 3), fmt(d.sd, 3), `${fmt(d.min, 3)} … ${fmt(d.max, 3)}`, d.outliers.length];
        }
        const vals = c.values.map(String);
        const uniq = new Set(vals);
        const mode = [...uniq].map((u) => [u, vals.filter((v) => v === u).length]).sort((a, b) => b[1] - a[1])[0];
        return [`\`${c.name}\``, 'categorical', vals.length, `${uniq.size} levels`, `mode: ${mode?.[0] ?? '—'} (${mode?.[1] ?? 0})`, '—', vals.filter((v) => !v).length];
      });
      const corr = [];
      for (let i = 0; i < numeric.length; i++) {
        for (let j = i + 1; j < numeric.length; j++) {
          const a = numeric[i].values.filter((v) => typeof v === 'number');
          const b = numeric[j].values.filter((v) => typeof v === 'number');
          if (a.length === b.length && a.length > 2) {
            const r = pearson(a, b);
            corr.push([numeric[i].name, numeric[j].name, fmt(r.r, 3), pval(r.p)]);
          }
        }
      }
      corr.sort((a, b) => Math.abs(Number(b[2])) - Math.abs(Number(a[2])));
      const issues = [];
      if (t.records.length < 30) issues.push(`Only ${t.records.length} rows — inference will be imprecise.`);
      for (const c of t.columns) {
        const miss = c.values.filter((v) => v === '' || v === null || v === undefined).length;
        if (miss) issues.push(`\`${c.name}\` has ${miss} missing value(s) (${((miss / c.values.length) * 100).toFixed(1)}%) — state the mechanism and the handling rule.`);
        if (c.numeric) {
          const d = describe(c.values.filter((v) => typeof v === 'number'));
          if (d && Math.abs(d.skewness) > 2) issues.push(`\`${c.name}\` is heavily skewed (skew ${fmt(d.skewness, 2)}) — consider a transform or a rank-based method.`);
          if (d && d.sd === 0) issues.push(`\`${c.name}\` is constant — it carries no information.`);
        }
      }
      const firstNum = numeric[0];
      return {
        markdown: `## Dataset profile — ${t.records.length} rows × ${t.header.length} columns (delimiter: ${t.delimiter})

${table(['Column', 'Type', 'n', 'Mean / levels', 'SD / mode', 'Range', 'Outliers/missing'], rows)}

${corr.length ? `### Strongest pairwise correlations\n${table(['X', 'Y', 'r', 'p'], corr.slice(0, 8))}\n\n> With ${numeric.length} numeric columns there are ${(numeric.length * (numeric.length - 1)) / 2} implicit tests; at α=0.05 you would expect ${fmt(((numeric.length * (numeric.length - 1)) / 2) * 0.05, 1)} false positives by chance. Treat this table as exploratory.` : ''}

${firstNum ? `### Distribution of \`${firstNum.name}\`\n\`\`\`\n${histogram(firstNum.values.filter((v) => typeof v === 'number'), 10).map((b) => `${fmt(b.x0, 2).padStart(8)} ${bar(b.count, Math.max(...histogram(firstNum.values.filter((v) => typeof v === 'number'), 10).map((x) => x.count)), 30)} ${b.count}`).join('\n')}\n\`\`\`` : ''}

### Data-quality flags (${issues.length})
${issues.length ? issues.map((i) => `- ${i}`).join('\n') : '- None detected.'}`,
        data: { rows: t.records.length, columns: t.header, profile: rows, correlations: corr },
        viz: firstNum ? { type: 'histogram', bins: histogram(firstNum.values.filter((v) => typeof v === 'number'), 12), mean: describe(firstNum.values.filter((v) => typeof v === 'number')).mean } : undefined,
      };
    },
  },

  {
    id: 'data.regex',
    name: 'Regex Laboratory',
    category: 'data',
    summary: 'Tests a pattern against text with match table, groups, and an explanation of each token.',
    tags: ['regex', 'pattern', 'match', 'extract', 'regexp'],
    params: [
      { name: 'pattern', type: 'string', required: true, description: 'regular expression source' },
      { name: 'text', type: 'string', required: true, description: 'text to test against' },
      { name: 'flags', type: 'string', default: 'g', description: 'regex flags' },
    ],
    match: (m) => (/\bregex|regular expression|pattern match\b/i.test(m) ? 3 : 0),
    run: ({ pattern, text, flags = 'g' }) => {
      const re = new RegExp(pattern, flags.includes('g') ? flags : `${flags}g`);
      const matches = [...String(text).matchAll(re)].slice(0, 100);
      const explain = [
        [/\\d/, '\\d — any digit'], [/\\w/, '\\w — word character'], [/\\s/, '\\s — whitespace'],
        [/\\b/, '\\b — word boundary'], [/\[\^/, '[^…] — negated class'], [/\[/, '[…] — character class'],
        [/\(\?:/, '(?:…) — non-capturing group'], [/\(\?=/, '(?=…) — positive lookahead'],
        [/\(\?!/, '(?!…) — negative lookahead'], [/\(\?<=/, '(?<=…) — lookbehind'], [/\(/, '(…) — capturing group'],
        [/\+/, '+ — one or more'], [/\*/, '* — zero or more'], [/\?/, '? — optional / lazy'],
        [/\{\d/, '{n,m} — bounded repetition'], [/\|/, '| — alternation'], [/\^/, '^ — start anchor'], [/\$/, '$ — end anchor'],
      ].filter(([r]) => r.test(pattern)).map(([, d]) => d);
      return {
        markdown: `## Regex \`/${pattern}/${flags}\` — ${matches.length} match${matches.length === 1 ? '' : 'es'}

${matches.length ? table(['#', 'Match', 'Index', 'Groups'], matches.map((m, i) => [
  i + 1, `\`${String(m[0]).slice(0, 60)}\``, m.index,
  m.length > 1 ? m.slice(1).map((g, j) => `$${j + 1}=\`${g ?? ''}\``).join(' ') : '—',
])) : '_No matches._'}

### Pattern anatomy
${explain.length ? explain.map((e) => `- ${e}`).join('\n') : '- Literal pattern with no metacharacters.'}

### Coverage
Matched characters: ${matches.reduce((a, m) => a + m[0].length, 0)} / ${String(text).length} (${((matches.reduce((a, m) => a + m[0].length, 0) / Math.max(1, String(text).length)) * 100).toFixed(1)}%)`,
        data: { count: matches.length, matches: matches.map((m) => ({ match: m[0], index: m.index, groups: m.slice(1) })) },
      };
    },
  },

  {
    id: 'data.graph',
    name: 'Network Analyser',
    category: 'data',
    summary: 'Degree/betweenness centrality, components, density and shortest paths from an edge list.',
    tags: ['graph', 'network', 'centrality', 'nodes', 'edges', 'shortest path'],
    params: [{ name: 'edges', type: 'string', required: true, description: 'one edge per line: "A B" or "A,B"' }],
    match: (m) => (/\b(graph|network|centrality|shortest path|nodes? and edges?)\b/i.test(m) ? 2.5 : 0),
    run: ({ edges }) => {
      const adj = new Map();
      const list = [];
      for (const line of String(edges).split('\n')) {
        const parts = line.trim().split(/[\s,>-]+/).filter(Boolean);
        if (parts.length < 2) continue;
        const [a, b] = parts;
        list.push([a, b]);
        if (!adj.has(a)) adj.set(a, new Set());
        if (!adj.has(b)) adj.set(b, new Set());
        adj.get(a).add(b);
        adj.get(b).add(a);
      }
      const nodes = [...adj.keys()];
      const n = nodes.length;
      if (!n) throw new Error('no edges parsed — use one "A B" pair per line');
      const bfs = (src) => {
        const dist = new Map([[src, 0]]);
        const q = [src];
        const paths = new Map([[src, 1]]);
        const order = [];
        while (q.length) {
          const u = q.shift();
          order.push(u);
          for (const v of adj.get(u)) {
            if (!dist.has(v)) { dist.set(v, dist.get(u) + 1); paths.set(v, 0); q.push(v); }
            if (dist.get(v) === dist.get(u) + 1) paths.set(v, (paths.get(v) || 0) + paths.get(u));
          }
        }
        return { dist, order, paths };
      };
      // Brandes betweenness
      const bc = new Map(nodes.map((v) => [v, 0]));
      for (const s of nodes) {
        const { dist, order, paths } = bfs(s);
        const delta = new Map(nodes.map((v) => [v, 0]));
        for (let i = order.length - 1; i > 0; i--) {
          const w = order[i];
          for (const v of adj.get(w)) {
            if (dist.get(v) === dist.get(w) - 1) {
              delta.set(v, delta.get(v) + (paths.get(v) / paths.get(w)) * (1 + delta.get(w)));
            }
          }
          bc.set(w, bc.get(w) + delta.get(w));
        }
      }
      const closeness = new Map(nodes.map((v) => {
        const { dist } = bfs(v);
        const sum = [...dist.values()].reduce((a, b) => a + b, 0);
        return [v, sum ? (dist.size - 1) / sum : 0];
      }));
      // components
      const seen = new Set();
      const comps = [];
      for (const v of nodes) {
        if (seen.has(v)) continue;
        const { dist } = bfs(v);
        const c = [...dist.keys()];
        c.forEach((x) => seen.add(x));
        comps.push(c);
      }
      const density = (2 * list.length) / (n * (n - 1) || 1);
      const rows = nodes.map((v) => ({
        node: v, degree: adj.get(v).size, betweenness: bc.get(v) / 2, closeness: closeness.get(v),
      })).sort((a, b) => b.degree - a.degree);
      const diameter = Math.max(...nodes.map((v) => Math.max(...bfs(v).dist.values())));
      return {
        markdown: `## Network analysis — ${n} nodes, ${list.length} edges

${table(['Node', 'Degree', 'Betweenness', 'Closeness'], rows.slice(0, 15).map((r) => [
  `\`${r.node}\``, r.degree, fmt(r.betweenness, 2), fmt(r.closeness, 3),
]))}

${table(['Property', 'Value'], [
  ['Density', `${fmt(density, 4)} (${(density * 100).toFixed(1)}% of possible edges)`],
  ['Components', String(comps.length)],
  ['Largest component', `${Math.max(...comps.map((c) => c.length))} nodes`],
  ['Diameter', String(diameter)],
  ['Mean degree', fmt((2 * list.length) / n, 2)],
  ['Hub (max degree)', `\`${rows[0].node}\` (${rows[0].degree})`],
  ['Broker (max betweenness)', `\`${rows.slice().sort((a, b) => b.betweenness - a.betweenness)[0].node}\``],
])}

**Reading.** Degree measures local activity; betweenness measures brokerage — nodes that sit on shortest paths control flow and are the fragile points of the network. ${comps.length > 1 ? `The network is fragmented into ${comps.length} components, so no single measure describes the whole.` : 'The network is fully connected.'}`,
        data: { nodes: n, edges: list.length, density, components: comps.length, centrality: rows },
        viz: { type: 'graph', nodes: rows.slice(0, 40), edges: list.slice(0, 120) },
      };
    },
  },

  {
    id: 'data.timeseries',
    name: 'Time Series Diagnostics',
    category: 'data',
    summary: 'Trend, autocorrelation, differencing, moving averages and change-point scan.',
    tags: ['time series', 'trend', 'autocorrelation', 'forecast', 'seasonal'],
    params: [
      { name: 'series', type: 'numbers', required: true, description: 'ordered observations' },
      { name: 'lags', type: 'number', default: 10, description: 'ACF lags to report' },
    ],
    match: (m) => (/\b(time series|trend|autocorrelat|seasonal|forecast)\b/i.test(m) ? 3 : 0),
    run: ({ series, lags = 10 }) => {
      const y = numbers(series);
      const n = y.length;
      if (n < 8) throw new Error('need at least 8 observations');
      const t = Array.from({ length: n }, (_, i) => [i + 1]);
      const trend = ols(t, y, ['time']);
      const mean = y.reduce((a, b) => a + b, 0) / n;
      const acf = [];
      const denom = y.reduce((a, v) => a + (v - mean) ** 2, 0);
      for (let k = 1; k <= Math.min(Number(lags), n - 2); k++) {
        let num = 0;
        for (let i = 0; i < n - k; i++) num += (y[i] - mean) * (y[i + k] - mean);
        acf.push({ lag: k, r: num / denom, sig: Math.abs(num / denom) > 1.96 / Math.sqrt(n) });
      }
      const diffs = y.slice(1).map((v, i) => v - y[i]);
      const dd = describe(diffs);
      // CUSUM change-point
      let cum = 0;
      let maxAbs = 0;
      let cp = 0;
      const cusum = y.map((v, i) => {
        cum += v - mean;
        if (Math.abs(cum) > maxAbs) { maxAbs = Math.abs(cum); cp = i; }
        return cum;
      });
      const ma = (w) => y.map((_, i) => (i < w - 1 ? null : y.slice(i - w + 1, i + 1).reduce((a, b) => a + b, 0) / w));
      const slope = trend.coefficients[1];
      return {
        markdown: `## Time series diagnostics (T = ${n})

### Trend
${table(['Term', 'Estimate', 'SE', 't', 'p'], [[
  'slope / period', fmt(slope.estimate, 5), fmt(slope.se, 5), fmt(slope.t, 3), pval(slope.p),
]])}
${slope.p < 0.05 ? `A ${slope.estimate > 0 ? 'positive' : 'negative'} linear trend of ${fmt(slope.estimate, 4)} units per period is detectable (R² = ${fmt(trend.r2, 3)}).` : 'No linear trend is distinguishable from noise.'} Durbin–Watson = ${fmt(trend.durbinWatson, 3)} ${trend.durbinWatson < 1.5 ? '→ residuals are autocorrelated; OLS standard errors are too small. Use Newey–West or model the error structure.' : '→ residual independence is plausible.'}

### Autocorrelation function
${acf.map((a) => `lag ${String(a.lag).padStart(2)} ${a.r >= 0 ? '+' : '−'}${bar(Math.abs(a.r), 1, 22)} ${fmt(a.r, 3)}${a.sig ? '  ✱' : ''}`).join('\n')}

✱ exceeds the ±${fmt(1.96 / Math.sqrt(n), 3)} white-noise band. ${acf.filter((a) => a.sig).length ? `${acf.filter((a) => a.sig).length} lag(s) are significant — the series has memory, so observations are not independent and standard tests do not apply.` : 'No significant autocorrelation: the series behaves like white noise around its trend.'}

### First differences
${table(['Mean Δ', 'SD Δ', 'Stationary?'], [[fmt(dd.mean, 4), fmt(dd.sd, 4), Math.abs(dd.mean) < 2 * dd.se ? 'plausibly (mean Δ ≈ 0)' : 'no — drift remains after differencing']])}

### Change-point scan (CUSUM)
Maximum cumulative deviation at **t = ${cp + 1}** (value ${fmt(y[cp], 4)}). ${maxAbs > 2 * Math.sqrt(n) * describe(y).sd ? 'This exceeds the heuristic threshold — a structural break is plausible; test it formally (Chow / Bai–Perron).' : 'No strong evidence of a structural break.'}

> For forecasting, evaluate with rolling-origin backtesting. Random k-fold cross-validation leaks the future into the past and will flatter any model.`,
        data: { trend: { slope: slope.estimate, p: slope.p, r2: trend.r2 }, acf, cusum, movingAverage: ma(Math.max(2, Math.round(n / 10))) },
        viz: { type: 'line', points: y.map((v, i) => ({ x: i + 1, y: v })) },
      };
    },
  },

  {
    id: 'util.sampling',
    name: 'Randomisation & Allocation',
    category: 'utility',
    summary: 'Generates reproducible allocation sequences: simple, block, stratified, and Latin square.',
    tags: ['random', 'allocation', 'assign', 'block', 'counterbalance', 'shuffle'],
    params: [
      { name: 'n', type: 'number', required: true, description: 'number of units' },
      { name: 'arms', type: 'number', default: 2, description: 'number of conditions' },
      { name: 'block', type: 'number', default: 4, description: 'block size (multiple of arms)' },
      { name: 'seed', type: 'number', default: 20260907, description: 'seed for reproducibility' },
    ],
    match: (m) => (/\b(randomi[sz]|allocat|assign (participants|subjects)|counterbalanc|latin square)\b/i.test(m) ? 3 : 0),
    run: ({ n, arms = 2, block = 4, seed = 20260907 }) => {
      const N = Number(n);
      const K = Number(arms);
      let B = Number(block);
      if (B % K !== 0) B = K * Math.max(1, Math.round(B / K));
      let s = Number(seed) >>> 0;
      const rnd = () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
      const labels = Array.from({ length: K }, (_, i) => String.fromCharCode(65 + i));
      const simple = Array.from({ length: N }, () => labels[Math.floor(rnd() * K)]);
      const blocked = [];
      while (blocked.length < N) {
        const b = [];
        for (let i = 0; i < B; i++) b.push(labels[i % K]);
        for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; }
        blocked.push(...b);
      }
      blocked.length = N;
      const counts = (arr) => labels.map((l) => `${l}:${arr.filter((x) => x === l).length}`).join('  ');
      const latin = Array.from({ length: K }, (_, i) => Array.from({ length: K }, (_, j) => labels[(i + j) % K]));
      return {
        markdown: `## Allocation sequence (seed ${seed}, n = ${N}, ${K} arms)

**Blocked randomisation (block size ${B}) — recommended**
\`\`\`
${blocked.join(' ')}
\`\`\`
Balance: ${counts(blocked)} — maximum imbalance at any point ≤ ${B / 2}.

**Simple randomisation (for comparison)**
\`\`\`
${simple.join(' ')}
\`\`\`
Balance: ${counts(simple)} — simple randomisation can drift badly at small n.

**Latin square for order counterbalancing (${K}×${K})**
${table(labels.map((_, i) => `Pos ${i + 1}`), latin)}

### Governance
- This sequence was generated from seed **${seed}** — record it in the protocol so the allocation is auditable and reproducible.
- Keep the sequence concealed from the person enrolling units (allocation concealment ≠ blinding).
- With stratification, run one sequence per stratum and report strata sizes.`,
        data: { blocked, simple, latin, seed: Number(seed) },
      };
    },
  },

  {
    id: 'util.dates',
    name: 'Timeline & Date Calculator',
    category: 'utility',
    summary: 'Interval arithmetic, working days, milestone schedule and ISO week alignment.',
    tags: ['date', 'timeline', 'deadline', 'schedule', 'days between'],
    params: [
      { name: 'start', type: 'string', required: true, description: 'ISO date, e.g. 2026-09-07' },
      { name: 'end', type: 'string', default: '', description: 'ISO date, or leave blank and use "days"' },
      { name: 'days', type: 'number', default: 0, description: 'offset in days from start' },
    ],
    match: (m) => (/\b(days between|deadline|timeline|how long until|working days|schedule)\b/i.test(m) ? 2.5 : 0),
    run: ({ start, end = '', days = 0 }) => {
      const s = new Date(start);
      if (Number.isNaN(s.getTime())) throw new Error(`unparseable start date "${start}" — use ISO format YYYY-MM-DD`);
      const e = end ? new Date(end) : new Date(s.getTime() + Number(days) * 86400000);
      const ms = e - s;
      const d = Math.round(ms / 86400000);
      let working = 0;
      const step = d >= 0 ? 1 : -1;
      for (let i = 0; i !== d; i += step) {
        const day = new Date(s.getTime() + i * 86400000).getUTCDay();
        if (day !== 0 && day !== 6) working += step;
      }
      const iso = (dt) => dt.toISOString().slice(0, 10);
      const milestones = [0.25, 0.5, 0.75, 1].map((f) => [`${(f * 100).toFixed(0)}%`, iso(new Date(s.getTime() + f * ms))]);
      return {
        markdown: `## Interval ${iso(s)} → ${iso(e)}

${table(['Unit', 'Value'], [
  ['Calendar days', String(d)], ['Working days (Mon–Fri)', String(working)],
  ['Weeks', fmt(d / 7, 2)], ['Months (avg)', fmt(d / 30.44, 2)], ['Years', fmt(d / 365.25, 3)],
  ['Hours', (d * 24).toLocaleString()], ['ISO week of start', `${s.getUTCFullYear()}-W${String(Math.ceil(((s - new Date(Date.UTC(s.getUTCFullYear(), 0, 1))) / 86400000 + new Date(Date.UTC(s.getUTCFullYear(), 0, 1)).getUTCDay() + 1) / 7)).padStart(2, '0')}`],
])}

### Milestone schedule
${table(['Progress', 'Date'], milestones)}

> Add 20–30% slack to any research timeline: ethics review, recruitment and data cleaning are the three phases that always overrun.`,
        data: { days: d, workingDays: working, start: iso(s), end: iso(e) },
      };
    },
  },

  {
    id: 'util.json',
    name: 'JSON Inspector',
    category: 'data',
    summary: 'Validates, pretty-prints and structurally profiles JSON, including schema inference.',
    tags: ['json', 'schema', 'validate', 'parse', 'structure'],
    params: [{ name: 'json', type: 'string', required: true, description: 'JSON text' }],
    match: (m) => (/\bjson\b/i.test(m) ? 2 : 0),
    run: ({ json }) => {
      let obj;
      try {
        obj = JSON.parse(json);
      } catch (e) {
        const pos = Number((String(e.message).match(/position (\d+)/) || [])[1] || 0);
        const ctx = String(json).slice(Math.max(0, pos - 40), pos + 40);
        throw new Error(`invalid JSON: ${e.message}\n…${ctx}…`);
      }
      const infer = (v, depth = 0) => {
        if (v === null) return 'null';
        if (Array.isArray(v)) return depth > 4 ? 'array' : `array<${v.length ? infer(v[0], depth + 1) : 'any'}>[${v.length}]`;
        if (typeof v === 'object') {
          if (depth > 4) return 'object';
          return `{ ${Object.entries(v).slice(0, 12).map(([k, val]) => `${k}: ${infer(val, depth + 1)}`).join(', ')} }`;
        }
        return typeof v;
      };
      const walk = (v, path = '$', out = []) => {
        out.push({ path, type: Array.isArray(v) ? 'array' : v === null ? 'null' : typeof v, size: Array.isArray(v) ? v.length : typeof v === 'object' && v ? Object.keys(v).length : String(v).length });
        if (Array.isArray(v)) v.slice(0, 3).forEach((x, i) => walk(x, `${path}[${i}]`, out));
        else if (v && typeof v === 'object') Object.entries(v).slice(0, 20).forEach(([k, x]) => walk(x, `${path}.${k}`, out));
        return out;
      };
      const nodes = walk(obj);
      const depth = Math.max(...nodes.map((n) => n.path.split(/[.[]/).length)) - 1;
      return {
        markdown: `## JSON ✅ valid

**Inferred schema**
\`\`\`
${infer(obj)}
\`\`\`

${table(['Property', 'Value'], [
  ['Root type', Array.isArray(obj) ? 'array' : typeof obj],
  ['Nodes (sampled)', String(nodes.length)],
  ['Max depth', String(depth)],
  ['Serialised size', `${JSON.stringify(obj).length.toLocaleString()} bytes`],
])}

**Structure preview**
${table(['Path', 'Type', 'Size'], nodes.slice(0, 20).map((n) => [`\`${n.path}\``, n.type, String(n.size)]))}

<details><summary>Pretty printed</summary>

\`\`\`json
${JSON.stringify(obj, null, 2).slice(0, 4000)}
\`\`\`
</details>`,
        data: { valid: true, depth, nodes: nodes.length },
      };
    },
  },
];
