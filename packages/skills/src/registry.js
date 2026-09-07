/**
 * registry.js — the skill contract + registry used by the agent runtime.
 */

export const CATEGORIES = {
  reasoning: { label: 'Reasoning & Planning', color: '#7c9cff', icon: 'brain' },
  design: { label: 'Study Design', color: '#57d6a8', icon: 'flask' },
  statistics: { label: 'Statistics & Inference', color: '#ffb86b', icon: 'sigma' },
  mathematics: { label: 'Mathematics', color: '#f38ba8', icon: 'function' },
  text: { label: 'Text Analytics', color: '#c39bff', icon: 'type' },
  literature: { label: 'Literature & Citation', color: '#6fd3ff', icon: 'library' },
  data: { label: 'Data & Code', color: '#9ee37d', icon: 'database' },
  code: { label: 'Software Engineering', color: '#8be9fd', icon: 'terminal' },
  neural: { label: 'Neural Introspection', color: '#ff9ecd', icon: 'network' },
  utility: { label: 'Utilities', color: '#a6adc8', icon: 'wrench' },
};

export class Skill {
  constructor(def) {
    Object.assign(this, {
      id: def.id,
      name: def.name,
      category: def.category,
      summary: def.summary,
      description: def.description || def.summary,
      tags: def.tags || [],
      params: def.params || [],
      examples: def.examples || [],
      cost: def.cost || 'instant',
      match: def.match || null,
      run: def.run,
    });
  }

  /** metadata only (safe to ship to the browser) */
  toJSON() {
    return {
      id: this.id, name: this.name, category: this.category, summary: this.summary,
      description: this.description, tags: this.tags, params: this.params,
      examples: this.examples, cost: this.cost,
    };
  }
}

export class SkillRegistry {
  constructor() {
    this.skills = new Map();
  }

  register(def) {
    const s = def instanceof Skill ? def : new Skill(def);
    if (this.skills.has(s.id)) throw new Error(`duplicate skill id: ${s.id}`);
    this.skills.set(s.id, s);
    return s;
  }

  registerAll(defs) {
    for (const d of defs) this.register(d);
    return this;
  }

  get(id) {
    return this.skills.get(id);
  }

  list() {
    return [...this.skills.values()];
  }

  categories() {
    const out = {};
    for (const s of this.skills.values()) {
      (out[s.category] ||= []).push(s.toJSON());
    }
    return Object.entries(CATEGORIES)
      .filter(([k]) => out[k])
      .map(([k, meta]) => ({ id: k, ...meta, skills: out[k] }));
  }

  search(q) {
    const query = String(q || '').toLowerCase().trim();
    if (!query) return this.list().map((s) => s.toJSON());
    const terms = query.split(/\s+/);
    return this.list()
      .map((s) => {
        const hay = `${s.id} ${s.name} ${s.summary} ${s.tags.join(' ')}`.toLowerCase();
        let score = 0;
        for (const t of terms) {
          if (s.id.includes(t)) score += 3;
          if (s.name.toLowerCase().includes(t)) score += 2;
          if (hay.includes(t)) score += 1;
        }
        return { skill: s.toJSON(), score };
      })
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .map((x) => x.skill);
  }

  /** Rank skills against a free-text message using each skill's matcher. */
  route(message, limit = 4) {
    const scored = [];
    for (const s of this.skills.values()) {
      let score = 0;
      if (s.match) {
        try {
          score = s.match(message) || 0;
        } catch {
          score = 0;
        }
      }
      const lower = message.toLowerCase();
      for (const tag of s.tags) if (lower.includes(tag.toLowerCase())) score += 0.25;
      if (score > 0) scored.push({ id: s.id, name: s.name, score, category: s.category });
    }
    return scored.sort((a, b) => b.score - a.score).slice(0, limit);
  }

  async run(id, args = {}, ctx = {}) {
    const skill = this.get(id);
    if (!skill) throw new Error(`unknown skill: ${id}`);
    const started = Date.now();
    for (const p of skill.params) {
      if (p.required && (args[p.name] === undefined || args[p.name] === '')) {
        throw new Error(`skill "${id}" requires parameter "${p.name}" (${p.description || p.type})`);
      }
      if (args[p.name] === undefined && p.default !== undefined) args[p.name] = p.default;
    }
    const result = await skill.run(args, ctx);
    return {
      skill: skill.id,
      name: skill.name,
      category: skill.category,
      ms: Date.now() - started,
      ...result,
    };
  }
}

/* ------------------------------- helpers -------------------------------- */

export const fmt = (v, d = 4) => {
  if (v === null || v === undefined || Number.isNaN(v)) return '—';
  if (!Number.isFinite(v)) return v > 0 ? '∞' : '−∞';
  if (v !== 0 && (Math.abs(v) < 1e-4 || Math.abs(v) >= 1e7)) return v.toExponential(3);
  return String(Number(v.toFixed(d)));
};

export const pval = (p) => (p < 1e-4 ? '< 0.0001' : p.toFixed(4));

export function table(headers, rows) {
  const head = `| ${headers.join(' | ')} |`;
  const sep = `| ${headers.map(() => '---').join(' | ')} |`;
  const body = rows.map((r) => `| ${r.join(' | ')} |`).join('\n');
  return `${head}\n${sep}\n${body}`;
}

/** Parse "1, 2 3;4" or JSON arrays into numbers. */
export function numbers(input) {
  if (Array.isArray(input)) return input.map(Number).filter(Number.isFinite);
  const s = String(input).trim();
  if (s.startsWith('[')) {
    try {
      return JSON.parse(s).flat(Infinity).map(Number).filter(Number.isFinite);
    } catch { /* fall through */ }
  }
  return (s.match(/-?\d+(?:\.\d+)?(?:[eE][-+]?\d+)?/g) || []).map(Number);
}

/** Parse a matrix from "1 2; 3 4" or JSON. */
export function matrix(input) {
  if (Array.isArray(input)) return input;
  const s = String(input).trim();
  if (s.startsWith('[')) return JSON.parse(s);
  return s.split(/[;\n]/).map((r) => numbers(r)).filter((r) => r.length);
}

/** Minimal RFC4180-ish CSV/TSV parser with type inference. */
export function parseTable(text) {
  const raw = String(text).trim();
  const delim = raw.includes('\t') && !raw.includes(',') ? '\t' : raw.includes(';') && !raw.includes(',') ? ';' : ',';
  const rows = [];
  let field = '';
  let row = [];
  let inQuotes = false;
  for (let i = 0; i < raw.length; i++) {
    const c = raw[i];
    if (inQuotes) {
      if (c === '"' && raw[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') inQuotes = false;
      else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === delim) { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (c !== '\r') field += c;
  }
  row.push(field);
  rows.push(row);
  const header = rows[0].map((h) => h.trim());
  const body = rows.slice(1).filter((r) => r.some((c) => c.trim() !== ''));
  const records = body.map((r) => {
    const o = {};
    header.forEach((h, i) => {
      const v = (r[i] ?? '').trim();
      const n = Number(v);
      o[h] = v !== '' && Number.isFinite(n) ? n : v;
    });
    return o;
  });
  const columns = header.map((h) => {
    const values = records.map((r) => r[h]);
    const nums = values.filter((v) => typeof v === 'number');
    return { name: h, numeric: nums.length > values.length * 0.7, values, missing: values.filter((v) => v === '').length };
  });
  return { header, records, columns, delimiter: delim === '\t' ? 'TAB' : delim };
}

export function bar(value, max, width = 20, char = '█') {
  const n = Math.max(0, Math.min(width, Math.round((value / (max || 1)) * width)));
  return char.repeat(n) + '·'.repeat(width - n);
}
