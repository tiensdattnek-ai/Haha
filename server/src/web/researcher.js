/**
 * researcher.js — the live-research pipeline.
 *
 *   plan → search N providers in parallel → dedupe → rank (neural + lexical)
 *        → read the best documents → extract quoting passages → synthesise
 *
 * Every stage is an async generator step so the console can render the search
 * as it happens instead of showing a spinner.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PROVIDERS, PROVIDER_INDEX, probeProviders, snapshot, isOnline, onlineProviders, readDocument, clip } from './providers.js';
import { words, STOPWORDS, sentences } from '../../../packages/skills/src/textcore.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const CACHE_FILE = path.join(ROOT, 'data/runtime/web-cache.json');
const CACHE_TTL = 1000 * 60 * 60 * 6;

/* ---------------------------------- cache --------------------------------- */

let cache = new Map();
try {
  if (fs.existsSync(CACHE_FILE)) {
    cache = new Map(Object.entries(JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'))));
  }
} catch { cache = new Map(); }

let saveTimer = null;
function persistCache() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      fs.mkdirSync(path.dirname(CACHE_FILE), { recursive: true });
      const trimmed = [...cache.entries()].slice(-400);
      fs.writeFileSync(CACHE_FILE, JSON.stringify(Object.fromEntries(trimmed)));
    } catch { /* cache is best effort */ }
  }, 800);
}

const cacheGet = (key) => {
  const hit = cache.get(key);
  if (!hit) return null;
  if (Date.now() - hit.at > CACHE_TTL) { cache.delete(key); return null; }
  return hit.value;
};
const cacheSet = (key, value) => { cache.set(key, { at: Date.now(), value }); persistCache(); };

/* --------------------------------- planning -------------------------------- */

const LANG_HINTS = [
  [/\b(javascript|js|node|npm|react|vue|express|typescript|ts)\b/i, 'javascript'],
  [/\b(python|pandas|numpy|django|flask|pytorch|asyncio|pip)\b/i, 'python'],
  [/\b(rust|cargo|tokio)\b/i, 'rust'],
  [/\b(go|golang)\b/i, 'go'],
  [/\b(java|spring|maven)\b/i, 'java'],
  [/\b(c\+\+|cpp)\b/i, 'cpp'],
  [/\b(sql|postgres|mysql|sqlite)\b/i, 'sql'],
];

const CODE_SIGNAL = /\b(code|function|library|package|api|implement|bug|error|npm|pip|install|framework|sdk|compile|typescript|javascript|python|react|node|regex|algorithm|snippet|example)\b/i;
const NEWS_SIGNAL = /\b(latest|recent|2025|2026|news|release|changelog|version|deprecat)\b/i;

/** Turn one message into a small set of targeted queries. */
export function planQueries(message, { maxQueries = 3 } = {}) {
  const clean = String(message).replace(/\s+/g, ' ').trim();
  const terms = words(clean).filter((w) => !STOPWORDS.has(w) && w.length > 2);
  const head = terms.slice(0, 8).join(' ');
  const lang = (LANG_HINTS.find(([re]) => re.test(clean)) || [])[1] || null;
  const isCode = CODE_SIGNAL.test(clean);

  const queries = [];
  queries.push({ q: clean.length > 90 ? head : clean, intent: 'primary', language: lang });
  if (head && head !== clean) queries.push({ q: head, intent: 'keywords', language: lang });
  if (isCode) {
    queries.push({ q: `${terms.slice(0, 4).join(' ')} implementation example`, intent: 'code', language: lang });
  } else {
    queries.push({ q: `${terms.slice(0, 5).join(' ')} evidence review`, intent: 'evidence', language: null });
  }
  return {
    queries: queries.slice(0, maxQueries),
    language: lang,
    isCode,
    fresh: NEWS_SIGNAL.test(clean),
    terms,
  };
}

/** Which providers make sense for this question. */
export function selectProviders(plan, { max = 4 } = {}) {
  const online = onlineProviders();
  const scored = online.map((p) => {
    let s = p.weight;
    if (plan.isCode && p.kind === 'code') s += 1.2;
    if (plan.isCode && p.kind === 'community') s += 0.6;
    if (plan.isCode && p.kind === 'package') s += 0.5;
    if (!plan.isCode && p.kind === 'reference') s += 1.1;
    if (!plan.isCode && p.kind === 'web') s += 1.0;
    if (!plan.isCode && p.kind === 'code') s -= 0.5;
    if (p.id === 'pypi' && plan.language !== 'python') s -= 0.8;
    return { p, s };
  });
  return scored.sort((a, b) => b.s - a.s).slice(0, max).map((x) => x.p);
}

/* --------------------------------- ranking --------------------------------- */

function lexicalScore(text, terms) {
  const hay = String(text).toLowerCase();
  let hits = 0;
  for (const t of terms) if (hay.includes(t)) hits += 1;
  return terms.length ? hits / terms.length : 0;
}

/** Pick the passages of a document that actually answer the question. */
export function extractPassages(text, terms, { max = 3, window = 3 } = {}) {
  const sents = sentences(String(text).slice(0, 12000));
  if (!sents.length) return [];
  const scored = sents.map((s, i) => ({ i, s, score: lexicalScore(s, terms) * (1 + Math.min(s.length, 240) / 480) }));
  const best = scored.filter((x) => x.score > 0).sort((a, b) => b.score - a.score).slice(0, max);
  return best
    .sort((a, b) => a.i - b.i)
    .map((x) => ({
      text: sents.slice(Math.max(0, x.i - Math.floor(window / 2)), x.i + Math.ceil(window / 2)).join(' ').slice(0, 700),
      score: Number(x.score.toFixed(3)),
    }));
}

/** Extract the most relevant code block from a fetched file/readme. */
export function extractCode(raw, terms, { maxLines = 40 } = {}) {
  const text = String(raw || '');
  const fenced = [...text.matchAll(/```[a-z]*\n([\s\S]*?)```/g)].map((m) => m[1]);
  const candidates = fenced.length ? fenced : [text];
  let best = null;
  for (const c of candidates) {
    const score = lexicalScore(c, terms) + Math.min(c.split('\n').length, 60) / 300;
    if (!best || score > best.score) best = { code: c, score };
  }
  if (!best) return null;
  const lines = best.code.split('\n');
  const hit = lines.findIndex((l) => terms.some((t) => l.toLowerCase().includes(t)));
  const start = Math.max(0, (hit === -1 ? 0 : hit) - 6);
  return lines.slice(start, start + maxLines).join('\n').trim();
}

/* ------------------------------- the pipeline ------------------------------ */

export class WebResearcher {
  constructor(runtime) {
    this.runtime = runtime;
    this.stats = { searches: 0, providerCalls: 0, documents: 0, cacheHits: 0, errors: 0 };
  }

  async ready() {
    return probeProviders();
  }

  status() {
    return snapshot();
  }

  /**
   * Async generator: yields progress events, returns the final dossier.
   * @param {string} message
   */
  async *research(message, { maxResults = 8, readDocs = 3, providers: only = null } = {}) {
    const t0 = Date.now();
    const plan = planQueries(message);
    this.stats.searches++;
    yield { type: 'web_plan', queries: plan.queries, language: plan.language, isCode: plan.isCode };

    await probeProviders();
    let chosen = selectProviders(plan);
    if (only?.length) chosen = chosen.filter((p) => only.includes(p.id));
    if (!chosen.length) {
      yield { type: 'web_unavailable', status: snapshot() };
      return { results: [], docs: [], plan, ms: Date.now() - t0, offline: true };
    }
    yield { type: 'web_providers', providers: chosen.map((p) => ({ id: p.id, label: p.label, kind: p.kind })) };

    // ---- parallel search -----------------------------------------------------
    const jobs = [];
    for (const provider of chosen) {
      // GitHub code search is the slowest endpoint — give it one focused query
      const budget = provider.id === 'github-code' ? 1 : 2;
      for (const q of plan.queries.slice(0, budget)) jobs.push({ provider, query: q });
    }
    const settled = await Promise.all(jobs.map(async ({ provider, query }) => {
      const key = `${provider.id}::${query.q}::${query.language || ''}`;
      const cached = cacheGet(key);
      if (cached) {
        this.stats.cacheHits++;
        return { provider, query, results: cached, cached: true };
      }
      try {
        this.stats.providerCalls++;
        const results = await provider.search(query.q, { language: query.language, limit: 5 });
        cacheSet(key, results);
        return { provider, query, results, cached: false };
      } catch (e) {
        this.stats.errors++;
        return { provider, query, results: [], error: e.message.slice(0, 140) };
      }
    }));

    for (const s of settled) {
      yield {
        type: 'web_search',
        provider: s.provider.id,
        query: s.query.q,
        hits: s.results.length,
        cached: !!s.cached,
        error: s.error || null,
      };
    }

    // ---- merge + dedupe ------------------------------------------------------
    const seen = new Map();
    for (const s of settled) {
      for (const r of s.results) {
        const key = (r.url || r.title).replace(/[#?].*$/, '');
        if (!seen.has(key)) seen.set(key, { ...r, providers: [s.provider.id], queries: [s.query.q] });
        else {
          const prev = seen.get(key);
          if (!prev.providers.includes(s.provider.id)) prev.providers.push(s.provider.id);
          prev.queries.push(s.query.q);
        }
      }
    }
    let merged = [...seen.values()];

    // ---- rank: neural embedding + lexical + provider weight + agreement ------
    let qvec = null;
    if (this.runtime?.ready) {
      try { qvec = this.runtime.embed(message); } catch { qvec = null; }
    }
    merged = merged.map((r) => {
      const blob = `${r.title}. ${r.snippet}`;
      let dense = 0;
      if (qvec && blob.length > 12) {
        try {
          const v = this.runtime.embed(blob.slice(0, 400));
          for (let i = 0; i < v.length; i++) dense += v[i] * qvec[i];
        } catch { dense = 0; }
      }
      const lex = lexicalScore(blob, plan.terms);
      const weight = PROVIDER_INDEX.get(r.source)?.weight ?? 1;
      const agreement = Math.min(0.15, (r.providers.length - 1) * 0.08);
      const popularity = Math.min(0.12, Math.log10(1 + (r.meta?.stars || r.meta?.score || 0)) / 30);
      const score = 0.42 * dense + 0.36 * lex + 0.12 * (weight - 0.8) + agreement + popularity;
      return { ...r, dense: Number(dense.toFixed(4)), lexical: Number(lex.toFixed(4)), score: Number(score.toFixed(4)) };
    }).sort((a, b) => b.score - a.score).slice(0, maxResults);

    yield { type: 'web_results', results: merged.map(({ providers, queries, ...r }) => ({ ...r, providers })) };

    // ---- read the best documents (in parallel) --------------------------------
    const docs = [];
    const readable = merged.slice(0, readDocs).filter((r) => r.meta?.doc);
    for (const r of readable) yield { type: 'web_read', url: r.url, title: r.title };
    const fetched = await Promise.all(readable.map(async (r) => {
      const key = `doc::${JSON.stringify(r.meta.doc)}`;
      const cached = cacheGet(key);
      if (cached) { this.stats.cacheHits++; return { r, doc: cached }; }
      const doc = await readDocument(r.meta.doc);
      if (doc && !doc.error) cacheSet(key, doc);
      return { r, doc };
    }));
    for (const { r, doc } of fetched) {
      if (!doc || doc.error || !doc.text) continue;
      this.stats.documents++;
      const passages = extractPassages(doc.text, plan.terms, { max: 3 });
      const code = plan.isCode ? extractCode(doc.raw || doc.text, plan.terms) : null;
      docs.push({
        url: r.url, title: r.title, source: r.source, kind: doc.kind,
        chars: doc.text.length, passages, code, meta: doc.meta || null,
      });
      yield { type: 'web_document', url: r.url, title: r.title, passages: passages.length, chars: doc.text.length, hasCode: !!code };
    }

    const dossier = { results: merged, docs, plan, ms: Date.now() - t0, stats: { ...this.stats } };
    yield { type: 'web_done', ms: dossier.ms, results: merged.length, documents: docs.length };
    return dossier;
  }

  /** Non-streaming convenience wrapper. */
  async searchOnce(message, opts) {
    const it = this.research(message, opts);
    let step = await it.next();
    while (!step.done) step = await it.next();
    return step.value;
  }
}

/** Render a dossier as the markdown block the console shows. */
export function renderDossier(dossier, { title = 'Live sources' } = {}) {
  if (!dossier || !dossier.results?.length) return '';
  const lines = [`\n\n---\n\n### 🌐 ${title}\n`];
  lines.push(`Searched ${[...new Set(dossier.results.map((r) => r.source))].join(', ')} · ${dossier.results.length} results · ${dossier.docs.length} documents read · ${dossier.ms} ms\n`);
  dossier.results.slice(0, 6).forEach((r, i) => {
    const bits = [];
    if (r.meta?.stars) bits.push(`★ ${r.meta.stars.toLocaleString()}`);
    if (r.meta?.language) bits.push(r.meta.language);
    if (r.meta?.score) bits.push(`score ${r.meta.score}`);
    if (r.published) bits.push(new Date(r.published).toISOString().slice(0, 10));
    lines.push(`**[${i + 1}] [${r.title}](${r.url})** — \`${r.source}\`${bits.length ? ` · ${bits.join(' · ')}` : ''} · relevance ${r.score.toFixed(3)}`);
    lines.push(`> ${clip(r.snippet, 320)}\n`);
  });
  for (const d of dossier.docs) {
    if (!d.passages.length && !d.code) continue;
    lines.push(`\n**Read: [${d.title}](${d.url})**`);
    for (const p of d.passages.slice(0, 2)) lines.push(`> ${clip(p.text, 420)}`);
    if (d.code) lines.push(`\n\`\`\`\n${d.code.slice(0, 1200)}\n\`\`\``);
  }
  return lines.join('\n');
}
