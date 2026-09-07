/**
 * providers.js — live web sources.
 *
 * Every provider declares how to probe itself, so the console adapts to the
 * network it is running on: in a locked-down sandbox only the reachable
 * providers activate, on a normal machine the open-web ones light up too.
 * Nothing here is mocked — each search is a real HTTP request.
 */

import fs from 'node:fs';
import tls from 'node:tls';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

const UA = 'ATLAS-Research-Console/2.0 (+local research agent)';
const TIMEOUT = 12_000;

/**
 * Trust the machine's CA store in addition to Node's bundled list.
 * Corporate networks and sandboxes terminate TLS with a private CA that curl
 * trusts (system store) but Node does not — without this every request fails
 * with UNABLE_TO_VERIFY_LEAF_SIGNATURE.
 */
export const tlsBootstrap = (() => {
  const candidates = [
    process.env.NODE_EXTRA_CA_CERTS,
    '/etc/ssl/certs/ca-certificates.crt',
    '/etc/pki/tls/certs/ca-bundle.crt',
    '/etc/ssl/cert.pem',
  ].filter(Boolean);
  const extra = [];
  for (const file of candidates) {
    try {
      if (fs.existsSync(file)) { extra.push(fs.readFileSync(file, 'utf8')); break; }
    } catch { /* keep going */ }
  }
  if (!extra.length) return { applied: false, reason: 'no system CA bundle found' };
  try {
    // eslint-disable-next-line import/no-extraneous-dependencies
    const { Agent, setGlobalDispatcher } = require('undici');
    setGlobalDispatcher(new Agent({
      connect: { ca: [...tls.rootCertificates, ...extra] },
      keepAliveTimeout: 10_000,
      connections: 24,
    }));
    return { applied: true, source: 'system CA store' };
  } catch (e) {
    return { applied: false, reason: e.message.slice(0, 120) };
  }
})();

async function http(url, { headers = {}, timeout = TIMEOUT, json = true, method = 'GET' } = {}) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeout);
  try {
    const res = await fetch(url, {
      method,
      headers: { 'user-agent': UA, accept: json ? 'application/json' : 'text/html,*/*', ...headers },
      signal: ctl.signal,
    });
    if (!res.ok) throw Object.assign(new Error(`HTTP ${res.status} for ${url}`), { status: res.status });
    return json ? await res.json() : await res.text();
  } finally {
    clearTimeout(timer);
  }
}

const ghHeaders = () => {
  const token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
  return {
    accept: 'application/vnd.github+json',
    'x-github-api-version': '2022-11-28',
    ...(token ? { authorization: `Bearer ${token}` } : {}),
  };
};

const clip = (s, n = 420) => {
  const t = String(s || '').replace(/\s+/g, ' ').trim();
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
};

const stripHtml = (html) => String(html)
  .replace(/<script[\s\S]*?<\/script>/gi, ' ')
  .replace(/<style[\s\S]*?<\/style>/gi, ' ')
  .replace(/<[^>]+>/g, ' ')
  .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"').replace(/&#39;/g, "'")
  .replace(/\s+/g, ' ')
  .trim();

/** Strip markdown to readable prose for snippet extraction. */
const stripMarkdown = (md) => String(md)
  .replace(/```[\s\S]*?```/g, ' [code block] ')
  .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
  .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
  .replace(/^[#>*\-\s]+/gm, ' ')
  .replace(/[*_`|]/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

/* ------------------------------- providers -------------------------------- */

export const PROVIDERS = [
  {
    id: 'github-repos',
    label: 'GitHub repositories',
    kind: 'code',
    weight: 1.0,
    probe: () => http('https://api.github.com/rate_limit', { headers: ghHeaders(), timeout: 6000 }),
    async search(query, { limit = 5, language } = {}) {
      const q = language ? `${query} language:${language}` : query;
      const url = `https://api.github.com/search/repositories?q=${encodeURIComponent(q)}&sort=stars&order=desc&per_page=${limit}`;
      const data = await http(url, { headers: ghHeaders() });
      return (data.items || []).map((r) => ({
        title: r.full_name,
        url: r.html_url,
        snippet: clip(r.description || 'No description.'),
        source: 'github-repos',
        published: r.pushed_at,
        meta: {
          stars: r.stargazers_count, forks: r.forks_count, language: r.language,
          license: r.license?.spdx_id, topics: (r.topics || []).slice(0, 6),
          doc: { kind: 'readme', repo: r.full_name },
        },
      }));
    },
  },

  {
    id: 'github-code',
    label: 'GitHub code search',
    kind: 'code',
    weight: 1.15,
    probe: () => http('https://api.github.com/search/code?q=debounce+language:js&per_page=1', { headers: ghHeaders(), timeout: 8000 }),
    async search(query, { limit = 4, language } = {}) {
      const q = `${query} in:file${language ? ` language:${language}` : ''}`;
      const url = `https://api.github.com/search/code?q=${encodeURIComponent(q)}&per_page=${limit}`;
      const data = await http(url, { headers: ghHeaders() });
      return (data.items || []).map((i) => ({
        title: `${i.repository.full_name} › ${i.path}`,
        url: i.html_url,
        snippet: clip(`Source file ${i.name} in ${i.repository.full_name}. ${i.repository.description || ''}`),
        source: 'github-code',
        meta: {
          repo: i.repository.full_name, path: i.path,
          doc: { kind: 'file', repo: i.repository.full_name, path: i.path },
        },
      }));
    },
  },

  {
    id: 'github-issues',
    label: 'GitHub issues & discussions',
    kind: 'community',
    weight: 0.85,
    probe: () => http('https://api.github.com/search/issues?q=test&per_page=1', { headers: ghHeaders(), timeout: 8000 }),
    async search(query, { limit = 4 } = {}) {
      const url = `https://api.github.com/search/issues?q=${encodeURIComponent(query)}&sort=reactions&order=desc&per_page=${limit}`;
      const data = await http(url, { headers: ghHeaders() });
      return (data.items || []).map((i) => ({
        title: i.title,
        url: i.html_url,
        snippet: clip(i.body || 'No body.'),
        source: 'github-issues',
        published: i.created_at,
        meta: {
          state: i.state, comments: i.comments,
          reactions: i.reactions?.total_count ?? 0,
          repo: (i.repository_url || '').split('/repos/')[1],
        },
      }));
    },
  },

  {
    id: 'npm',
    label: 'npm registry',
    kind: 'package',
    weight: 0.95,
    probe: () => http('https://registry.npmjs.org/-/v1/search?text=react&size=1', { timeout: 6000 }),
    async search(query, { limit = 5 } = {}) {
      const url = `https://registry.npmjs.org/-/v1/search?text=${encodeURIComponent(query)}&size=${limit}`;
      const data = await http(url);
      return (data.objects || []).map((o) => ({
        title: `${o.package.name}@${o.package.version}`,
        url: o.package.links?.npm || `https://www.npmjs.com/package/${o.package.name}`,
        snippet: clip(o.package.description || 'No description.'),
        source: 'npm',
        published: o.package.date,
        meta: {
          quality: o.score?.detail?.quality, popularity: o.score?.detail?.popularity,
          maintenance: o.score?.detail?.maintenance, keywords: (o.package.keywords || []).slice(0, 6),
          doc: { kind: 'npm', name: o.package.name },
        },
      }));
    },
  },

  {
    id: 'pypi',
    label: 'PyPI',
    kind: 'package',
    weight: 0.8,
    probe: () => http('https://pypi.org/pypi/requests/json', { timeout: 6000 }),
    async search(query, { limit = 3 } = {}) {
      // PyPI has no JSON search endpoint; resolve plausible package names directly.
      const candidates = [...new Set(
        String(query).toLowerCase().match(/[a-z][a-z0-9_-]{2,}/g) || [],
      )].slice(0, 8);
      const out = [];
      for (const name of candidates) {
        if (out.length >= limit) break;
        try {
          const data = await http(`https://pypi.org/pypi/${encodeURIComponent(name)}/json`, { timeout: 6000 });
          out.push({
            title: `${data.info.name} ${data.info.version}`,
            url: data.info.project_urls?.Homepage || `https://pypi.org/project/${data.info.name}/`,
            snippet: clip(data.info.summary || data.info.description || ''),
            source: 'pypi',
            meta: { license: data.info.license, requires: data.info.requires_python },
          });
        } catch { /* not a package name */ }
      }
      return out;
    },
  },

  {
    id: 'wikipedia',
    label: 'Wikipedia',
    kind: 'reference',
    weight: 1.05,
    probe: () => http('https://en.wikipedia.org/w/api.php?action=query&format=json&list=search&srsearch=test&srlimit=1', { timeout: 6000 }),
    async search(query, { limit = 4 } = {}) {
      const url = `https://en.wikipedia.org/w/api.php?action=query&format=json&list=search&srsearch=${encodeURIComponent(query)}&srlimit=${limit}&origin=*`;
      const data = await http(url);
      return (data.query?.search || []).map((r) => ({
        title: r.title,
        url: `https://en.wikipedia.org/wiki/${encodeURIComponent(r.title.replace(/ /g, '_'))}`,
        snippet: clip(stripHtml(r.snippet)),
        source: 'wikipedia',
        published: r.timestamp,
        meta: { words: r.wordcount, doc: { kind: 'wikipedia', title: r.title } },
      }));
    },
  },

  {
    id: 'duckduckgo',
    label: 'DuckDuckGo (open web)',
    kind: 'web',
    weight: 1.2,
    probe: () => http('https://html.duckduckgo.com/html/?q=test', { json: false, timeout: 8000 }),
    async search(query, { limit = 6 } = {}) {
      const html = await http(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`, { json: false });
      const out = [];
      const re = /<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g;
      let m;
      while ((m = re.exec(html)) && out.length < limit) {
        let href = m[1];
        const dd = href.match(/uddg=([^&]+)/);
        if (dd) href = decodeURIComponent(dd[1]);
        out.push({ title: stripHtml(m[2]), url: href, snippet: clip(stripHtml(m[3])), source: 'duckduckgo', meta: { doc: { kind: 'page', url: href } } });
      }
      return out;
    },
  },

  {
    id: 'stackexchange',
    label: 'Stack Overflow',
    kind: 'community',
    weight: 1.1,
    probe: () => http('https://api.stackexchange.com/2.3/info?site=stackoverflow', { timeout: 8000 }),
    async search(query, { limit = 5 } = {}) {
      const url = `https://api.stackexchange.com/2.3/search/advanced?order=desc&sort=relevance&q=${encodeURIComponent(query)}&site=stackoverflow&pagesize=${limit}&filter=withbody`;
      const data = await http(url);
      return (data.items || []).map((i) => ({
        title: i.title,
        url: i.link,
        snippet: clip(stripHtml(i.body)),
        source: 'stackexchange',
        published: new Date(i.creation_date * 1000).toISOString(),
        meta: { score: i.score, answered: i.is_answered, tags: (i.tags || []).slice(0, 6) },
      }));
    },
  },
];

export const PROVIDER_INDEX = new Map(PROVIDERS.map((p) => [p.id, p]));

/* --------------------------- capability probing --------------------------- */

const status = new Map();
let lastProbe = 0;

export async function probeProviders({ force = false } = {}) {
  if (!force && Date.now() - lastProbe < 600_000 && status.size) return snapshot();
  lastProbe = Date.now();
  await Promise.all(PROVIDERS.map(async (p) => {
    const t0 = Date.now();
    try {
      await p.probe();
      status.set(p.id, { online: true, ms: Date.now() - t0, error: null, at: new Date().toISOString() });
    } catch (e) {
      status.set(p.id, { online: false, ms: Date.now() - t0, error: e.message.slice(0, 120), at: new Date().toISOString() });
    }
  }));
  return snapshot();
}

export function snapshot() {
  return PROVIDERS.map((p) => ({
    id: p.id, label: p.label, kind: p.kind,
    ...(status.get(p.id) || { online: null, ms: null, error: 'not probed yet' }),
  }));
}

export const isOnline = (id) => status.get(id)?.online === true;
export const onlineProviders = () => PROVIDERS.filter((p) => isOnline(p.id));

/* ------------------------------ document read ----------------------------- */

/** Fetch the full text behind a result so answers quote sources, not titles. */
export async function readDocument(doc) {
  if (!doc) return null;
  try {
    if (doc.kind === 'readme') {
      const data = await http(`https://api.github.com/repos/${doc.repo}/readme`, { headers: ghHeaders() });
      const raw = Buffer.from(data.content || '', 'base64').toString('utf8');
      return { text: stripMarkdown(raw).slice(0, 20000), raw: raw.slice(0, 20000), kind: 'readme' };
    }
    if (doc.kind === 'file') {
      const data = await http(`https://api.github.com/repos/${doc.repo}/contents/${encodeURI(doc.path)}`, { headers: ghHeaders() });
      const raw = Buffer.from(data.content || '', 'base64').toString('utf8');
      return { text: raw.slice(0, 20000), raw: raw.slice(0, 20000), kind: 'file', size: data.size };
    }
    if (doc.kind === 'npm') {
      const data = await http(`https://registry.npmjs.org/${encodeURIComponent(doc.name)}`);
      const latest = data['dist-tags']?.latest;
      const v = data.versions?.[latest] || {};
      const text = `${data.description || ''}\n\n${stripMarkdown(data.readme || '')}`;
      return {
        text: text.slice(0, 20000), kind: 'npm',
        meta: { latest, license: v.license, deps: Object.keys(v.dependencies || {}).slice(0, 20), homepage: v.homepage },
      };
    }
    if (doc.kind === 'wikipedia') {
      const data = await http(`https://en.wikipedia.org/w/api.php?action=query&format=json&prop=extracts&explaintext=1&titles=${encodeURIComponent(doc.title)}&origin=*`);
      const pages = data.query?.pages || {};
      const first = Object.values(pages)[0] || {};
      return { text: String(first.extract || '').slice(0, 20000), kind: 'wikipedia' };
    }
    if (doc.kind === 'page') {
      const html = await http(doc.url, { json: false, timeout: 15000 });
      return { text: stripHtml(html).slice(0, 20000), kind: 'page' };
    }
  } catch (e) {
    return { text: '', error: e.message.slice(0, 160), kind: doc.kind };
  }
  return null;
}

export { stripHtml, stripMarkdown, clip };
