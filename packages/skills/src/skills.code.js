/**
 * skills.code.js — the coding instruments.
 * Recipes are shared with the corpus generator, so the model was trained on the
 * same code the console serves.
 */
import vm from 'node:vm';
import { table, fmt } from './registry.js';
import { RECIPES, findRecipes, LANGS } from '../../corpus/src/recipes.js';

const LANG_OF = (text) => {
  const t = String(text);
  if (/^\s*(import|from)\s+\w+|def\s+\w+\(|print\(|:\s*$/m.test(t) && !/function\s|=>|const\s/.test(t)) return 'python';
  if (/interface\s+\w+|:\s*(string|number|boolean)\b|<[A-Z]\w*>/.test(t)) return 'typescript';
  if (/\bSELECT\b[\s\S]*\bFROM\b/i.test(t)) return 'sql';
  if (/^\s*#!\/bin\/(ba)?sh|^\s*(git|npm|cd|echo|ls)\s/m.test(t)) return 'bash';
  return 'javascript';
};

const stripFences = (s) => String(s).replace(/^\s*```[a-z]*\n?/i, '').replace(/```\s*$/, '');

/* ------------------------------- static review ---------------------------- */

const RULES = [
  { id: 'eq', re: /[^=!<>]==[^=]/, sev: 'medium', msg: 'Loose equality `==` performs type coercion', fix: 'use `===` / `!==` unless you deliberately want `== null`' },
  { id: 'var', re: /\bvar\s+\w/, sev: 'low', msg: '`var` is function-scoped and hoisted', fix: 'use `const` by default, `let` when reassigned' },
  { id: 'eval', re: /\beval\s*\(|new Function\s*\(/, sev: 'high', msg: '`eval` / `new Function` executes arbitrary code', fix: 'parse the input instead, or run it in an isolated `node:vm` context' },
  { id: 'innerhtml', re: /\.innerHTML\s*=/, sev: 'high', msg: 'Assigning innerHTML is an XSS vector', fix: 'use `textContent`, or sanitise before insertion' },
  { id: 'emptycatch', re: /catch\s*\([^)]*\)\s*\{\s*\}/, sev: 'high', msg: 'Empty catch block swallows the failure', fix: 'log with context or rethrow a typed error' },
  { id: 'awaitloop', re: /for\s*\([^)]*\)\s*\{[^}]*await /s, sev: 'medium', msg: 'Sequential `await` inside a loop serialises I/O', fix: 'collect promises and `await Promise.all`, or use a bounded pool' },
  { id: 'nolimit', re: /while\s*\(\s*true\s*\)/, sev: 'medium', msg: 'Unbounded loop', fix: 'add an iteration guard or an explicit break condition' },
  { id: 'anytype', re: /:\s*any\b/, sev: 'low', msg: '`any` disables type checking', fix: 'use `unknown` and narrow, or write the real type' },
  { id: 'console', re: /console\.log\(/, sev: 'info', msg: 'Debug logging left in place', fix: 'use a logger with levels, or remove before shipping' },
  { id: 'floatmoney', re: /\b(price|amount|total|cost|balance)\b[^;\n]*[*/+]\s*0?\.\d/i, sev: 'medium', msg: 'Floating-point arithmetic on money', fix: 'work in integer minor units (cents) or use a decimal library' },
  { id: 'mathrandom', re: /Math\.random\(\)/, sev: 'low', msg: '`Math.random` is not cryptographically secure', fix: 'use `crypto.getRandomValues` / `crypto.randomUUID` for tokens and ids' },
  { id: 'sqlconcat', re: /(SELECT|INSERT|UPDATE|DELETE)[^;]*\+\s*\w+/i, sev: 'high', msg: 'String-concatenated SQL is an injection vector', fix: 'use parameterised queries / prepared statements' },
  { id: 'nohandler', re: /\.then\s*\([^)]*\)\s*;?\s*$/m, sev: 'medium', msg: 'Promise chain without a `.catch`', fix: 'attach `.catch` or wrap in try/await' },
  { id: 'mutableDefault', re: /def\s+\w+\([^)]*=\s*(\[\]|\{\})/, sev: 'high', msg: 'Mutable default argument is shared across calls (Python)', fix: 'default to `None` and create inside the function' },
  { id: 'bareexcept', re: /except\s*:\s*$/m, sev: 'medium', msg: 'Bare `except:` catches SystemExit and KeyboardInterrupt', fix: 'catch `Exception` or the specific error class' },
];

function analyse(code) {
  const lines = String(code).split('\n');
  const findings = [];
  RULES.forEach((r) => {
    lines.forEach((line, i) => {
      if (r.re.test(line)) findings.push({ ...r, line: i + 1, text: line.trim().slice(0, 90) });
    });
    if (!findings.some((f) => f.id === r.id) && r.re.flags.includes('s') && r.re.test(code)) {
      findings.push({ ...r, line: null, text: '' });
    }
  });
  const metrics = {
    lines: lines.length,
    nonEmpty: lines.filter((l) => l.trim()).length,
    comments: lines.filter((l) => /^\s*(\/\/|#|\*)/.test(l)).length,
    longest: Math.max(...lines.map((l) => l.length), 0),
    functions: (code.match(/function\s+\w+|=>|def\s+\w+/g) || []).length,
    branches: (code.match(/\bif\b|\belse\b|\bcase\b|\bfor\b|\bwhile\b|\bcatch\b|\?\s*[^:]+:|&&|\|\|/g) || []).length,
    awaits: (code.match(/\bawait\b/g) || []).length,
    maxIndent: Math.max(...lines.map((l) => (l.match(/^\s*/)?.[0].length || 0) / 2), 0),
  };
  metrics.cyclomatic = 1 + metrics.branches;
  metrics.commentRatio = metrics.comments / Math.max(1, metrics.nonEmpty);
  return { findings, metrics };
}

export default [
  {
    id: 'code.write',
    name: 'Code Writer',
    category: 'code',
    summary: 'Produces a tested, runnable implementation from the curated recipe library, with pitfalls.',
    tags: ['code', 'write', 'implement', 'function', 'example', 'how to', 'snippet'],
    params: [
      { name: 'task', type: 'string', required: true, description: 'what the code should do' },
      { name: 'lang', type: 'string', default: '', description: `preferred language (${LANGS.join(', ')})` },
    ],
    examples: [{ label: 'Debounce', args: { task: 'debounce a function', lang: 'javascript' } }],
    match: (m) => (/\b(write|implement|code|function|script|snippet|how do i .*(in|with) (js|javascript|python|node|react))\b/i.test(m) ? 2.5 : 0),
    run: ({ task, lang = '' }) => {
      const hits = findRecipes(`${task} ${lang}`, 3);
      if (!hits.length) {
        return {
          markdown: `## No exact recipe for “${task}”

The recipe library covers ${RECIPES.length} canonical tasks: ${RECIPES.map((r) => `\`${r.id}\``).join(', ')}.

**What to do instead**
1. Ask again naming the concrete operation (“debounce”, “retry with backoff”, “group and aggregate”, “binary search”).
2. Use \`/web.search\` — I will search GitHub code, npm and PyPI live and quote a real implementation.
3. Use \`/code.run\` to execute a draft here and iterate on the output.`,
          data: { matched: 0 },
        };
      }
      const primary = hits[0];
      const others = hits.slice(1);
      return {
        markdown: `## ${primary.title} — \`${primary.lang}\`

${primary.explain}

\`\`\`${primary.lang}
${primary.code}
\`\`\`

**Pitfalls.** ${primary.pitfalls}

**Complexity & shape.** ${(() => {
  const a = analyse(primary.code);
  return `${a.metrics.nonEmpty} significant lines · cyclomatic ≈ ${a.metrics.cyclomatic} · ${a.metrics.functions} function(s)`;
})()}

${others.length ? `### Related recipes\n${others.map((r) => `- **${r.title}** (\`${r.lang}\`) — ${r.task}. Ask for \`${r.id}\` to see it.`).join('\n')}` : ''}

> Run it right now with \`/code.run\`, or ask me to search GitHub for how large projects solve the same problem.`,
        data: { recipe: primary.id, lang: primary.lang, code: primary.code, related: others.map((r) => r.id) },
      };
    },
  },

  {
    id: 'code.review',
    name: 'Code Reviewer',
    category: 'code',
    summary: 'Static review: correctness, security and maintainability findings with line numbers.',
    tags: ['review', 'lint', 'bug', 'refactor', 'security', 'code smell'],
    params: [{ name: 'code', type: 'string', required: true, description: 'source to review' }],
    match: (m) => (/\b(review|refactor|improve|what.s wrong with|bug in|code smell|is this code)\b/i.test(m) ? 3 : 0),
    run: ({ code }) => {
      const src = stripFences(code);
      const lang = LANG_OF(src);
      const { findings, metrics } = analyse(src);
      const bySev = { high: [], medium: [], low: [], info: [] };
      findings.forEach((f) => bySev[f.sev].push(f));
      const grade = findings.filter((f) => f.sev === 'high').length === 0
        ? (findings.length <= 2 ? 'A' : 'B')
        : (bySev.high.length > 2 ? 'D' : 'C');
      return {
        markdown: `## Code review — \`${lang}\` · grade ${grade}

${table(['Metric', 'Value', 'Metric', 'Value'], [
  ['Lines', String(metrics.lines), 'Significant', String(metrics.nonEmpty)],
  ['Cyclomatic complexity', String(metrics.cyclomatic), 'Functions', String(metrics.functions)],
  ['Comment ratio', `${(metrics.commentRatio * 100).toFixed(0)}%`, 'Max nesting', String(metrics.maxIndent)],
  ['Longest line', String(metrics.longest), 'Awaits', String(metrics.awaits)],
])}

${findings.length ? ['high', 'medium', 'low', 'info'].filter((s) => bySev[s].length).map((s) => `### ${s.toUpperCase()} (${bySev[s].length})\n${bySev[s].map((f) => `- **${f.msg}**${f.line ? ` — line ${f.line}` : ''}\n  ${f.text ? `\`${f.text}\`\n  ` : ''}→ ${f.fix}`).join('\n')}`).join('\n\n') : '✅ No rule violations detected by static analysis.'}

### Judgement calls the linter cannot make
1. **Naming.** Would a stranger guess what each identifier holds without reading the body?
2. **Failure modes.** What happens on empty input, on a network error, on concurrent calls?
3. **Tests.** Is there a test that fails if this function silently returns the wrong value?
${metrics.cyclomatic > 12 ? '4. **Complexity.** Cyclomatic complexity above ~12 means the function is doing several jobs — split it.' : ''}
${metrics.commentRatio < 0.05 && metrics.nonEmpty > 25 ? '5. **Intent.** Nearly no comments in a non-trivial block: document *why*, not *what*.' : ''}`,
        data: { lang, findings, metrics, grade },
      };
    },
  },

  {
    id: 'code.run',
    name: 'Code Runner',
    category: 'code',
    summary: 'Executes JavaScript in an isolated VM with console capture and a time budget.',
    tags: ['run', 'execute', 'test', 'sandbox', 'output', 'repl'],
    params: [
      { name: 'code', type: 'string', required: true, description: 'JavaScript to execute' },
      { name: 'timeout', type: 'number', default: 4000, description: 'ms budget' },
    ],
    match: (m) => (/\b(run|execute|what does this (code )?(print|output|return))\b/i.test(m) ? 2.5 : 0),
    run: ({ code, timeout = 4000 }) => {
      const logs = [];
      const fmtv = (v) => {
        if (typeof v === 'string') return v;
        if (typeof v === 'function') return `[Function ${v.name || 'anonymous'}]`;
        try { return JSON.stringify(v, (k, x) => (typeof x === 'bigint' ? String(x) : x), 2); } catch { return String(v); }
      };
      const sandbox = {
        console: {
          log: (...a) => logs.push(a.map(fmtv).join(' ')),
          error: (...a) => logs.push(`✖ ${a.map(fmtv).join(' ')}`),
          warn: (...a) => logs.push(`⚠ ${a.map(fmtv).join(' ')}`),
          info: (...a) => logs.push(a.map(fmtv).join(' ')),
          table: (x) => logs.push(fmtv(x)),
        },
        Math, JSON, Date, Array, Object, Number, String, Boolean, Map, Set, WeakMap, WeakSet,
        Promise, RegExp, Error, TypeError, RangeError, Symbol, BigInt, Proxy, Reflect,
        Int8Array, Uint8Array, Int32Array, Uint32Array, Float32Array, Float64Array, ArrayBuffer, DataView,
        Intl, structuredClone, isNaN, isFinite, parseFloat, parseInt, encodeURIComponent, decodeURIComponent,
        atob: (s) => Buffer.from(s, 'base64').toString('binary'),
        btoa: (s) => Buffer.from(s, 'binary').toString('base64'),
        performance: { now: () => Number(process.hrtime.bigint() / 1000n) / 1000 },
      };
      const ctx = vm.createContext(sandbox);
      const t0 = process.hrtime.bigint();
      let value; let error = null;
      try {
        value = vm.runInContext(stripFences(code), ctx, { timeout: Math.min(10000, Number(timeout) || 4000), displayErrors: true });
      } catch (e) {
        error = `${e.name}: ${e.message}`;
      }
      const ms = Number(process.hrtime.bigint() - t0) / 1e6;
      return {
        markdown: `## ${error ? '❌ Execution failed' : '✅ Executed'} in ${ms.toFixed(2)} ms

${logs.length ? `**Console**\n\`\`\`\n${logs.join('\n').slice(0, 6000)}\n\`\`\`\n` : ''}
${error
    ? `**Error**\n\`\`\`\n${error}\n\`\`\`\n\n**Debug checklist**\n1. Read the error type first — \`TypeError\` means a value was not what you assumed; \`ReferenceError\` means a name is missing.\n2. Print the inputs at the failure point rather than guessing.\n3. Reduce to the smallest input that still fails.`
    : `**Return value**\n\`\`\`js\n${value === undefined ? 'undefined' : fmtv(value).slice(0, 4000)}\n\`\`\``}

> Isolated \`node:vm\` context: no filesystem, no network, no \`require\`, hard time budget. Seed your randomness for reproducible results.`,
        data: { logs, value: error ? null : fmtv(value)?.slice(0, 4000), error, ms },
      };
    },
  },

  {
    id: 'code.explain',
    name: 'Code Explainer',
    category: 'code',
    summary: 'Line-by-line walkthrough with control flow, complexity and the invariants being maintained.',
    tags: ['explain', 'understand', 'what does this do', 'walkthrough', 'read code'],
    params: [{ name: 'code', type: 'string', required: true, description: 'source to explain' }],
    match: (m) => (/\b(explain|what does this|how does this (code|function) work|walk me through)\b/i.test(m) ? 2.5 : 0),
    run: ({ code }) => {
      const src = stripFences(code);
      const lang = LANG_OF(src);
      const lines = src.split('\n');
      const { metrics } = analyse(src);
      const annotate = (line) => {
        const t = line.trim();
        if (!t) return null;
        if (/^(\/\/|#)/.test(t)) return 'comment';
        if (/^(import|from|require|const .*require)/.test(t)) return 'brings a dependency into scope';
        if (/^(export|module\.exports)/.test(t)) return 'exposes the value to other modules';
        if (/^(function|const \w+ = (async )?\(|def |class )/.test(t)) return 'declares a new unit of behaviour';
        if (/^(if|elif|else if)/.test(t)) return 'branches on a condition';
        if (/^(for|while)/.test(t)) return 'iterates';
        if (/^(return)/.test(t)) return 'produces the result and exits';
        if (/^(try|catch|except|finally)/.test(t)) return 'handles failure';
        if (/await /.test(t)) return 'suspends until the promise settles';
        if (/=>/.test(t)) return 'defines an inline callback';
        if (/^(await )?[\w.]+\(/.test(t)) return 'calls out to another routine';
        if (/=/.test(t)) return 'binds a value';
        return null;
      };
      const walk = lines.slice(0, 40).map((l, i) => {
        const note = annotate(l);
        return note ? `| ${i + 1} | \`${l.trim().slice(0, 68)}\` | ${note} |` : null;
      }).filter(Boolean);
      const bigO = metrics.branches > 0 && /for[\s\S]*for|while[\s\S]*while/.test(src) ? 'O(n²) — nested iteration'
        : /for|while|\.map|\.filter|\.reduce|\.forEach/.test(src) ? 'O(n) — single pass'
          : /binarySearch|>>> 1|lo \+ hi/.test(src) ? 'O(log n) — halving search'
            : 'O(1) — no data-dependent loop';
      return {
        markdown: `## What this \`${lang}\` code does

**Shape.** ${metrics.nonEmpty} significant lines, ${metrics.functions} function(s), cyclomatic complexity ≈ ${metrics.cyclomatic}, max nesting ${metrics.maxIndent}.
**Complexity estimate.** ${bigO}${metrics.awaits ? `, with ${metrics.awaits} await point(s) — the wall-clock cost is dominated by I/O, not CPU.` : '.'}

### Line by line
| # | Code | What it does |
| --- | --- | --- |
${walk.join('\n')}
${lines.length > 40 ? `\n_…${lines.length - 40} further lines omitted._` : ''}

### Questions to ask of this code
1. **Invariant:** what must be true before and after each loop iteration? Write it as a comment; if you cannot, the loop is unclear.
2. **Boundaries:** what happens with empty input, one element, or duplicates?
3. **Failure:** which line can throw, and who catches it?
4. **Concurrency:** if two calls overlap, do they share mutable state?`,
        data: { lang, metrics, bigO },
      };
    },
  },

  {
    id: 'code.test',
    name: 'Test Generator',
    category: 'code',
    summary: 'Generates a runnable node:test suite covering happy path, boundaries and failure modes.',
    tags: ['test', 'unit test', 'tdd', 'coverage', 'assert', 'spec'],
    params: [
      { name: 'code', type: 'string', required: true, description: 'the function to test' },
      { name: 'name', type: 'string', default: '', description: 'exported symbol under test' },
    ],
    match: (m) => (/\b(test|unit test|write tests|spec|coverage)\b/i.test(m) ? 3 : 0),
    run: ({ code, name = '' }) => {
      const src = stripFences(code);
      const detected = name
        || (src.match(/(?:export\s+)?(?:async\s+)?function\s+(\w+)/) || [])[1]
        || (src.match(/(?:export\s+)?const\s+(\w+)\s*=\s*(?:async\s*)?\(/) || [])[1]
        || (src.match(/class\s+(\w+)/) || [])[1]
        || 'subject';
      const params = (src.match(new RegExp(`${detected}\\s*[=(]?[^(]*\\(([^)]*)\\)`)) || [])[1] || '';
      const args = params.split(',').map((p) => p.trim().split(/[=:]/)[0].trim()).filter(Boolean);
      const isAsync = /async|await|Promise/.test(src);
      const a = isAsync ? 'await ' : '';
      return {
        markdown: `## Test suite for \`${detected}\`

\`\`\`javascript
import test from 'node:test';
import assert from 'node:assert/strict';
import { ${detected} } from './subject.js';

test('${detected}', async (t) => {
  await t.test('happy path returns the expected shape', ${isAsync ? 'async ' : ''}() => {
    const result = ${a}${detected}(${args.map((_, i) => (i === 0 ? '/* typical input */ 1' : 'undefined')).join(', ')});
    assert.ok(result !== undefined, 'should return something');
  });

  await t.test('handles empty input', ${isAsync ? 'async ' : ''}() => {
    ${args.length ? `const result = ${a}${detected}(${args.map(() => 'null').join(', ')});\n    assert.doesNotThrow(() => result);` : `assert.doesNotThrow(() => ${detected}());`}
  });

  await t.test('is deterministic — same input, same output', ${isAsync ? 'async ' : ''}() => {
    const a1 = ${a}${detected}(${args.map(() => '1').join(', ')});
    const a2 = ${a}${detected}(${args.map(() => '1').join(', ')});
    assert.deepEqual(a1, a2);
  });

  await t.test('rejects invalid input loudly', ${isAsync ? 'async ' : ''}() => {
    ${isAsync
    ? `await assert.rejects(() => ${detected}(Symbol('bad')));`
    : `assert.throws(() => ${detected}(Symbol('bad')));`}
  });

  await t.test('does not mutate its arguments', ${isAsync ? 'async ' : ''}() => {
    const input = { a: 1, nested: { b: 2 } };
    const snapshot = structuredClone(input);
    ${a}${detected}(input);
    assert.deepEqual(input, snapshot, 'arguments must be treated as read-only');
  });
});
\`\`\`

**Run:** \`node --test "tests/*.test.js"\`

### Cases worth adding for this specific function
${[
  /\barray|\[\]|\.map|\.filter/.test(src) ? '- Empty array, single element, duplicates, and very large array (performance).' : null,
  /\bstring|\.split|\.replace/.test(src) ? '- Unicode input, emoji, empty string, whitespace-only string.' : null,
  /\bnumber|Math\.|\+|\*/.test(src) ? '- Zero, negative, `NaN`, `Infinity`, and floating-point rounding.' : null,
  isAsync ? '- Rejection path, timeout, and two concurrent calls sharing state.' : null,
  /cache|memo/.test(src) ? '- Cache hit, cache miss, and eviction at the size limit.' : null,
  /fetch|http|request/.test(src) ? '- Network failure, non-2xx status, malformed JSON body.' : null,
].filter(Boolean).join('\n') || '- Boundary values for each parameter, and one property-based test with random inputs.'}

> A test that cannot fail is documentation, not a test. Break the implementation deliberately and confirm the suite goes red.`,
        data: { subject: detected, args, isAsync },
      };
    },
  },

  {
    id: 'code.scaffold',
    name: 'Project Scaffolder',
    category: 'code',
    summary: 'Emits a complete starter project: file tree, configs and commands, ready to run.',
    tags: ['scaffold', 'boilerplate', 'starter', 'project', 'setup', 'template'],
    params: [
      { name: 'kind', type: 'string', required: true, description: 'node-api | react-app | cli | python-lib | fullstack' },
      { name: 'name', type: 'string', default: 'my-app', description: 'project name' },
    ],
    match: (m) => (/\b(scaffold|boilerplate|starter|new project|set ?up a project|project structure)\b/i.test(m) ? 3 : 0),
    run: ({ kind, name = 'my-app' }) => {
      const k = String(kind).toLowerCase();
      const pick = /react|front|spa|vite/.test(k) ? 'react-app'
        : /cli|command/.test(k) ? 'cli'
          : /python|py/.test(k) ? 'python-lib'
            : /full|stack/.test(k) ? 'fullstack' : 'node-api';
      const trees = {
        'node-api': `${name}/
├── package.json
├── .env.example
├── src/
│   ├── index.js          # express bootstrap, graceful shutdown
│   ├── routes/health.js
│   ├── middleware/error.js
│   └── lib/db.js
├── tests/api.test.js
└── README.md`,
        'react-app': `${name}/
├── package.json
├── vite.config.js
├── index.html
├── src/
│   ├── main.jsx
│   ├── App.jsx
│   ├── components/
│   ├── hooks/useFetch.js
│   ├── store.js
│   └── styles.css
└── tests/app.test.jsx`,
        cli: `${name}/
├── package.json         # "bin": { "${name}": "./src/cli.js" }
├── src/
│   ├── cli.js           # parseArgs, exit codes
│   └── commands/
├── tests/cli.test.js
└── README.md`,
        'python-lib': `${name}/
├── pyproject.toml
├── src/${name.replace(/-/g, '_')}/
│   ├── __init__.py
│   └── core.py
├── tests/test_core.py
└── README.md`,
        fullstack: `${name}/
├── package.json         # npm workspaces
├── server/src/index.js
├── web/src/main.jsx
├── packages/shared/src/index.js
└── tests/`,
      };
      const commands = {
        'node-api': 'npm init -y && npm i express && npm i -D nodemon\nnode --watch src/index.js',
        'react-app': 'npm create vite@latest ' + name + ' -- --template react\ncd ' + name + ' && npm i && npm run dev',
        cli: 'npm init -y && npm link\n' + name + ' --help',
        'python-lib': 'python -m venv .venv && . .venv/bin/activate\npip install -e ".[dev]" && pytest',
        fullstack: 'npm init -y && npm pkg set workspaces[]="server" workspaces[]="web"\nnpm i && npm run dev',
      };
      return {
        markdown: `## Scaffold — ${pick} · \`${name}\`

\`\`\`
${trees[pick]}
\`\`\`

**Bootstrap**
\`\`\`bash
${commands[pick]}
\`\`\`

**package.json worth having from day one**
\`\`\`json
{
  "name": "${name}",
  "type": "module",
  "engines": { "node": ">=20" },
  "scripts": {
    "dev": "node --watch src/index.js",
    "test": "node --test \\"tests/*.test.js\\"",
    "lint": "eslint src tests",
    "start": "NODE_ENV=production node src/index.js"
  }
}
\`\`\`

### Decisions to make now, not later
1. **Config** — read from environment with a validated schema; commit \`.env.example\`, never \`.env\`.
2. **Errors** — one typed error class and one place that maps errors to responses.
3. **Tests** — one test in the first commit, so "add tests later" never happens.
4. **CI** — install, lint, test on every push; a red build must block merge.
5. **Logging** — structured JSON with a request id, not \`console.log\`.`,
        data: { kind: pick, name },
      };
    },
  },

  {
    id: 'code.convert',
    name: 'Language Translator',
    category: 'code',
    summary: 'Maps constructs between JavaScript, Python, TypeScript and SQL with a semantics warning list.',
    tags: ['convert', 'translate', 'port', 'javascript', 'python', 'equivalent'],
    params: [
      { name: 'code', type: 'string', required: true, description: 'source snippet' },
      { name: 'to', type: 'string', required: true, description: 'target language' },
    ],
    match: (m) => (/\b(convert|translate|port|equivalent (in|of)|in python instead|rewrite in)\b/i.test(m) ? 3 : 0),
    run: ({ code, to }) => {
      const src = stripFences(code);
      const from = LANG_OF(src);
      const target = String(to).toLowerCase();
      const MAP = {
        'javascript→python': [
          ['`const x = 1`', '`x = 1`', 'Python has no const; use UPPER_CASE by convention or `Final` from typing'],
          ['`arr.map(f)`', '`[f(x) for x in arr]`', 'comprehensions are idiomatic and faster than `map` + `lambda`'],
          ['`arr.filter(p)`', '`[x for x in arr if p(x)]`', ''],
          ['`arr.reduce(f, init)`', '`functools.reduce(f, arr, init)`', 'often clearer as an explicit loop or `sum()`'],
          ['`JSON.stringify(x)`', '`json.dumps(x)`', 'Python emits spaces after separators by default'],
          ['`Object.entries(o)`', '`o.items()`', 'dict views are lazy; wrap in `list()` if you mutate while iterating'],
          ['`async/await`', '`async def` + `await`', 'needs an event loop: `asyncio.run(main())`'],
          ['`try { } catch (e) { }`', '`try: ... except Exception as e:`', 'never use a bare `except:`'],
          ['`null` / `undefined`', '`None`', 'Python has one empty value, not two'],
          ['`a === b`', '`a is b` (identity) or `a == b` (value)', '`is` compares identity — never use it for numbers or strings'],
          ['`setTimeout(f, ms)`', '`await asyncio.sleep(ms/1000)`', 'or `threading.Timer` outside async code'],
        ],
        'python→javascript': [
          ['`[f(x) for x in xs]`', '`xs.map(f)`', ''],
          ['`dict.get(k, d)`', '`obj[k] ?? d`', '`??` only falls back on null/undefined, `||` also on 0 and ""'],
          ['`with open(p) as f:`', '`const f = await fs.open(p)` + `finally f.close()`', 'JS has no context managers; use try/finally'],
          ['f-strings', 'template literals', '`` `${x}` `` — backticks, not quotes'],
          ['`len(x)`', '`x.length` / `x.size`', 'arrays and strings use `.length`, Map/Set use `.size`'],
          ['tuples', 'arrays (or `Object.freeze`)', 'JS has no immutable tuple type'],
          ['`None`', '`null`', 'reserve `undefined` for "not set"'],
          ['integer division `//`', '`Math.floor(a / b)`', 'JS numbers are all IEEE-754 doubles'],
          ['big integers', '`BigInt`', 'Python ints are arbitrary precision by default; JS needs `10n`'],
        ],
        'javascript→typescript': [
          ['`function f(a, b)`', '`function f(a: number, b: string): Result`', 'annotate the boundary, let inference do the inside'],
          ['`obj.x`', 'declare an `interface`/`type`', 'discriminated unions beat optional fields'],
          ['`any`', '`unknown` + narrowing', '`any` disables every check downstream'],
          ['`catch (e)`', '`catch (e: unknown)`', 'narrow with `e instanceof Error` before using `.message`'],
          ['JSON parse', '`as` is unsafe', 'validate at runtime (zod/valibot) — types vanish at compile time'],
        ],
      };
      const key = `${from}→${target}`;
      const rows = MAP[key] || MAP[`javascript→${target}`] || MAP['javascript→python'];
      return {
        markdown: `## ${from} → ${target}

**Source (detected \`${from}\`)**
\`\`\`${from}
${src.slice(0, 1200)}
\`\`\`

### Construct mapping
${table(['In ' + from, 'In ' + target, 'Semantics warning'], rows.map((r) => [r[0], r[1], r[2] || '—']))}

### Porting protocol that actually works
1. Port the **tests** first; they define the contract independently of syntax.
2. Port the code until the tests pass — resist "improving" it in the same pass.
3. Only then refactor into the target language's idioms.
4. Diff the numeric output on real inputs: integer division, rounding and unicode handling differ silently between languages.

> A mechanical translation that passes no tests is a rewrite with extra steps.`,
        data: { from, to: target, mappings: rows.length },
      };
    },
  },

  {
    id: 'code.debug',
    name: 'Debug Assistant',
    category: 'code',
    summary: 'Decodes an error message, ranks likely causes and gives an ordered diagnostic procedure.',
    tags: ['debug', 'error', 'exception', 'stack trace', 'fix', 'crash', 'not working'],
    params: [
      { name: 'error', type: 'string', required: true, description: 'error message or stack trace' },
      { name: 'code', type: 'string', default: '', description: 'related source, if you have it' },
    ],
    match: (m) => (/\b(error|exception|stack ?trace|traceback|undefined is not|cannot read|failed to|not working|crash)\b/i.test(m) ? 3 : 0),
    run: ({ error, code = '' }) => {
      const e = String(error);
      const KNOWN = [
        [/cannot read propert(y|ies) .*of (undefined|null)/i, 'A value you assumed exists is `undefined`/`null`', ['Log the container object one line before the access.', 'Use optional chaining `a?.b?.c` at boundaries you do not control.', 'Fix the source: why was it never assigned? Async result read before it resolved is the usual cause.']],
        [/is not a function/i, 'Calling something that is not callable', ['Print `typeof x` — it is often `undefined` (bad import) or an object (missing `.default`).', 'Check named vs default export mismatch between ESM and CJS.', 'Confirm the method exists on that version of the library.']],
        [/unexpected token|syntaxerror/i, 'Parser failed before your code ran', ['The reported line is where the parser gave up, the mistake is usually just before it.', 'Check unbalanced brackets, a stray comma, or JSON parsed from an HTML error page.', 'If it says `Unexpected token <`, you fetched an HTML error page and parsed it as JSON.']],
        [/econnrefused|enotfound|network|fetch failed/i, 'The connection never reached the server', ['Is the service actually listening on that host and port?', 'Inside a container, `localhost` means the container, not the host.', 'Check DNS, firewall, and whether TLS interception needs a CA bundle.']],
        [/timeout|etimedout/i, 'The operation exceeded its budget', ['Is the remote slow, or is the event loop blocked by CPU work?', 'Add a per-request timeout plus retry with backoff and jitter.', 'Measure: log the elapsed time at each stage to find the slow one.']],
        [/out of memory|heap/i, 'The process exhausted its heap', ['Are you accumulating results in an array that grows without bound?', 'Stream instead of buffering; process line by line.', 'Take a heap snapshot with `node --inspect` and compare two points in time.']],
        [/maximum call stack/i, 'Infinite recursion', ['Find the base case that never triggers.', 'Cyclic data structures in a recursive walk need a `seen` set.', 'Convert deep recursion into an explicit stack loop.']],
        [/cors/i, 'The browser blocked a cross-origin response', ['CORS is enforced by the browser, not the server — test the API with curl to confirm it works.', 'The server must send `Access-Control-Allow-Origin` and answer the OPTIONS preflight.', 'Credentials require an explicit origin, never `*`.']],
        [/modulenotfounderror|cannot find module/i, 'The runtime cannot resolve an import', ['Check the exact path and case — Linux is case-sensitive, macOS often is not.', 'ESM requires the file extension: `./util.js`, not `./util`.', 'Is the dependency installed in *this* workspace?']],
        [/permission denied|eacces/i, 'Filesystem or port permission', ['Ports below 1024 need privileges — use 3000/8080 instead.', 'Check ownership of the directory rather than running as root.']],
        [/indexerror|keyerror|list index out of range/i, 'Index or key that does not exist (Python)', ['Print the length and the index right before the access.', 'Use `.get(key, default)` for dicts and guard slices.']],
        [/typeerror.*nonetype/i, 'A Python value is `None` where an object was expected', ['A function that ends without `return` returns `None`.', 'Check the branch where the early return happens.']],
      ];
      const hit = KNOWN.find(([re]) => re.test(e));
      const frames = [...e.matchAll(/at\s+([^\s(]+)\s*\(?([^):]+):(\d+):(\d+)\)?/g)].slice(0, 6);
      return {
        markdown: `## Diagnosis

\`\`\`
${e.slice(0, 700)}
\`\`\`

**Most likely cause: ${hit ? hit[1] : 'not in the pattern library — treat it as a novel failure'}**

### Ordered procedure
${(hit ? hit[2] : [
  'Reproduce it deterministically — an intermittent bug you cannot trigger cannot be fixed.',
  'Reduce the input until the failure disappears; the last removed piece is the cause.',
  'Print the actual values at the boundary, not the values you believe are there.',
]).map((s, i) => `${i + 1}. ${s}`).join('\n')}

${frames.length ? `### Stack frames (most recent first)\n${table(['Function', 'File', 'Line'], frames.map((f) => [`\`${f[1]}\``, `\`${f[2].split('/').slice(-2).join('/')}\``, f[3]]))}\n\nYour own code is usually the first frame that is **not** inside \`node_modules\` — start there.` : ''}

${code ? `### Static findings in the code you supplied\n${(() => {
    const { findings } = analyse(stripFences(code));
    return findings.length ? findings.slice(0, 6).map((f) => `- ${f.msg}${f.line ? ` (line ${f.line})` : ''} → ${f.fix}`).join('\n') : '- No rule violations detected; the bug is in the logic, not the syntax.';
  })()}` : ''}

### The debugging discipline
1. **Observe** — read the error completely, including the last frame.
2. **Hypothesise** — write down what you think is happening, in one sentence.
3. **Predict** — "if I am right, then printing X will show Y".
4. **Test** — run it. If the prediction fails, the hypothesis is wrong; do not patch around it.
5. **Fix and prove** — add the test that would have caught it.`,
        data: { matched: !!hit, frames: frames.length },
      };
    },
  },

  {
    id: 'code.complexity',
    name: 'Complexity Analyser',
    category: 'code',
    summary: 'Estimates time/space complexity, finds the hot construct and suggests the better algorithm.',
    tags: ['complexity', 'big o', 'performance', 'optimise', 'slow', 'algorithm'],
    params: [{ name: 'code', type: 'string', required: true, description: 'source to analyse' }],
    match: (m) => (/\b(big o|complexity|why is (this|my) .* slow|optimi[sz]e (this|my) (code|function)|performance of)\b/i.test(m) ? 3 : 0),
    run: ({ code }) => {
      const src = stripFences(code);
      const lines = src.split('\n');
      const loopDepth = (() => {
        let depth = 0; let max = 0;
        for (const l of lines) {
          if (/\b(for|while)\b|\.(map|forEach|filter|reduce)\(/.test(l)) { depth++; max = Math.max(max, depth); }
          if (/^\s*\}/.test(l) && depth > 0) depth--;
        }
        return max;
      })();
      const hasSort = /\.sort\(|sorted\(/.test(src);
      const hasIndexOf = /\.indexOf\(|\.includes\(|\bin\b\s+\w+list/.test(src);
      const hasRecursion = (() => {
        const name = (src.match(/function\s+(\w+)/) || src.match(/const\s+(\w+)\s*=/) || [])[1];
        return name ? new RegExp(`\\b${name}\\s*\\(`).test(src.replace(new RegExp(`function\\s+${name}`), '')) : false;
      })();
      const complexity = loopDepth >= 3 ? 'O(n³)' : loopDepth === 2 ? 'O(n²)' : hasSort ? 'O(n log n)' : loopDepth === 1 ? 'O(n)' : hasRecursion ? 'O(2ⁿ) unless memoised' : 'O(1)';
      const suggestions = [
        loopDepth >= 2 && hasIndexOf ? 'A nested loop containing `indexOf`/`includes` is O(n²) — build a `Set` or `Map` once and look up in O(1).' : null,
        loopDepth >= 2 ? 'Nested iteration over the same collection is usually a join — hash one side into a Map first.' : null,
        hasSort && loopDepth >= 1 ? 'Sorting inside a loop repeats O(n log n) work — sort once outside.' : null,
        hasRecursion ? 'Recursion without memoisation recomputes subproblems — cache on the argument tuple, or convert to bottom-up DP.' : null,
        /\+=\s*['"`]|\+ *['"`]/.test(src) ? 'Building strings with `+=` in a loop is O(n²) in the worst case — push into an array and `join`.' : null,
        /await /.test(src) && /for\s*\(/.test(src) ? 'Awaiting inside a loop serialises network calls — batch with `Promise.all` or a bounded pool.' : null,
        /\.shift\(\)|\.unshift\(/.test(src) ? '`shift`/`unshift` are O(n) — use an index cursor or a deque for queues.' : null,
        /JSON\.parse\(JSON\.stringify/.test(src) ? 'Deep-cloning via JSON is slow and lossy — use `structuredClone`.' : null,
      ].filter(Boolean);
      return {
        markdown: `## Complexity analysis

${table(['Property', 'Finding'], [
  ['Estimated time', `**${complexity}**`],
  ['Max loop nesting', String(loopDepth)],
  ['Sorting present', hasSort ? 'yes — O(n log n) floor' : 'no'],
  ['Recursion', hasRecursion ? 'yes' : 'no'],
  ['Linear scans inside loops', hasIndexOf ? 'yes — likely the bottleneck' : 'no'],
  ['Space', /new (Array|Map|Set)|\[\]|\{\}/.test(src) ? 'O(n) — allocates proportional to input' : 'O(1) auxiliary'],
])}

### Improvements worth making
${suggestions.length ? suggestions.map((s) => `- ${s}`).join('\n') : '- Nothing structural stands out. Before optimising further, profile: the bottleneck is usually I/O or allocation, not the loop you suspect.'}

### The order of operations for performance work
1. **Measure** with a profiler on the real workload (\`node --cpu-prof\`, \`py-spy\`).
2. **Fix the algorithm** — going from O(n²) to O(n) beats any micro-optimisation.
3. **Reduce allocations** — object churn drives GC pauses.
4. **Batch I/O** — one request for 100 items beats 100 requests.
5. **Only then** micro-optimise, and re-measure to prove it helped.

> "Make it work, make it right, make it fast" — in that order. A fast wrong answer has no value.`,
        data: { complexity, loopDepth, hasSort, hasRecursion, suggestions: suggestions.length },
      };
    },
  },

  {
    id: 'code.regex',
    name: 'Regex Builder',
    category: 'code',
    summary: 'Builds and explains a regular expression for a described pattern, with a test harness.',
    tags: ['regex', 'pattern', 'match', 'validate', 'extract'],
    params: [{ name: 'describe', type: 'string', required: true, description: 'what to match, in words' }],
    match: (m) => (/\b(regex|regular expression|pattern (for|to match))\b/i.test(m) ? 3 : 0),
    run: ({ describe }) => {
      const d = String(describe).toLowerCase();
      const LIB = [
        [/email/, String.raw`^[^\s@]+@[^\s@]+\.[^\s@]{2,}$`, 'an email-shaped string (full RFC 5322 is not worth it — send a confirmation)'],
        [/url|link/, String.raw`https?:\/\/[^\s<>"']+`, 'an http(s) URL inside text'],
        [/date|iso/, String.raw`\b\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])\b`, 'an ISO-8601 date'],
        [/time/, String.raw`\b([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?\b`, 'a 24-hour clock time'],
        [/phone/, String.raw`\+?\d[\d\s().-]{7,}\d`, 'a permissive international phone number'],
        [/ip/, String.raw`\b((25[0-5]|2[0-4]\d|[01]?\d?\d)\.){3}(25[0-5]|2[0-4]\d|[01]?\d?\d)\b`, 'an IPv4 address'],
        [/hex|colour|color/, String.raw`#(?:[\da-fA-F]{3}|[\da-fA-F]{6})\b`, 'a hex colour'],
        [/uuid|guid/, String.raw`\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b`, 'a v1–v5 UUID'],
        [/number|digit|numeric/, String.raw`-?\d+(?:\.\d+)?(?:[eE][-+]?\d+)?`, 'an integer, decimal or scientific number'],
        [/word|identifier|variable/, String.raw`\b[A-Za-z_]\w*\b`, 'a programming identifier'],
        [/quote|string literal/, String.raw`(["'])(?:(?!\1)[^\\]|\\.)*\1`, 'a quoted string with escapes'],
        [/whitespace|space/, String.raw`\s+`, 'one or more whitespace characters'],
        [/html tag|tag/, String.raw`<\/?([a-zA-Z][\w-]*)\b[^>]*>`, 'an HTML tag (never use this to parse HTML)'],
        [/password|strong/, String.raw`^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^\w\s]).{12,}$`, 'a 12+ char password with mixed classes (length matters more than classes)'],
        [/slug/, String.raw`^[a-z0-9]+(?:-[a-z0-9]+)*$`, 'a URL slug'],
        [/semver|version/, String.raw`^(\d+)\.(\d+)\.(\d+)(?:-([\w.]+))?$`, 'a semantic version'],
        [/duplicate|repeat/, String.raw`\b(\w+)\s+\1\b`, 'a repeated word, via a backreference'],
        [/comment/, String.raw`\/\/.*$|\/\*[\s\S]*?\*\/`, 'JavaScript comments'],
      ];
      const hit = LIB.find(([re]) => re.test(d));
      const pattern = hit ? hit[1] : String.raw`\b\w+\b`;
      const what = hit ? hit[2] : 'a generic word — describe the target more concretely for a tighter pattern';
      return {
        markdown: `## Regex for: ${describe}

\`\`\`javascript
const pattern = /${pattern}/g;   //  matches ${what}
\`\`\`

### Test harness
\`\`\`javascript
const samples = ['put', 'your', 'examples', 'here'];
for (const s of samples) {
  const m = s.match(new RegExp(\`${pattern.replace(/`/g, '\\`')}\`));
  console.log(JSON.stringify(s).padEnd(24), m ? '✓ ' + m[0] : '✗ no match');
}
\`\`\`

### Anatomy
${pattern.split('').length > 0 ? [
  ['^ $', 'anchors — the whole string must match, not just part of it'],
  ['\\b', 'word boundary — prevents matching inside a longer word'],
  ['[...]', 'character class — any one character listed'],
  ['(?:...)', 'group without capturing — cheaper and keeps capture indices clean'],
  ['+ * ?', 'one-or-more, zero-or-more, optional'],
  ['{n,m}', 'bounded repetition — always prefer bounds over `*` on untrusted input'],
  ['(?=...)', 'lookahead — asserts without consuming'],
].map(([a, b]) => `- \`${a}\` — ${b}`).join('\n') : ''}

### Rules that prevent regex disasters
1. Anchor validation patterns; an unanchored pattern matches a substring and passes garbage.
2. Avoid nested quantifiers like \`(a+)+\` — hostile input causes catastrophic backtracking.
3. Regex is for lexing, not parsing: HTML, JSON and email addresses need real parsers.
4. Test the negative cases. A pattern that matches everything you tried is not validated.`,
        data: { pattern, description: what },
      };
    },
  },
];
