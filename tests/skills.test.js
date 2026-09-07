/**
 * skills.test.js — every instrument must run and produce substantive output.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRegistry } from '../packages/skills/src/index.js';
import { normalCdf, tCdf, chi2Sf, fSf, incBeta, ols, twoSampleT, pearson } from '../packages/skills/src/statscore.js';
import { compileExpr, integrate, findRoots, mat } from '../packages/skills/src/mathcore.js';
import { readability, textRank, rake, levenshtein } from '../packages/skills/src/textcore.js';

const registry = createRegistry();

const FIXTURES = {
  'stats.describe': { data: '12 15 11 19 22 14 13 25 17 16' },
  'stats.ttest': { a: '12 15 11 19 22', b: '8 9 14 7 11' },
  'stats.anova': { groups: '1 2 3 4; 5 6 7 8; 2 3 9 10' },
  'stats.correlation': { x: '1 2 3 4 5 6', y: '2 4 5 4 7 9' },
  'stats.regression': { y: '2 4 5 4 7 9', X: '1;2;3;4;5;6' },
  'stats.chisq': { table: '20 30; 25 25' },
  'stats.nonparametric': { a: '1 2 3 4 9', b: '5 6 7 8 10' },
  'stats.power': { d: 0.4, n: 50 },
  'stats.bayes': { successes: 7, trials: 10 },
  'stats.multiplicity': { pvalues: '0.001 0.01 0.03 0.2 0.4' },
  'stats.bootstrap': { a: '1 2 3 4 5 6 7', b: '3 4 5 6 7 8 9', reps: 300 },
  'stats.distribution': { dist: 'normal', x: 1.96 },
  'stats.montecarlo': { trueEffect: 0.3, n: 30, sims: 200 },
  'math.calc': { expression: 'sqrt(2)*ln(10)+sin(pi/3)^2' },
  'math.solve': { equation: 'x^3 - 2x = 5' },
  'math.calculus': { expression: 'exp(-x^2)', at: 0.5, from: 0, to: 2 },
  'math.linalg': { A: '4 1; 2 3', b: '1 2' },
  'math.ode': { f: '-0.5*y + sin(x)', y0: 1, x0: 0, x1: 5, steps: 120 },
  'math.optimize': { expression: '(x-2)^2+3', lo: -5, hi: 5 },
  'math.units': { value: 5, from: 'km', to: 'mi' },
  'math.combinatorics': { n: 10, k: 3, p: 0.4 },
  'math.special': { x: 2.5, y: 1.5 },
  'text.summarize': { text: 'Science requires replication. Replication is hard. Many studies fail because of low power. Low power inflates effect sizes. Preregistration helps. Open data also helps.' },
  'text.keywords': { text: 'Statistical power analysis for behavioural research requires effect size estimates. Power analysis is often skipped entirely.' },
  'text.readability': { text: 'The hypothetico-deductive cycle requires falsifiable predictions. Researchers must specify analyses in advance.' },
  'text.stats': { text: 'the study examined power. the study replicated the effect. power matters a lot.' },
  'text.compare': { a: 'power analysis matters for design', b: 'sample size planning matters for design' },
  'text.claims': { text: 'Sleep restriction reduced memory scores by 23% (N = 48, p < 0.01). This causes long-term harm.' },
  'text.fallacies': { text: 'Everyone knows this works. According to a Nobel laureate, all patients improve. Correlation was high, therefore the drug works.' },
  'lit.cite': { reference: 'Smith, J. A., & Doe, R. 2021. Statistical power in cognitive science. Psychological Methods, 26(3), 245-260. doi:10.1037/met0000389' },
  'lit.screen': { question: 'Does mindfulness training improve working memory in adolescents?' },
  'lit.synthesis': { text: 'Smith 2020 RCT N = 120 found d = 0.4\nJones 2019 cohort N = 300 found no effect\nLee 2021 meta-analysis found r = 0.21' },
  'data.csv': { csv: 'id,score,age,group\n1,10,25,a\n2,14,31,b\n3,9,22,a\n4,20,45,b\n5,15,38,a' },
  'code.write': { task: 'debounce a function', lang: 'javascript' },
  'code.review': { code: 'var x = 1;\nif (x == 1) { eval("y") }\ntry{ f() }catch(e){}' },
  'code.run': { code: 'const xs=[1,2,3,4]; xs.reduce((a,b)=>a+b,0)/xs.length' },
  'code.explain': { code: 'function f(a){ for(const x of a){ if(x>2) return x } }' },
  'code.test': { code: 'export function add(a, b) { return a + b; }' },
  'code.scaffold': { kind: 'react-app', name: 'atlas-ui' },
  'code.convert': { code: 'const xs = [1,2].map(f)', to: 'python' },
  'code.debug': { error: "TypeError: Cannot read properties of undefined (reading 'map')\n    at render (/app/src/App.jsx:22:14)" },
  'code.complexity': { code: 'for (const a of xs) { for (const b of ys) { if (zs.indexOf(a) > -1) out.push(a); } }' },
  'code.regex': { describe: 'match an email address' },
  'data.regex': { pattern: '\\b[A-Z][a-z]+\\b', text: 'Smith and Jones tested Alpha' },
  'data.graph': { edges: 'A B\nB C\nC D\nA D\nD E' },
  'data.timeseries': { series: '1 3 2 5 4 6 5 8 7 10 9 12' },
  'util.sampling': { n: 12, arms: 3 },
  'util.dates': { start: '2026-09-07', end: '2026-12-25' },
  'util.json': { json: '{"a":1,"b":[1,2,3],"c":{"d":"x"}}' },
  'research.plan': { topic: 'effect of sleep restriction on memory' },
  'research.hypothesis': { topic: 'caffeine improves recall' },
  'research.design': { topic: 'testing a new tutoring method' },
  'research.critique': { text: 'We gave 20 students a test after our new method and they scored higher than last year.' },
  'research.peerreview': { text: 'We show that intervention X increases productivity by 15% in a sample of 30 employees.' },
  'research.limitations': { text: 'observational study of diet and longevity' },
  'research.abstract': { text: 'We ran an experiment. Participants improved 20%. This suggests the training works. Sample was 60 adults.' },
  'research.outline': { topic: 'attention and memory' },
  'research.socratic': { topic: 'remote work productivity' },
  'research.steelman': { claim: 'social media harms teenagers' },
  'research.brainstorm': { topic: 'urban heat islands' },
  'research.checklist': { design: 'trial' },
  'research.ethics': { text: 'We will collect health records from children and deploy an AI model.' },
  'research.explain': { concept: 'statistical power' },
};

test('registry exposes a coherent catalogue', () => {
  const skills = registry.list();
  assert.ok(skills.length >= 65, `expected 65+ skills, got ${skills.length}`);
  const ids = new Set();
  for (const s of skills) {
    assert.ok(!ids.has(s.id), `duplicate id ${s.id}`);
    ids.add(s.id);
    assert.match(s.id, /^[a-z]+\.[a-z]+$/, `bad id format: ${s.id}`);
    assert.ok(s.name && s.summary && s.category, `incomplete metadata on ${s.id}`);
    assert.equal(typeof s.run, 'function');
    for (const p of s.params) assert.ok(p.name && p.type, `bad param on ${s.id}`);
  }
  assert.ok(registry.categories().length >= 7);
});

test('every non-neural instrument executes and returns substantive markdown', async () => {
  const failures = [];
  for (const [id, args] of Object.entries(FIXTURES)) {
    try {
      const r = await registry.run(id, args, {});
      if (!r.markdown || r.markdown.length < 120) failures.push(`${id}: output too thin`);
      // "undefined"/"NaN" are legitimate inside code samples; only prose leaking them is a bug
      const prose = r.markdown
        .replace(/```[\s\S]*?```/g, ' ')
        .replace(/`[^`]*`/g, ' ');
      if (/\bundefined\b|\bNaN\b/.test(prose)) failures.push(`${id}: emitted undefined/NaN in prose`);
    } catch (e) {
      failures.push(`${id}: ${e.message}`);
    }
  }
  assert.deepEqual(failures, [], failures.join('\n'));
});

test('fixture coverage includes every non-neural skill', () => {
  const missing = registry.list()
    .filter((s) => s.category !== 'neural')
    .map((s) => s.id)
    .filter((id) => !(id in FIXTURES));
  assert.deepEqual(missing, [], `no fixture for: ${missing.join(', ')}`);
});

test('neural skills fail loudly without a runtime instead of returning nonsense', async () => {
  for (const s of registry.list().filter((x) => x.category === 'neural')) {
    await assert.rejects(() => registry.run(s.id, { text: 'x', prompt: 'x', query: 'x' }, {}), /runtime|required/i);
  }
});

test('required parameters are enforced', async () => {
  await assert.rejects(() => registry.run('stats.ttest', {}, {}), /requires parameter/);
});

/* ------------------------- numerical ground truth ------------------------ */

test('distribution functions match published values', () => {
  assert.ok(Math.abs(normalCdf(1.959964) - 0.975) < 1e-5);
  assert.ok(Math.abs(normalCdf(0) - 0.5) < 1e-12);
  assert.ok(Math.abs(tCdf(2.228, 10) - 0.975) < 1e-3);          // t(10) 97.5th pct = 2.228
  assert.ok(Math.abs(chi2Sf(3.841, 1) - 0.05) < 1e-3);          // chi2(1) 95th pct = 3.841
  assert.ok(Math.abs(fSf(4.965, 3, 10) - 0.0233) < 5e-3);
  assert.ok(Math.abs(incBeta(0.5, 1, 1) - 0.5) < 1e-9);
});

test('t-test reproduces a textbook example', () => {
  const a = [5, 7, 5, 3, 5, 3, 3, 9];
  const b = [8, 1, 4, 6, 6, 4, 1, 2];
  const r = twoSampleT(a, b, { welch: false });
  assert.ok(Math.abs(r.groupA.mean - 5) < 1e-9);
  assert.ok(Math.abs(r.groupB.mean - 4) < 1e-9);
  assert.ok(Math.abs(r.t - 0.84732) < 1e-4, `t=${r.t}`);  // hand-checked: sp²=5.5714, se=1.18019
  assert.ok(r.p > 0.4 && r.p < 0.5);
});

test('OLS recovers exact coefficients on a noiseless line', () => {
  const X = [[1], [2], [3], [4], [5]];
  const y = [3, 5, 7, 9, 11]; // y = 1 + 2x
  const r = ols(X, y);
  assert.ok(Math.abs(r.coefficients[0].estimate - 1) < 1e-8);
  assert.ok(Math.abs(r.coefficients[1].estimate - 2) < 1e-8);
  assert.ok(Math.abs(r.r2 - 1) < 1e-9);
});

test('correlation of a perfect line is 1', () => {
  const r = pearson([1, 2, 3, 4], [2, 4, 6, 8]);
  assert.ok(Math.abs(r.r - 1) < 1e-9);
});

test('expression compiler handles precedence, implicit multiplication and functions', () => {
  const cases = [
    ['2+3*4', 14], ['(2+3)*4', 20], ['2^3^2', 512], ['-2^2', -4],
    ['sqrt(16)', 4], ['2pi', 2 * Math.PI], ['3(1+1)', 6], ['10%3', 1],
    ['5!', 120], ['ln(e)', 1], ['log10(1000)', 3], ['abs(-7)', 7],
  ];
  for (const [src, want] of cases) {
    const got = compileExpr(src)({});
    assert.ok(Math.abs(got - want) < 1e-9, `${src} => ${got}, want ${want}`);
  }
});

test('numeric calculus matches analytic results', () => {
  assert.ok(Math.abs(integrate((x) => x * x, 0, 3) - 9) < 1e-6);
  assert.ok(Math.abs(integrate(Math.sin, 0, Math.PI) - 2) < 1e-6);
  const roots = findRoots((x) => x * x - 4, -10, 10);
  assert.equal(roots.length, 2);
  assert.ok(Math.abs(roots[0] + 2) < 1e-6 && Math.abs(roots[1] - 2) < 1e-6);
});

test('linear algebra: determinant, inverse and solve agree', () => {
  const A = [[4, 1], [2, 3]];
  assert.ok(Math.abs(mat.det(A) - 10) < 1e-12);
  const inv = mat.inverse(A);
  const I = mat.mul(A, inv);
  assert.ok(Math.abs(I[0][0] - 1) < 1e-12 && Math.abs(I[0][1]) < 1e-12);
  const x = mat.solve(A, [1, 2]);
  assert.ok(Math.abs(4 * x[0] + x[1] - 1) < 1e-12);
  const e = mat.eigSym([[2, 0], [0, 3]]);
  assert.ok(Math.abs(e.values[0] - 3) < 1e-9);
});

test('text analytics produce sane values', () => {
  const easy = 'The cat sat on the mat. It was a good day.';
  const hard = 'Heterogeneous methodological confounding necessitates comprehensive multivariate disambiguation procedures.';
  assert.ok(readability(easy).fleschReadingEase > readability(hard).fleschReadingEase);
  const tr = textRank('A. B is important because of C. C explains B. D is unrelated. E mentions C and B again.', { maxSentences: 2 });
  assert.equal(tr.summary.length, 2);
  assert.ok(rake('statistical power analysis matters').length > 0);
  assert.equal(levenshtein('kitten', 'sitting'), 3);
});

test('search and routing return ranked, valid ids', () => {
  const hits = registry.search('power sample size');
  assert.ok(hits.length > 0);
  assert.ok(hits.some((h) => h.id === 'stats.power'));
  const routed = registry.route('how many participants do I need for 80% power');
  assert.ok(routed.length > 0);
  assert.ok(routed.every((r) => registry.get(r.id)));
});
