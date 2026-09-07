/**
 * recipes.js — canonical, correct code recipes.
 *
 * Single source of truth used twice:
 *   1. the corpus generator trains the language model on them, so the model
 *      learns real code token statistics rather than pseudo-code;
 *   2. the `code.write` skill serves them verbatim, so the console can answer
 *      coding questions with code that actually runs.
 */

export const RECIPES = [
  {
    id: 'js-debounce', lang: 'javascript', title: 'Debounce a function',
    tags: ['debounce', 'timer', 'events', 'performance', 'input'],
    task: 'delay a call until the caller stops firing for N milliseconds',
    code: `function debounce(fn, wait = 250, { leading = false } = {}) {
  let timer = null;
  let lastArgs = null;
  return function debounced(...args) {
    lastArgs = args;
    const callNow = leading && timer === null;
    clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      if (!leading) fn.apply(this, lastArgs);
    }, wait);
    if (callNow) fn.apply(this, args);
  };
}`,
    explain: 'Every call resets the timer, so the wrapped function only runs once the caller has been quiet for `wait` ms. The `leading` option fires immediately on the first call and then suppresses the trailing edge.',
    pitfalls: 'Arrow functions capture `this` lexically — use a normal function if the callee depends on the call site. Debouncing a React event handler requires `useMemo`/`useRef`, otherwise a new timer is created every render.',
  },
  {
    id: 'js-throttle', lang: 'javascript', title: 'Throttle a function',
    tags: ['throttle', 'rate limit', 'scroll', 'performance'],
    task: 'run at most once per interval, no matter how often it is called',
    code: `function throttle(fn, interval = 200) {
  let last = 0;
  let pending = null;
  return function throttled(...args) {
    const now = Date.now();
    const remaining = interval - (now - last);
    if (remaining <= 0) {
      last = now;
      clearTimeout(pending);
      pending = null;
      return fn.apply(this, args);
    }
    if (pending === null) {
      pending = setTimeout(() => {
        last = Date.now();
        pending = null;
        fn.apply(this, args);
      }, remaining);
    }
  };
}`,
    explain: 'Throttle guarantees a steady maximum rate; debounce guarantees quiet time before firing. Scroll and resize handlers want throttle, search-as-you-type wants debounce.',
    pitfalls: 'Without the trailing timeout the final event is dropped, which is usually the one that matters (the last scroll position).',
  },
  {
    id: 'js-fetch-retry', lang: 'javascript', title: 'Fetch with timeout, retry and exponential backoff',
    tags: ['fetch', 'http', 'retry', 'timeout', 'network', 'backoff'],
    task: 'make an HTTP request resilient to transient failures',
    code: `async function fetchJSON(url, { retries = 3, timeout = 8000, ...init } = {}) {
  let lastError;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    try {
      const res = await fetch(url, { ...init, signal: controller.signal });
      if (res.status >= 500 || res.status === 429) {
        throw new Error(\`retryable status \${res.status}\`);
      }
      if (!res.ok) throw Object.assign(new Error(\`HTTP \${res.status}\`), { fatal: true });
      return await res.json();
    } catch (err) {
      lastError = err;
      if (err.fatal || attempt === retries) break;
      const backoff = Math.min(2 ** attempt * 250, 4000);
      const jitter = Math.random() * backoff * 0.3;
      await new Promise((r) => setTimeout(r, backoff + jitter));
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastError;
}`,
    explain: 'Retries only on transient conditions (5xx, 429, network abort), backs off exponentially, and adds jitter so a fleet of clients does not synchronise into a thundering herd.',
    pitfalls: 'Never retry non-idempotent POSTs blindly. Always clear the abort timer in `finally`, otherwise the process keeps a handle alive.',
  },
  {
    id: 'js-deepclone', lang: 'javascript', title: 'Deep clone a value',
    tags: ['clone', 'copy', 'deep', 'object', 'immutable'],
    task: 'copy nested structures without sharing references',
    code: `function deepClone(value, seen = new WeakMap()) {
  if (value === null || typeof value !== 'object') return value;
  if (seen.has(value)) return seen.get(value);           // handles cycles
  if (value instanceof Date) return new Date(value);
  if (value instanceof RegExp) return new RegExp(value.source, value.flags);
  if (value instanceof Map) {
    const out = new Map();
    seen.set(value, out);
    for (const [k, v] of value) out.set(deepClone(k, seen), deepClone(v, seen));
    return out;
  }
  if (value instanceof Set) {
    const out = new Set();
    seen.set(value, out);
    for (const v of value) out.add(deepClone(v, seen));
    return out;
  }
  const out = Array.isArray(value) ? [] : Object.create(Object.getPrototypeOf(value));
  seen.set(value, out);
  for (const key of Reflect.ownKeys(value)) out[key] = deepClone(value[key], seen);
  return out;
}`,
    explain: 'The WeakMap makes cyclic graphs terminate and preserves shared references. `structuredClone()` is built into modern runtimes and is faster — use it unless you need functions or custom prototypes preserved.',
    pitfalls: '`JSON.parse(JSON.stringify(x))` silently destroys Dates, Maps, Sets, undefined, NaN and cycles.',
  },
  {
    id: 'js-lru', lang: 'javascript', title: 'LRU cache',
    tags: ['cache', 'lru', 'memory', 'map', 'eviction'],
    task: 'bounded cache that evicts the least recently used entry',
    code: `class LRUCache {
  constructor(limit = 100) {
    this.limit = limit;
    this.map = new Map();          // insertion order == recency order
  }
  get(key) {
    if (!this.map.has(key)) return undefined;
    const value = this.map.get(key);
    this.map.delete(key);
    this.map.set(key, value);      // move to the most-recent end
    return value;
  }
  set(key, value) {
    if (this.map.has(key)) this.map.delete(key);
    this.map.set(key, value);
    if (this.map.size > this.limit) {
      this.map.delete(this.map.keys().next().value);  // oldest key
    }
    return this;
  }
  get size() { return this.map.size; }
}`,
    explain: 'JavaScript Maps iterate in insertion order, so delete-then-set is an O(1) "touch". No linked list needed.',
    pitfalls: 'Object keys are compared by reference. For cache keys, serialise to a string or use a WeakMap when the key is the object itself.',
  },
  {
    id: 'js-memoize', lang: 'javascript', title: 'Memoize an expensive function',
    tags: ['memoize', 'cache', 'performance', 'pure function'],
    task: 'avoid recomputing results for arguments already seen',
    code: `function memoize(fn, keyFn = (...args) => JSON.stringify(args)) {
  const cache = new Map();
  const memoized = (...args) => {
    const key = keyFn(...args);
    if (cache.has(key)) return cache.get(key);
    const result = fn(...args);
    cache.set(key, result);
    return result;
  };
  memoized.cache = cache;
  memoized.clear = () => cache.clear();
  return memoized;
}`,
    explain: 'Only memoise pure functions: same input must always give the same output, with no side effects worth repeating.',
    pitfalls: 'An unbounded cache is a memory leak in a long-running process. Combine with the LRU above when the key space is large.',
  },
  {
    id: 'js-async-pool', lang: 'javascript', title: 'Run async tasks with bounded concurrency',
    tags: ['async', 'concurrency', 'pool', 'parallel', 'promise'],
    task: 'process a large list N-at-a-time instead of all at once',
    code: `async function asyncPool(items, worker, concurrency = 5) {
  const results = new Array(items.length);
  let cursor = 0;
  const runners = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await worker(items[index], index);
    }
  });
  await Promise.all(runners);
  return results;
}`,
    explain: 'A fixed number of runners pull from a shared cursor, so exactly `concurrency` tasks are in flight and results stay in input order.',
    pitfalls: '`Promise.all(items.map(worker))` launches everything at once and will exhaust sockets or hit rate limits. Use `Promise.allSettled` semantics inside the worker if one failure must not kill the batch.',
  },
  {
    id: 'js-groupby', lang: 'javascript', title: 'Group, count and aggregate an array',
    tags: ['groupby', 'aggregate', 'reduce', 'array', 'data'],
    task: 'summarise records by a key',
    code: `const groupBy = (rows, keyFn) => rows.reduce((acc, row) => {
  const key = keyFn(row);
  (acc[key] ||= []).push(row);
  return acc;
}, {});

const summarise = (rows, keyFn, valueFn) => {
  const groups = groupBy(rows, keyFn);
  return Object.entries(groups).map(([key, items]) => {
    const values = items.map(valueFn).filter(Number.isFinite);
    const sum = values.reduce((a, b) => a + b, 0);
    const mean = sum / (values.length || 1);
    const sd = Math.sqrt(values.reduce((a, v) => a + (v - mean) ** 2, 0) / Math.max(1, values.length - 1));
    return { key, n: items.length, sum, mean, sd, min: Math.min(...values), max: Math.max(...values) };
  }).sort((a, b) => b.n - a.n);
};`,
    explain: 'One pass to bucket, one pass per bucket to aggregate. `Object.groupBy` is now standard in Node 21+ and modern browsers if you can rely on it.',
    pitfalls: 'Guard against empty groups before dividing, and remember `Math.min(...[])` returns `Infinity`.',
  },
  {
    id: 'js-eventemitter', lang: 'javascript', title: 'Tiny event emitter',
    tags: ['events', 'emitter', 'pubsub', 'observer'],
    task: 'decouple producers from consumers',
    code: `class Emitter {
  #handlers = new Map();
  on(event, fn) {
    if (!this.#handlers.has(event)) this.#handlers.set(event, new Set());
    this.#handlers.get(event).add(fn);
    return () => this.off(event, fn);          // unsubscribe handle
  }
  once(event, fn) {
    const off = this.on(event, (...args) => { off(); fn(...args); });
    return off;
  }
  off(event, fn) { this.#handlers.get(event)?.delete(fn); }
  emit(event, ...args) {
    for (const fn of [...(this.#handlers.get(event) ?? [])]) {
      try { fn(...args); } catch (err) { queueMicrotask(() => { throw err; }); }
    }
    return this;
  }
}`,
    explain: 'Returning the unsubscribe function from `on` makes cleanup impossible to forget. Copying the handler set before iterating allows handlers to unsubscribe during emit.',
    pitfalls: 'A throwing listener must not stop the others; rethrowing in a microtask preserves the stack without breaking the loop.',
  },
  {
    id: 'js-binary-search', lang: 'javascript', title: 'Binary search and insertion point',
    tags: ['binary search', 'algorithm', 'sorted', 'search', 'log n'],
    task: 'find a value, or where it belongs, in a sorted array',
    code: `function lowerBound(arr, target, cmp = (a, b) => a - b) {
  let lo = 0, hi = arr.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;           // avoids overflow, floors
    if (cmp(arr[mid], target) < 0) lo = mid + 1; else hi = mid;
  }
  return lo;                                // first index >= target
}

function binarySearch(arr, target, cmp = (a, b) => a - b) {
  const i = lowerBound(arr, target, cmp);
  return i < arr.length && cmp(arr[i], target) === 0 ? i : -1;
}`,
    explain: 'Writing the search as `lowerBound` gives you insertion position, membership and range queries from one primitive. O(log n) time, O(1) space.',
    pitfalls: 'The array must actually be sorted by the same comparator. `(lo + hi) / 2` without the shift produces a float index.',
  },
  {
    id: 'js-quicksort', lang: 'javascript', title: 'Sorting: comparator pitfalls and a quicksort',
    tags: ['sort', 'quicksort', 'comparator', 'algorithm'],
    task: 'sort correctly, and know what the built-in sort does',
    code: `// The built-in sort is stable (spec since ES2019) but coerces to string by default:
[10, 9, 1].sort();                 // [1, 10, 9]  ← lexicographic!
[10, 9, 1].sort((a, b) => a - b);  // [1, 9, 10]  ← numeric

// Multi-key sort, readable and stable:
const by = (...fns) => (a, b) => fns.reduce((acc, f) => acc || f(a, b), 0);
const asc = (key) => (a, b) => (a[key] > b[key]) - (a[key] < b[key]);
const desc = (key) => (a, b) => asc(key)(b, a);
rows.sort(by(desc('score'), asc('name')));

// Quicksort with median-of-three, for the interview:
function quicksort(a, lo = 0, hi = a.length - 1) {
  if (lo >= hi) return a;
  const mid = (lo + hi) >>> 1;
  const pivot = [a[lo], a[mid], a[hi]].sort((x, y) => x - y)[1];
  let i = lo, j = hi;
  while (i <= j) {
    while (a[i] < pivot) i++;
    while (a[j] > pivot) j--;
    if (i <= j) { [a[i], a[j]] = [a[j], a[i]]; i++; j--; }
  }
  quicksort(a, lo, j);
  quicksort(a, i, hi);
  return a;
}`,
    explain: 'Median-of-three pivoting avoids the O(n²) worst case on already-sorted input, which is exactly the input you get in production.',
    pitfalls: 'A comparator must be consistent and transitive; returning a boolean instead of a number produces undefined behaviour.',
  },
  {
    id: 'js-graph', lang: 'javascript', title: 'BFS shortest path on a graph',
    tags: ['graph', 'bfs', 'shortest path', 'algorithm', 'traversal'],
    task: 'find the fewest hops between two nodes',
    code: `function shortestPath(graph, start, goal) {
  const queue = [start];
  const prev = new Map([[start, null]]);
  while (queue.length) {
    const node = queue.shift();
    if (node === goal) break;
    for (const next of graph.get(node) ?? []) {
      if (prev.has(next)) continue;
      prev.set(next, node);
      queue.push(next);
    }
  }
  if (!prev.has(goal)) return null;
  const path = [];
  for (let at = goal; at !== null; at = prev.get(at)) path.unshift(at);
  return path;
}`,
    explain: 'BFS visits nodes in order of distance, so the first time you reach the goal you have a shortest path in edges. Store the predecessor to reconstruct it.',
    pitfalls: '`Array.shift()` is O(n); for large graphs use an index cursor or a deque. For weighted edges you need Dijkstra with a priority queue instead.',
  },
  {
    id: 'js-dp-edit', lang: 'javascript', title: 'Dynamic programming: edit distance',
    tags: ['dynamic programming', 'edit distance', 'levenshtein', 'algorithm', 'strings'],
    task: 'measure how many edits turn one string into another',
    code: `function editDistance(a, b) {
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const curr = [i];
    for (let j = 1; j <= b.length; j++) {
      curr[j] = Math.min(
        prev[j] + 1,                                   // deletion
        curr[j - 1] + 1,                               // insertion
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1), // substitution
      );
    }
    prev = curr;
  }
  return prev[b.length];
}`,
    explain: 'Only the previous row is needed, so memory is O(min(m,n)) instead of O(mn). Time stays O(mn).',
    pitfalls: 'For Unicode, iterate over code points (`[...str]`) rather than UTF-16 units, or emoji count as two edits.',
  },
  {
    id: 'js-react-hook', lang: 'javascript', title: 'Custom React hooks: debounced value, fetch, localStorage',
    tags: ['react', 'hook', 'usestate', 'useeffect', 'frontend'],
    task: 'three hooks that cover most app plumbing',
    code: `function useDebounced(value, delay = 300) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);        // cleanup cancels the stale timer
  }, [value, delay]);
  return debounced;
}

function useFetch(url, options) {
  const [state, setState] = useState({ loading: true, data: null, error: null });
  useEffect(() => {
    if (!url) return undefined;
    const ctl = new AbortController();
    setState({ loading: true, data: null, error: null });
    fetch(url, { ...options, signal: ctl.signal })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(\`HTTP \${r.status}\`))))
      .then((data) => setState({ loading: false, data, error: null }))
      .catch((error) => { if (error.name !== 'AbortError') setState({ loading: false, data: null, error }); });
    return () => ctl.abort();            // cancel on unmount / url change
  }, [url]);
  return state;
}

function useLocalStorage(key, initial) {
  const [value, setValue] = useState(() => {
    try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : initial; }
    catch { return initial; }
  });
  useEffect(() => { localStorage.setItem(key, JSON.stringify(value)); }, [key, value]);
  return [value, setValue];
}`,
    explain: 'Every effect that starts something must return the function that stops it. Aborting in-flight requests prevents the classic "setState on unmounted component" race and out-of-order responses.',
    pitfalls: 'Objects and arrays in the dependency array change identity every render — memoise them or depend on primitive fields.',
  },
  {
    id: 'js-express', lang: 'javascript', title: 'Express API with validation and error handling',
    tags: ['express', 'node', 'api', 'server', 'rest', 'backend'],
    task: 'a small HTTP service that fails safely',
    code: `import express from 'express';

const app = express();
app.use(express.json({ limit: '1mb' }));

const asyncRoute = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

app.post('/api/items', asyncRoute(async (req, res) => {
  const { name, quantity } = req.body ?? {};
  if (typeof name !== 'string' || !name.trim()) {
    return res.status(400).json({ error: 'name is required' });
  }
  const qty = Number(quantity ?? 1);
  if (!Number.isInteger(qty) || qty < 1) {
    return res.status(400).json({ error: 'quantity must be a positive integer' });
  }
  const item = await db.items.create({ name: name.trim(), quantity: qty });
  res.status(201).json(item);
}));

app.use((err, _req, res, _next) => {          // 4 args = error middleware
  console.error(err);
  res.status(err.status ?? 500).json({ error: err.expose ? err.message : 'internal error' });
});

app.listen(process.env.PORT ?? 3000, '0.0.0.0');`,
    explain: 'Wrapping async handlers forwards rejected promises to the error middleware; Express 4 does not do this for you. Validate at the boundary and never echo internal error text to clients.',
    pitfalls: 'Error middleware must take exactly four parameters or Express treats it as a normal handler.',
  },
  {
    id: 'js-stream', lang: 'javascript', title: 'Process a huge file line by line in Node',
    tags: ['stream', 'node', 'file', 'memory', 'readline', 'large file'],
    task: 'read gigabytes without loading them into memory',
    code: `import fs from 'node:fs';
import readline from 'node:readline';
import { pipeline } from 'node:stream/promises';

const rl = readline.createInterface({
  input: fs.createReadStream('huge.csv', { encoding: 'utf8', highWaterMark: 1 << 20 }),
  crlfDelay: Infinity,
});

let count = 0;
let sum = 0;
for await (const line of rl) {
  if (count++ === 0) continue;              // header
  const value = Number(line.split(',')[2]);
  if (Number.isFinite(value)) sum += value;
}
console.log({ rows: count - 1, mean: sum / (count - 1) });`,
    explain: '`for await` applies backpressure automatically: the stream pauses while your loop body is busy, so memory stays flat regardless of file size.',
    pitfalls: '`fs.readFileSync` on a 2 GB file will crash the process. Splitting CSV on commas breaks on quoted fields — use a real parser when the data is untrusted.',
  },
  {
    id: 'js-worker', lang: 'javascript', title: 'Offload CPU work to a worker thread',
    tags: ['worker', 'thread', 'cpu', 'parallel', 'node', 'blocking'],
    task: 'keep the event loop responsive during heavy computation',
    code: `// worker.js
import { parentPort, workerData } from 'node:worker_threads';
const result = heavyComputation(workerData);
parentPort.postMessage(result);

// main.js
import { Worker } from 'node:worker_threads';

const runWorker = (data) => new Promise((resolve, reject) => {
  const worker = new Worker(new URL('./worker.js', import.meta.url), { workerData: data });
  worker.once('message', resolve);
  worker.once('error', reject);
  worker.once('exit', (code) => { if (code !== 0) reject(new Error(\`worker exit \${code}\`)); });
});

const results = await Promise.all(chunks.map(runWorker));`,
    explain: 'Node is single-threaded for JavaScript: a 2-second loop blocks every request. Workers give real parallelism; `SharedArrayBuffer` avoids copying large numeric data.',
    pitfalls: 'Spawning a worker costs ~10 ms — pool them for small tasks. Objects are structured-cloned across the boundary, so functions and class identity do not survive.',
  },
  {
    id: 'js-testing', lang: 'javascript', title: 'Unit tests with the built-in Node test runner',
    tags: ['test', 'testing', 'unit test', 'assert', 'node:test', 'tdd'],
    task: 'test code without installing a framework',
    code: `import test from 'node:test';
import assert from 'node:assert/strict';
import { editDistance } from './strings.js';

test('edit distance', async (t) => {
  await t.test('identical strings cost nothing', () => {
    assert.equal(editDistance('kitten', 'kitten'), 0);
  });
  await t.test('classic example', () => {
    assert.equal(editDistance('kitten', 'sitting'), 3);
  });
  await t.test('empty string equals the other length', () => {
    assert.equal(editDistance('', 'abc'), 3);
  });
});

test('async code rejects with a typed error', async () => {
  await assert.rejects(() => fetchJSON('http://127.0.0.1:1/none'), /fetch failed|ECONNREFUSED/);
});`,
    explain: 'Run with `node --test "tests/*.test.js"`. Sub-tests keep failures readable; `assert/strict` avoids the `==` traps of the loose API.',
    pitfalls: 'Test the boundaries — empty input, one element, duplicates, unicode — not the happy path you already know works.',
  },
  {
    id: 'js-regex', lang: 'javascript', title: 'Practical regular expressions',
    tags: ['regex', 'validation', 'parse', 'string', 'match'],
    task: 'extract and validate without writing a parser',
    code: `const patterns = {
  email:    /^[^\\s@]+@[^\\s@]+\\.[^\\s@]{2,}$/,
  isoDate:  /^\\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\\d|3[01])$/,
  semver:   /^(\\d+)\\.(\\d+)\\.(\\d+)(?:-([\\w.]+))?$/,
  hexColor: /^#(?:[\\da-f]{3}|[\\da-f]{6})$/i,
  slug:     /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
};

// named groups + matchAll for extraction
const LOG = /(?<ts>\\d{4}-\\d{2}-\\d{2}T[\\d:.]+Z)\\s+(?<level>\\w+)\\s+(?<msg>.*)/g;
for (const m of logText.matchAll(LOG)) {
  const { ts, level, msg } = m.groups;
  if (level === 'ERROR') console.log(ts, msg);
}`,
    explain: 'Anchor validation patterns with `^...$`, use named groups for readability, and `matchAll` with the `g` flag to iterate matches lazily.',
    pitfalls: 'Nested quantifiers like `(a+)+` cause catastrophic backtracking on hostile input. Never validate HTML or emails "properly" with regex — send a confirmation instead.',
  },
  {
    id: 'py-pandas', lang: 'python', title: 'Load, clean and summarise a dataset with pandas',
    tags: ['python', 'pandas', 'dataframe', 'csv', 'data cleaning'],
    task: 'go from raw CSV to a trustworthy summary table',
    code: `import pandas as pd

df = pd.read_csv("data.csv", parse_dates=["date"], dtype_backend="numpy_nullable")

# 1. inspect before trusting
print(df.shape, df.dtypes, sep="\\n")
print(df.isna().mean().sort_values(ascending=False).head())

# 2. clean explicitly, never silently
df = (df
      .drop_duplicates(subset=["id"])
      .assign(group=lambda d: d["group"].str.strip().str.lower())
      .query("age.between(18, 99)", engine="python"))

# 3. summarise with the uncertainty attached
summary = (df.groupby("group")["score"]
             .agg(n="count", mean="mean", sd="std")
             .assign(se=lambda d: d["sd"] / d["n"] ** 0.5,
                     ci_low=lambda d: d["mean"] - 1.96 * d["se"],
                     ci_high=lambda d: d["mean"] + 1.96 * d["se"])
             .round(3))
print(summary)`,
    explain: 'Method chaining keeps every transformation visible and reversible. Reporting n, sd and an interval alongside the mean stops readers over-reading a difference.',
    pitfalls: 'Chained assignment (`df[df.a > 1]["b"] = 0`) writes to a copy. Use `.loc[]`. Always check `isna()` before aggregating — pandas skips NaN silently.',
  },
  {
    id: 'py-async', lang: 'python', title: 'Concurrent HTTP requests with asyncio',
    tags: ['python', 'asyncio', 'async', 'http', 'concurrency', 'aiohttp'],
    task: 'fetch many URLs without waiting for each in turn',
    code: `import asyncio, aiohttp

async def fetch(session, url, sem, retries=3):
    async with sem:                                   # bound concurrency
        for attempt in range(retries + 1):
            try:
                async with session.get(url, timeout=aiohttp.ClientTimeout(total=10)) as r:
                    r.raise_for_status()
                    return await r.json()
            except (aiohttp.ClientError, asyncio.TimeoutError):
                if attempt == retries:
                    raise
                await asyncio.sleep(2 ** attempt * 0.25)

async def main(urls):
    sem = asyncio.Semaphore(10)
    async with aiohttp.ClientSession() as session:
        tasks = [fetch(session, u, sem) for u in urls]
        return await asyncio.gather(*tasks, return_exceptions=True)

results = asyncio.run(main(urls))
ok = [r for r in results if not isinstance(r, Exception)]`,
    explain: 'One session reuses connections, the semaphore caps in-flight requests, and `return_exceptions=True` means one failure does not cancel the batch.',
    pitfalls: 'Do not call `asyncio.run` inside a running loop (notebooks). CPU-bound work in a coroutine blocks everything — use `run_in_executor`.',
  },
  {
    id: 'py-idioms', lang: 'python', title: 'Python idioms worth internalising',
    tags: ['python', 'idioms', 'clean code', 'dataclass', 'context manager', 'decorator'],
    task: 'write Python that reads like Python',
    code: `from dataclasses import dataclass, field
from contextlib import contextmanager
from functools import lru_cache, wraps
import time

@dataclass(slots=True, frozen=True)
class Measurement:
    subject: str
    value: float
    tags: tuple[str, ...] = field(default_factory=tuple)

@contextmanager
def timed(label):
    start = time.perf_counter()
    try:
        yield
    finally:
        print(f"{label}: {time.perf_counter() - start:.3f}s")

def retry(times=3, delay=0.2):
    def decorator(fn):
        @wraps(fn)
        def wrapper(*args, **kwargs):
            for attempt in range(times):
                try:
                    return fn(*args, **kwargs)
                except Exception:
                    if attempt == times - 1:
                        raise
                    time.sleep(delay * 2 ** attempt)
        return wrapper
    return decorator

@lru_cache(maxsize=1024)
def expensive(n: int) -> int:
    return sum(i * i for i in range(n))

with timed("scan"):
    total = sum(m.value for m in measurements if "clean" in m.tags)`,
    explain: '`slots=True` cuts memory and blocks typos; `@wraps` keeps the wrapped function’s name and docstring; generator expressions stream instead of materialising lists.',
    pitfalls: 'Mutable default arguments (`def f(x=[])`) are shared across calls — use `None` or `field(default_factory=...)`.',
  },
  {
    id: 'py-numpy', lang: 'python', title: 'Vectorise with NumPy instead of looping',
    tags: ['python', 'numpy', 'vectorise', 'performance', 'array', 'broadcast'],
    task: 'make numeric Python 50-100x faster',
    code: `import numpy as np

rng = np.random.default_rng(seed=42)          # reproducible, modern API
x = rng.normal(size=(10_000, 3))

# slow: python loop
# out = [row[0] * 2 + row[1] ** 2 for row in x]

# fast: vectorised, no python-level loop
out = x[:, 0] * 2 + x[:, 1] ** 2

# broadcasting: standardise every column at once
z = (x - x.mean(axis=0)) / x.std(axis=0, ddof=1)

# boolean masks instead of filters
outliers = np.abs(z) > 3
print(f"{outliers.any(axis=1).sum()} rows contain an outlier")

# einsum for explicit tensor contractions
gram = np.einsum("ij,ik->jk", x, x)`,
    explain: 'NumPy pushes the loop into C. Broadcasting aligns shapes from the right, so `(n,3) - (3,)` standardises each column without a loop.',
    pitfalls: 'Use `ddof=1` for a sample standard deviation. Fancy indexing copies; basic slicing returns a view that shares memory.',
  },
  {
    id: 'sql-basics', lang: 'sql', title: 'SQL that answers analytical questions',
    tags: ['sql', 'query', 'join', 'window function', 'group by', 'database'],
    task: 'aggregate, rank and de-duplicate in the database',
    code: `-- per-group aggregate with a filter after aggregation
SELECT g.name AS "group",
       COUNT(*)                       AS n,
       AVG(m.score)                   AS mean_score,
       STDDEV_SAMP(m.score)           AS sd
FROM measurements m
JOIN groups g ON g.id = m.group_id
WHERE m.taken_at >= DATE '2026-01-01'
GROUP BY g.name
HAVING COUNT(*) >= 20
ORDER BY mean_score DESC;

-- latest row per entity, without a correlated subquery
SELECT *
FROM (
  SELECT m.*,
         ROW_NUMBER() OVER (PARTITION BY subject_id ORDER BY taken_at DESC) AS rn
  FROM measurements m
) ranked
WHERE rn = 1;

-- running total and percentage of group
SELECT subject_id, taken_at, score,
       SUM(score) OVER (PARTITION BY subject_id ORDER BY taken_at) AS running_total,
       score / SUM(score) OVER (PARTITION BY subject_id)           AS share
FROM measurements;`,
    explain: 'WHERE filters rows, HAVING filters groups. Window functions compute per-row values over a partition without collapsing the result set.',
    pitfalls: 'COUNT(column) skips NULLs while COUNT(*) does not. Always index the partition/order columns of a window or it sorts the whole table.',
  },
  {
    id: 'js-security', lang: 'javascript', title: 'Hash a password and verify it (Node crypto)',
    tags: ['security', 'password', 'hash', 'crypto', 'auth', 'scrypt'],
    task: 'store credentials without storing the secret',
    code: `import { scrypt, randomBytes, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
const scryptAsync = promisify(scrypt);

export async function hashPassword(password) {
  const salt = randomBytes(16);
  const key = await scryptAsync(password.normalize('NFKC'), salt, 64, { N: 2 ** 15 });
  return \`scrypt$\${salt.toString('base64')}$\${key.toString('base64')}\`;
}

export async function verifyPassword(password, stored) {
  const [scheme, saltB64, keyB64] = stored.split('$');
  if (scheme !== 'scrypt') return false;
  const salt = Buffer.from(saltB64, 'base64');
  const expected = Buffer.from(keyB64, 'base64');
  const actual = await scryptAsync(password.normalize('NFKC'), salt, expected.length, { N: 2 ** 15 });
  return timingSafeEqual(actual, expected);          // constant time
}`,
    explain: 'A memory-hard KDF (scrypt/argon2/bcrypt) plus a unique random salt makes rainbow tables and GPU cracking uneconomic. Comparison must be constant-time or it leaks the prefix.',
    pitfalls: 'Never use SHA-256 alone for passwords — it is too fast. Never log the password, and normalise unicode so "é" typed two ways still matches.',
  },
  {
    id: 'js-webcrypto', lang: 'javascript', title: 'Browser-side key derivation with WebCrypto',
    tags: ['webcrypto', 'browser', 'pbkdf2', 'auth', 'client', 'security'],
    task: 'derive a verifier in the browser with no dependencies',
    code: `async function deriveKey(password, saltBytes, iterations = 210_000) {
  const enc = new TextEncoder();
  const base = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: saltBytes, iterations, hash: 'SHA-256' },
    base,
    256,
  );
  return new Uint8Array(bits);
}

const salt = crypto.getRandomValues(new Uint8Array(16));
const verifier = await deriveKey('correct horse battery staple', salt);
const hex = [...verifier].map((b) => b.toString(16).padStart(2, '0')).join('');`,
    explain: 'PBKDF2 with 210k iterations is the current OWASP floor for SHA-256. `crypto.getRandomValues` is a CSPRNG; `Math.random` is not.',
    pitfalls: 'Client-side hashing protects a local vault, not a network protocol — over the wire the derived value *is* the password unless you add a challenge.',
  },
  {
    id: 'js-indexeddb', lang: 'javascript', title: 'IndexedDB without a library',
    tags: ['indexeddb', 'browser', 'storage', 'offline', 'database', 'local'],
    task: 'persist structured data in the browser',
    code: `function openDB(name, version, upgrade) {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(name, version);
    req.onupgradeneeded = (e) => upgrade(req.result, e.oldVersion);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

const db = await openDB('app', 1, (db) => {
  const store = db.createObjectStore('messages', { keyPath: 'id' });
  store.createIndex('byConversation', 'conversationId');
});

const tx = (store, mode = 'readonly') => db.transaction(store, mode).objectStore(store);
const put = (store, value) => new Promise((res, rej) => {
  const r = tx(store, 'readwrite').put(value);
  r.onsuccess = () => res(value);
  r.onerror = () => rej(r.error);
});
const allByIndex = (store, index, key) => new Promise((res, rej) => {
  const r = tx(store).index(index).getAll(key);
  r.onsuccess = () => res(r.result);
  r.onerror = () => rej(r.error);
});`,
    explain: 'IndexedDB stores structured-cloneable values (objects, Blobs, typed arrays) with no size cap beyond the origin quota, unlike localStorage’s ~5 MB of strings.',
    pitfalls: 'Transactions auto-close at the end of the microtask that created them — never `await` non-IDB work in the middle of one.',
  },
  {
    id: 'js-errors', lang: 'javascript', title: 'Error handling that survives production',
    tags: ['error', 'exception', 'try catch', 'debug', 'logging'],
    task: 'fail in a way that can be diagnosed',
    code: `class AppError extends Error {
  constructor(message, { status = 500, code = 'internal', cause, expose = false } = {}) {
    super(message, { cause });
    this.name = 'AppError';
    this.status = status;
    this.code = code;
    this.expose = expose;
    Error.captureStackTrace?.(this, AppError);
  }
}

try {
  await loadProfile(id);
} catch (err) {
  throw new AppError('could not load profile', { status: 502, code: 'upstream', cause: err, expose: true });
}

process.on('unhandledRejection', (reason) => {
  console.error('unhandled rejection', reason);
  process.exitCode = 1;                 // let in-flight work drain, then die
});`,
    explain: 'Typed errors carry the machine-readable bits (status, code) next to the human message. `cause` preserves the original stack instead of swallowing it.',
    pitfalls: 'An empty `catch {}` is how outages become mysteries. Logging `err.message` alone loses the stack; log the error object.',
  },
  {
    id: 'js-perf', lang: 'javascript', title: 'Measure before optimising',
    tags: ['performance', 'benchmark', 'profiling', 'optimise', 'measure'],
    task: 'know which line is actually slow',
    code: `import { performance } from 'node:perf_hooks';

function bench(label, fn, { iterations = 1000, warmup = 100 } = {}) {
  for (let i = 0; i < warmup; i++) fn();          // let the JIT settle
  const samples = new Float64Array(iterations);
  for (let i = 0; i < iterations; i++) {
    const t0 = performance.now();
    fn();
    samples[i] = performance.now() - t0;
  }
  const sorted = Float64Array.from(samples).sort();
  const pct = (p) => sorted[Math.floor(p * (iterations - 1))];
  console.log(\`\${label}: median \${pct(0.5).toFixed(4)}ms  p95 \${pct(0.95).toFixed(4)}ms  min \${sorted[0].toFixed(4)}ms\`);
}

bench('map+filter', () => data.map(f).filter(g));
bench('single reduce', () => data.reduce((acc, x) => (g(f(x)) ? (acc.push(f(x)), acc) : acc), []));`,
    explain: 'Report the median and p95, never the mean of a noisy timing distribution. Warm-up matters because V8 optimises after the function is hot.',
    pitfalls: 'Micro-benchmarks lie when the optimiser deletes work whose result is unused — consume the value. Profile the real workload with `node --cpu-prof` before rewriting anything.',
  },
  {
    id: 'js-immutable', lang: 'javascript', title: 'Immutable state updates',
    tags: ['immutable', 'state', 'redux', 'spread', 'update', 'react'],
    task: 'change nested state without mutating it',
    code: `// replace one item in an array of objects
const updateItem = (items, id, patch) =>
  items.map((item) => (item.id === id ? { ...item, ...patch } : item));

// update a nested path immutably
const setIn = (obj, path, value) => {
  const [head, ...rest] = path;
  const next = Array.isArray(obj) ? [...obj] : { ...obj };
  next[head] = rest.length ? setIn(obj[head] ?? {}, rest, value) : value;
  return next;
};

const state2 = setIn(state, ['users', 3, 'profile', 'city'], 'Hanoi');

// remove and insert without splice mutating the source
const removeAt = (a, i) => [...a.slice(0, i), ...a.slice(i + 1)];
const insertAt = (a, i, v) => [...a.slice(0, i), v, ...a.slice(i)];`,
    explain: 'Returning new references is what lets React, Redux and memoisation detect change with `===` instead of a deep comparison.',
    pitfalls: 'The spread operator is shallow: `{...state}` still shares every nested object. Mutating those is the most common "why did my component not re-render" bug.',
  },
  {
    id: 'js-date', lang: 'javascript', title: 'Dates and time zones without tears',
    tags: ['date', 'time', 'timezone', 'format', 'iso', 'utc'],
    task: 'store, compare and display timestamps correctly',
    code: `// store UTC, always
const nowIso = new Date().toISOString();          // 2026-09-07T09:20:00.000Z

// display in the user's zone with Intl, not manual offsets
const fmt = new Intl.DateTimeFormat('en-GB', {
  dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Ho_Chi_Minh',
});
fmt.format(new Date(nowIso));

// relative time, localised
const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
const minutes = Math.round((Date.parse(nowIso) - Date.now()) / 60000);
rtf.format(minutes, 'minute');                    // "3 minutes ago"

// day arithmetic that survives DST
const addDays = (date, n) => {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
};

// difference in whole days, ignoring clock time
const dayDiff = (a, b) =>
  Math.round((Date.UTC(b.getFullYear(), b.getMonth(), b.getDate())
            - Date.UTC(a.getFullYear(), a.getMonth(), a.getDate())) / 86400000);`,
    explain: 'Persist ISO-8601 UTC, format at the edge with `Intl`. `setDate` handles month and year rollover and DST correctly; adding 86,400,000 ms does not.',
    pitfalls: '`new Date("2026-09-07")` is parsed as UTC midnight while `new Date("2026/09/07")` is local — a one-day-off bug generator.',
  },
  {
    id: 'js-bigdata', lang: 'javascript', title: 'Reservoir sampling and streaming statistics',
    tags: ['sampling', 'stream', 'statistics', 'welford', 'online', 'memory'],
    task: 'compute over data too large to keep',
    code: `// Welford: mean and variance in one pass, numerically stable
function onlineStats() {
  let n = 0, mean = 0, m2 = 0;
  return {
    push(x) {
      n += 1;
      const delta = x - mean;
      mean += delta / n;
      m2 += delta * (x - mean);
      return this;
    },
    get value() {
      return { n, mean, variance: n > 1 ? m2 / (n - 1) : 0, sd: Math.sqrt(n > 1 ? m2 / (n - 1) : 0) };
    },
  };
}

// Reservoir sampling: uniform sample of k items from an unbounded stream
function reservoir(k, rng = Math.random) {
  const sample = [];
  let seen = 0;
  return {
    push(x) {
      seen += 1;
      if (sample.length < k) sample.push(x);
      else {
        const j = Math.floor(rng() * seen);
        if (j < k) sample[j] = x;
      }
      return this;
    },
    get value() { return sample; },
  };
}`,
    explain: 'Welford avoids the catastrophic cancellation of the naive `E[x²] − E[x]²` formula. Reservoir sampling gives every item an equal k/n probability without knowing n in advance.',
    pitfalls: 'Summing floats in arbitrary order loses precision; for extreme ranges use Kahan summation or sort by magnitude.',
  },
  {
    id: 'js-cli', lang: 'javascript', title: 'A Node CLI with argument parsing',
    tags: ['cli', 'node', 'command line', 'argv', 'script', 'tool'],
    task: 'a script other people can run',
    code: `#!/usr/bin/env node
import { parseArgs } from 'node:util';

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    input:   { type: 'string',  short: 'i' },
    output:  { type: 'string',  short: 'o', default: '-' },
    verbose: { type: 'boolean', short: 'v', default: false },
    limit:   { type: 'string',  default: '100' },
    help:    { type: 'boolean', short: 'h', default: false },
  },
});

if (values.help || (!values.input && !positionals.length)) {
  console.log(\`usage: tool [-i input] [-o output] [--limit N] [-v]\`);
  process.exit(values.help ? 0 : 1);
}

const limit = Number.parseInt(values.limit, 10);
if (!Number.isInteger(limit) || limit < 1) {
  console.error('--limit must be a positive integer');
  process.exit(2);
}

if (values.verbose) console.error('[debug] options', values);`,
    explain: '`node:util.parseArgs` is built in — no yargs needed. Diagnostics go to stderr so stdout stays pipeable; exit codes let shells and CI react.',
    pitfalls: 'Validate and coerce every string argument. Writing logs to stdout breaks `tool | jq`.',
  },
  {
    id: 'js-typescript', lang: 'typescript', title: 'TypeScript types that catch real bugs',
    tags: ['typescript', 'types', 'generic', 'narrowing', 'union'],
    task: 'make illegal states unrepresentable',
    code: `// discriminated union: the compiler forces you to handle every state
type Result<T, E = Error> =
  | { ok: true; value: T }
  | { ok: false; error: E };

function unwrap<T>(r: Result<T>): T {
  if (r.ok) return r.value;      // narrowed to the success branch
  throw r.error;
}

// exhaustiveness: adding a variant becomes a compile error
type Shape =
  | { kind: 'circle'; r: number }
  | { kind: 'rect'; w: number; h: number };

const area = (s: Shape): number => {
  switch (s.kind) {
    case 'circle': return Math.PI * s.r ** 2;
    case 'rect':   return s.w * s.h;
    default: {
      const _exhaustive: never = s;
      return _exhaustive;
    }
  }
};

// generics with constraints beat \`any\`
const pluck = <T, K extends keyof T>(rows: T[], key: K): T[K][] => rows.map((r) => r[key]);`,
    explain: 'Discriminated unions plus a `never` default turn "I forgot a case" into a build failure. Constrained generics keep inference while banning nonsense keys.',
    pitfalls: '`as` is an assertion, not a check — it silences the compiler without making the value true. Prefer type guards.',
  },
  {
    id: 'js-git', lang: 'bash', title: 'Git commands that undo things safely',
    tags: ['git', 'version control', 'undo', 'rebase', 'reset', 'commit'],
    task: 'fix mistakes without losing work',
    code: `# amend the last commit message (before pushing)
git commit --amend -m "clearer message"

# unstage a file, keep the edit
git restore --staged path/to/file

# throw away local edits to one file (destructive)
git restore path/to/file

# undo the last commit but keep the changes staged
git reset --soft HEAD~1

# move committed work onto the right branch
git branch feature-x && git reset --hard origin/main && git switch feature-x

# find the commit that introduced a bug
git bisect start && git bisect bad && git bisect good v1.2.0

# recover a "lost" commit after a bad reset
git reflog                      # find the sha
git switch -c rescue <sha>

# clean history before a PR, interactively
git rebase -i origin/main`,
    explain: '`reflog` records every position HEAD has held for ~90 days, so almost nothing committed is ever truly lost.',
    pitfalls: '`reset --hard` and `clean -fd` delete uncommitted work permanently. Never rebase a branch other people have pulled.',
  },
  {
    id: 'js-a11y', lang: 'javascript', title: 'Accessible interactive components',
    tags: ['accessibility', 'a11y', 'aria', 'keyboard', 'frontend', 'html'],
    task: 'build UI that works without a mouse',
    code: `// A modal that traps focus and restores it on close
function openModal(dialog, trigger) {
  const focusable = dialog.querySelectorAll(
    'a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])',
  );
  const first = focusable[0];
  const last = focusable[focusable.length - 1];

  dialog.hidden = false;
  dialog.setAttribute('role', 'dialog');
  dialog.setAttribute('aria-modal', 'true');
  first?.focus();

  const onKey = (e) => {
    if (e.key === 'Escape') close();
    if (e.key !== 'Tab') return;
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  };

  function close() {
    dialog.hidden = true;
    dialog.removeEventListener('keydown', onKey);
    trigger.focus();                     // return focus where it came from
  }

  dialog.addEventListener('keydown', onKey);
  return close;
}`,
    explain: 'Keyboard users need a focus trap, an Escape route and focus restoration. Use the native `<dialog>` element when you can — it gives all three for free.',
    pitfalls: '`div` with an onClick is invisible to screen readers and keyboards. Use a `button`, or add role, tabindex and key handlers — the button is easier.',
  },
];

export const RECIPE_INDEX = new Map(RECIPES.map((r) => [r.id, r]));

export const LANGS = [...new Set(RECIPES.map((r) => r.lang))];

/** Score recipes against a free-text query. */
export function findRecipes(query, limit = 3) {
  const q = String(query).toLowerCase();
  const terms = q.split(/[^a-z0-9+#.]+/).filter((t) => t.length > 1);
  return RECIPES
    .map((r) => {
      const hay = `${r.id} ${r.title} ${r.task} ${r.tags.join(' ')} ${r.lang}`.toLowerCase();
      let score = 0;
      for (const t of terms) {
        if (r.tags.some((tag) => tag === t)) score += 3;
        else if (r.tags.some((tag) => tag.includes(t))) score += 2;
        if (r.title.toLowerCase().includes(t)) score += 2;
        if (hay.includes(t)) score += 1;
      }
      if (r.lang === 'python' && /\bpython\b|pandas|numpy|asyncio/.test(q)) score += 2;
      if (r.lang === 'sql' && /\bsql\b|query|database|join/.test(q)) score += 2;
      if (r.lang === 'typescript' && /\btype(script)?\b|generic/.test(q)) score += 2;
      return { recipe: r, score };
    })
    .filter((x) => x.score > 1)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((x) => x.recipe);
}
