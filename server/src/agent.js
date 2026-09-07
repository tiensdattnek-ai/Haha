/**
 * agent.js — the ATLAS deep-research orchestrator.
 *
 * A message flows through: understand → plan → retrieve → execute skills →
 * synthesise → self-critique. Every stage emits an event so the UI can render
 * the reasoning trace live instead of a spinner.
 */
import { numbers, matrix } from '../../packages/skills/src/registry.js';
import { entities, claims, rake, sentences } from '../../packages/skills/src/textcore.js';

const NUMERIC_PARAM = new Set(['number']);

/* ----------------------------- command parsing ---------------------------- */

export function parseCommand(message) {
  const m = String(message).trim();
  if (!m.startsWith('/')) return null;
  const [, cmd, rest = ''] = m.match(/^\/([\w.:-]+)\s*([\s\S]*)$/) || [];
  if (!cmd) return null;
  let args = null;
  const trimmed = rest.trim();
  if (trimmed.startsWith('{')) {
    try { args = JSON.parse(trimmed); } catch { args = null; }
  }
  return { cmd: cmd.replace(/^skill:/, ''), rest: trimmed, args };
}

/* ---------------------------- argument inference -------------------------- */

const TEXTY = ['text', 'topic', 'claim', 'concept', 'question', 'query', 'prompt', 'reference', 'code', 'csv', 'json', 'series', 'edges', 'equation', 'expression', 'f', 'design', 'sentence'];

function splitGroups(message) {
  const parts = String(message)
    .split(/\b(?:vs\.?|versus|against|compared to|and then)\b|;|\n/i)
    .map((p) => numbers(p))
    .filter((p) => p.length > 1);
  return parts;
}

const ALIASES = {
  power: ['power', 'statistical power'],
  alpha: ['alpha', 'α', 'significance level'],
  n: ['n', 'sample size', 'per group', 'participants'],
  d: ['d', "cohen's d", 'effect size'],
  trials: ['trials', 'attempts', 'out of'],
  successes: ['successes', 'hits', 'wins'],
  sentences: ['sentences', 'bullets', 'points'],
  weeks: ['weeks', 'week'],
  count: ['count', 'ideas', 'hypotheses'],
  k: ['k', 'top', 'passages'],
};

/** Finds "power = 0.9", "90% power", "at 90 percent power", "n of 50". */
function labelledNumber(message, name) {
  const src = String(message);
  const names = [name, ...(ALIASES[name] || [])];
  for (const n of names) {
    const esc = n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const after = src.match(new RegExp(`\\b${esc}\\s*(?:=|:|of|is)?\\s*(-?\\d+(?:\\.\\d+)?)\\s*(%?)`, 'i'));
    if (after) return after[2] === '%' ? Number(after[1]) / 100 : Number(after[1]);
    const before = src.match(new RegExp(`(-?\\d+(?:\\.\\d+)?)\\s*(%|percent)?\\s+${esc}\\b`, 'i'));
    if (before) return before[2] ? Number(before[1]) / 100 : Number(before[1]);
  }
  return undefined;
}

export function inferArgs(skill, message, extra = {}) {
  const args = { ...extra };
  const nums = numbers(message);
  const groups = splitGroups(message);
  let numCursor = 0;
  for (const p of skill.params) {
    if (args[p.name] !== undefined) continue;
    const labelled = labelledNumber(message, p.name);
    if (labelled !== undefined && (p.type === 'number' || p.type === 'numbers')) {
      args[p.name] = labelled;
      continue;
    }
    if (p.type === 'numbers') {
      if (groups.length >= 2) {
        const idx = skill.params.filter((q) => q.type === 'numbers').indexOf(p);
        if (groups[idx]) { args[p.name] = groups[idx]; continue; }
      }
      if (nums.length) { args[p.name] = nums; continue; }
    } else if (p.type === 'matrix') {
      const lines = String(message).split('\n').filter((l) => numbers(l).length > 1);
      if (lines.length) { args[p.name] = lines.map((l) => numbers(l)); continue; }
      if (nums.length > 1) { args[p.name] = [nums]; continue; }
    } else if (NUMERIC_PARAM.has(p.type)) {
      if (nums[numCursor] !== undefined && p.required) { args[p.name] = nums[numCursor++]; continue; }
    } else if (TEXTY.includes(p.name) || p.type === 'string') {
      if (p.required) {
        args[p.name] = String(message)
          .replace(/^\/[\w.:-]+\s*/, '')
          .replace(/^(please\s+)?(can you\s+|could you\s+|help me\s+|i want to\s+|i need to\s+)/i, '')
          .trim();
        continue;
      }
    }
    if (args[p.name] === undefined && p.default !== undefined) args[p.name] = p.default;
  }
  return args;
}

/* ------------------------------- planning -------------------------------- */

const PHASES = {
  understand: 'Understanding the request',
  plan: 'Planning the investigation',
  retrieve: 'Retrieving grounded evidence',
  execute: 'Running research instruments',
  synthesize: 'Synthesising the answer',
  critique: 'Self-critique & confidence',
};

function classify(message, registry, runtime) {
  const heuristic = registry.route(message, 8);
  const neural = runtime?.router ? runtime.routeNeural(message, 8) : [];
  const merged = new Map();
  for (const h of heuristic) merged.set(h.id, { id: h.id, heuristic: h.score, neural: 0 });
  for (const n of neural) {
    const cur = merged.get(n.id) || { id: n.id, heuristic: 0, neural: 0 };
    cur.neural = n.score;
    merged.set(n.id, cur);
  }
  const ranked = [...merged.values()]
    .map((x) => {
      const skill = registry.get(x.id);
      return {
        ...x,
        name: skill?.name || x.id,
        category: skill?.category,
        score: x.heuristic * 0.62 + x.neural * 2.6,
      };
    })
    .filter((x) => registry.get(x.id))
    .sort((a, b) => b.score - a.score);
  return ranked;
}

function needsData(skill) {
  return skill.params.some((p) => p.required && (p.type === 'numbers' || p.type === 'matrix'));
}

const MATHY = /[0-9]\s*[-+*/^=]|\b(solve|derivative|integral|integrate|matrix|equation|eigen|optimi[sz]e|ode|factorial|combination|permutation)\b/i;

/** Guards that stop an instrument being fired on input it cannot use. */
function admissible(skill, message, nums) {
  if (needsData(skill) && nums.length < 3) return false;
  const m = String(message);
  switch (skill.category) {
    case 'mathematics': if (!MATHY.test(m)) return false; break;
    default: break;
  }
  const guards = {
    'text.compare': /\bvs\.?\b|versus|compare|similar|plagiar|overlap/i,
    'data.code': /```|\bcode\b|javascript|\bscript\b|\brun this\b/i,
    'data.regex': /regex|regular expression|pattern/i,
    'data.csv': /,.*\n|\bcsv\b|\bdataset\b|\bcolumns?\b/i,
    'data.json': /[{[]/,
    'util.json': /[{[]/,
    'util.dates': /\d{4}-\d{2}-\d{2}|\bdate\b|\bdeadline\b|\btimeline\b/i,
    'math.units': /\bconvert\b|\bin (km|kg|lb|mi|ft|mb|gb)\b|\bto (km|kg|lb|mi|ft|mb|gb|celsius|fahrenheit)\b/i,
    'data.graph': /\bgraph\b|\bnetwork\b|\bnodes?\b|\bedges?\b|centrality/i,
    'data.timeseries': /time series|trend|autocorrelat|seasonal|forecast|over time/i,
    'neural.attention': /attention|head|interpretab|introspect/i,
    'neural.perplexity': /perplexit|surpris|likelihood of this/i,
    'neural.tokenize': /token|bpe|subword|vocabular/i,
    'neural.embed': /embed|vector|semantic similarity|nearest/i,
    'neural.generate': /generate|complete|continuation|raw model|sample from/i,
    'lit.cite': /cite|citation|apa|mla|bibtex|reference|doi/i,
  };
  const g = guards[skill.id];
  if (g && !g.test(m)) return false;
  return true;
}

/* ------------------------------ the pipeline ------------------------------ */

export async function* runAgent({ message, mode = 'deep', settings = {}, runtime, registry, history = [] }) {
  const t0 = Date.now();
  const emit = (type, payload) => ({ type, ...payload, t: Date.now() - t0 });
  const deep = mode === 'deep';
  const useNeural = settings.neural !== false;
  const maxSkills = deep ? (settings.maxSkills || 3) : 1;

  yield emit('phase', { phase: 'understand', label: PHASES.understand });

  // ---------- slash commands -------------------------------------------------
  const cmd = parseCommand(message);
  if (cmd) {
    if (cmd.cmd === 'help' || cmd.cmd === 'skills') {
      const cats = registry.categories();
      const md = `## Skill catalogue — ${registry.list().length} instruments\n\n${cats.map((c) => `### ${c.label}\n${c.skills.map((s) => `- \`/${s.id}\` **${s.name}** — ${s.summary}`).join('\n')}`).join('\n\n')}\n\n**Usage**\n- \`/stats.ttest {"a":"1 2 3","b":"4 5 6"}\` — explicit JSON arguments\n- \`/text.summarize your text here\` — free-text argument\n- Or just ask in plain language; the neural router picks the instruments.`;
      yield emit('delta', { text: md });
      yield emit('done', { skills: [], sources: [], confidence: 1, ms: Date.now() - t0 });
      return;
    }
    const skill = registry.get(cmd.cmd);
    if (skill) {
      const args = cmd.args || inferArgs(skill, cmd.rest || message);
      yield emit('phase', { phase: 'execute', label: `Running ${skill.name}` });
      yield emit('skill_start', { id: skill.id, name: skill.name, category: skill.category, args });
      try {
        const res = await registry.run(skill.id, args, agentContext(runtime, registry));
        yield emit('skill_result', { ...res, ok: true });
        yield emit('delta', { text: res.markdown });
        yield emit('done', { skills: [skill.id], sources: [], confidence: 0.95, ms: Date.now() - t0 });
      } catch (e) {
        yield emit('skill_result', { id: skill.id, ok: false, error: e.message });
        yield emit('delta', { text: `### ⚠️ \`${skill.id}\` could not run\n\n\`\`\`\n${e.message}\n\`\`\`\n\n**Parameters**\n${skill.params.map((p) => `- \`${p.name}\` (${p.type}${p.required ? ', required' : ''}) — ${p.description}`).join('\n')}` });
        yield emit('done', { skills: [], sources: [], confidence: 0.2, ms: Date.now() - t0 });
      }
      return;
    }
    yield emit('delta', { text: `Unknown command \`/${cmd.cmd}\`. Try \`/help\` for the catalogue.` });
    yield emit('done', { skills: [], sources: [], confidence: 0, ms: Date.now() - t0 });
    return;
  }

  // ---------- greetings & meta -----------------------------------------------
  if (/^\s*(hi|hello|hey|yo|good (morning|afternoon|evening)|what can you do|who are you|what are you|capabilities)\b/i.test(message) && message.length < 80) {
    const cats = registry.categories();
    const params = runtime?.ready ? runtime.model.numParams() : 0;
    const md = `### Welcome to ATLAS

I am a research console built around **ATLAS-R1**${params ? ` — a ${(params / 1e6).toFixed(2)}M-parameter transformer trained from scratch in this workspace` : ''}. My design splits the work honestly:

- **Numbers come from instruments.** ${registry.list().length} deterministic tools compute statistics, mathematics, text analytics and study designs — they are exact and auditable, never generated text.
- **Evidence comes from retrieval.** Answers are grounded in a curated knowledge base with citations you can open.
- **Prose comes from the neural model**, always labelled as such, because a model this size writes language rather than facts.

**What I am good at**
${cats.map((c) => `- **${c.label}** — ${c.skills.slice(0, 4).map((x) => x.name).join(', ')}${c.skills.length > 4 ? `, +${c.skills.length - 4} more` : ''}`).join('\n')}

**Try one of these**
- *"Design a preregistered experiment testing whether spaced practice beats massed practice"*
- *"Power analysis for d = 0.35 at 90% power"*
- *"Compare 12 15 11 19 22 14 vs 8 9 14 7 11 10"*
- *"Critique this method: we surveyed 30 students after the intervention"*
- \`/help\` for the full catalogue, \`/model.card\` for my provenance.`;
    for (const piece of chunkStream(md)) yield emit('delta', { text: piece });
    yield emit('done', { skills: [], sources: [], confidence: 1, ms: Date.now() - t0 });
    return;
  }

  // ---------- understand -----------------------------------------------------
  const ranked = classify(message, registry, runtime);
  const ents = entities(message);
  const nums = numbers(message);
  const kws = rake(message, 6).map((k) => k.phrase);
  yield emit('analysis', {
    intents: ranked.slice(0, 5).map((r) => ({ id: r.id, name: r.name, category: r.category, score: Number(r.score.toFixed(3)), neural: Number(r.neural.toFixed(3)), heuristic: r.heuristic })),
    entities: ents.slice(0, 12),
    numbers: nums.slice(0, 24),
    keywords: kws,
    tokens: runtime?.ready ? runtime.tokenizer.encode(message).length : null,
  });

  // ---------- plan -----------------------------------------------------------
  const chosen = [];
  const topScore = ranked[0]?.score || 0;
  for (const r of ranked) {
    if (chosen.length >= maxSkills) break;
    const skill = registry.get(r.id);
    if (!skill) continue;
    if (r.score < Math.max(0.55, topScore * 0.34)) continue;
    if (!admissible(skill, message, nums)) continue;
    if (chosen.length >= 2 && chosen.some((c) => c.category === skill.category)) continue;
    chosen.push(skill);
  }
  if (!chosen.length) {
    chosen.push(registry.get(deep ? 'research.explain' : 'knowledge.search') || registry.list()[0]);
  }

  const plan = [
    { step: 1, phase: 'retrieve', label: 'Ground the question in the knowledge base', detail: 'hybrid dense + BM25 retrieval' },
    ...chosen.map((s, i) => ({ step: i + 2, phase: 'execute', label: `Run ${s.name}`, detail: s.summary })),
    { step: chosen.length + 2, phase: 'synthesize', label: 'Compose the grounded answer', detail: 'merge instrument outputs, cite sources' },
    ...(deep ? [{ step: chosen.length + 3, phase: 'critique', label: 'Self-critique and confidence', detail: 'what would falsify this answer' }] : []),
  ];
  yield emit('phase', { phase: 'plan', label: PHASES.plan });
  yield emit('plan', { steps: plan, mode });

  // ---------- retrieve -------------------------------------------------------
  let sources = [];
  if (runtime?.ready && settings.retrieval !== false) {
    yield emit('phase', { phase: 'retrieve', label: PHASES.retrieve });
    try {
      sources = runtime.retrieve(message, deep ? 4 : 3);
      yield emit('sources', { sources: sources.map((s) => ({ id: s.id, title: s.title, field: s.field, score: Number(s.score.toFixed(4)), dense: Number(s.dense.toFixed(4)), lexical: Number(s.lexical.toFixed(4)), text: s.text })) });
    } catch (e) {
      yield emit('warning', { message: `retrieval unavailable: ${e.message}` });
    }
  }

  // ---------- execute --------------------------------------------------------
  yield emit('phase', { phase: 'execute', label: PHASES.execute });
  const results = [];
  const ctx = agentContext(runtime, registry);
  for (const skill of chosen) {
    const args = inferArgs(skill, message);
    yield emit('skill_start', { id: skill.id, name: skill.name, category: skill.category, args });
    try {
      const res = await registry.run(skill.id, args, ctx);
      results.push(res);
      runtime && (runtime.stats.skillRuns += 1);
      yield emit('skill_result', { id: res.skill, name: res.name, category: res.category, ms: res.ms, ok: true, data: res.data, viz: res.viz });
    } catch (e) {
      yield emit('skill_result', { id: skill.id, name: skill.name, ok: false, error: e.message });
    }
  }

  // ---------- query expansion (iterative deepening) --------------------------
  let followUp = [];
  if (deep && runtime?.ready && settings.retrieval !== false && results.length) {
    const corpus = results.map((r) => r.markdown).join(' ').slice(0, 4000);
    const expansion = rake(corpus, 5).map((k) => k.phrase).join(' ');
    if (expansion) {
      const seen = new Set(sources.map((s) => s.id));
      try {
        followUp = runtime.retrieve(`${message} ${expansion}`, 6)
          .filter((h) => !seen.has(h.id) && h.score > 0.35)
          .slice(0, 2);
      } catch { followUp = []; }
      if (followUp.length) {
        const all = [...sources, ...followUp];
        yield emit('sources', {
          sources: all.map((s) => ({
            id: s.id, title: s.title, field: s.field,
            score: Number(s.score.toFixed(4)), dense: Number(s.dense.toFixed(4)),
            lexical: Number(s.lexical.toFixed(4)), text: s.text,
          })),
          expandedQuery: expansion,
        });
      }
    }
  }

  // ---------- synthesise -----------------------------------------------------
  yield emit('phase', { phase: 'synthesize', label: PHASES.synthesize });

  const header = composeHeader(message, chosen, results, sources, deep);
  yield emit('delta', { text: header });

  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    const body = i === 0 ? r.markdown : `\n<details open><summary><b>${r.name}</b> · <code>${r.skill}</code> · ${r.ms} ms</summary>\n\n${r.markdown}\n\n</details>\n`;
    for (const piece of chunkStream(body)) {
      yield emit('delta', { text: piece });
    }
  }

  if (sources.length) {
    let md = `\n\n---\n\n### 📚 Grounding\n\n`;
    md += sources.map((s, i) => `**[${i + 1}]** *${s.title}* (${s.field}) — relevance ${s.score.toFixed(3)}\n> ${s.text.slice(0, 260)}${s.text.length > 260 ? '…' : ''}`).join('\n\n');
    if (followUp.length) {
      md += `\n\n**Second retrieval pass** — the instrument output was mined for terms and used to widen the query:\n\n`;
      md += followUp.map((s, i) => `**[${sources.length + i + 1}]** *${s.title}* (${s.field}) — relevance ${s.score.toFixed(3)}\n> ${s.text.slice(0, 220)}…`).join('\n\n');
    }
    yield emit('delta', { text: md });
  }

  // ---------- neural synthesis ----------------------------------------------
  if (useNeural && runtime?.ready) {
    const prompt = `<bos><user> ${message.slice(0, 300)} <atlas>`;
    let acc = '';
    yield emit('delta', { text: `\n\n---\n\n### 🧠 Neural synthesis · ATLAS-R1 (${(runtime.model.numParams() / 1e6).toFixed(2)}M params, trained from scratch)\n\n> ` });
    const r = runtime.generate(prompt, {
      maxTokens: Math.min(settings.maxTokens || 90, 200),
      temperature: settings.temperature ?? 0.85,
      topK: settings.topK ?? 40,
      topP: settings.topP ?? 0.92,
      repetitionPenalty: settings.repetitionPenalty ?? 1.15,
      seed: settings.seed ?? 42,
    });
    for (const piece of chunkStream(r.text.trim().replace(/\n+/g, ' '))) {
      acc += piece;
      yield emit('delta', { text: piece });
    }
    yield emit('neural', {
      tokens: r.stats.tokens,
      tokensPerSecond: Number(r.stats.tokensPerSecond.toFixed(2)),
      entropy: Number(r.stats.meanEntropy.toFixed(3)),
      meanLogProb: Number(r.stats.meanLogProb.toFixed(3)),
      steps: r.steps.slice(0, 32),
      text: acc,
    });
  }

  // ---------- critique -------------------------------------------------------
  let confidence = 0.5;
  if (deep) {
    yield emit('phase', { phase: 'critique', label: PHASES.critique });
    const ok = results.filter((r) => r.markdown).length;
    confidence = Math.max(0.15, Math.min(0.95,
      0.35 + 0.15 * ok + (sources.length ? 0.18 : 0) + (nums.length > 2 ? 0.12 : 0) - (results.length === 0 ? 0.3 : 0)));
    const critique = composeCritique({ message, chosen, results, sources, confidence, nums });
    for (const piece of chunkStream(critique)) yield emit('delta', { text: piece });
  }

  yield emit('done', {
    skills: results.map((r) => r.skill),
    sources: [...sources, ...followUp].map((s) => s.id),
    confidence: Number(confidence.toFixed(2)),
    ms: Date.now() - t0,
  });
}

/* -------------------------------- helpers -------------------------------- */

export function agentContext(runtime, registry) {
  if (!runtime?.ready) return { registry };
  return {
    registry,
    model: runtime.model,
    tokenizer: runtime.tokenizer,
    meta: runtime.meta,
    retrieve: (q, k) => runtime.retrieve(q, k),
    embed: (t) => runtime.embed(t),
    generate: (p, o) => runtime.generate(p, o),
    attention: (t, l) => runtime.attention(t, l),
    perplexity: (t) => runtime.perplexity(t),
  };
}

function chunkStream(text, size = 26) {
  const out = [];
  const tokens = String(text).split(/(\s+)/);
  let buf = '';
  for (const t of tokens) {
    buf += t;
    if (buf.length >= size) {
      out.push(buf);
      buf = '';
    }
  }
  if (buf) out.push(buf);
  return out;
}

function composeHeader(message, chosen, results, sources, deep) {
  const q = String(message).trim().replace(/\s+/g, ' ');
  const short = q.length > 120 ? `${q.slice(0, 117)}…` : q;
  const instruments = chosen.map((s) => `\`${s.id}\``).join(' · ');
  return `### ${deep ? 'Deep research' : 'Fast'} response\n\n**Question.** ${short}\n\n**Instruments engaged.** ${instruments}${sources.length ? `  ·  **Grounded in** ${sources.length} knowledge-base passage${sources.length > 1 ? 's' : ''}` : ''}\n\n---\n\n`;
}

function composeCritique({ message, chosen, results, sources, confidence, nums }) {
  const weak = [];
  if (!sources.length) weak.push('No knowledge-base passage matched strongly — the answer rests on procedure, not on retrieved evidence.');
  if (nums.length < 2 && chosen.some((c) => c.category === 'statistics')) weak.push('A statistical instrument was selected but few numbers were supplied; the numeric conclusions are illustrative until you paste the data.');
  if (results.length < chosen.length) weak.push('At least one instrument failed to run — see the trace above for the exact parameter that was missing.');
  if (String(message).length < 40) weak.push('The request is short, so the intent inference has wide error bars. More context will sharpen instrument selection.');
  const cl = claims(results.map((r) => r.markdown).join(' ')).slice(0, 2);
  return `\n\n---\n\n### 🔍 Self-critique

**Confidence: ${(confidence * 100).toFixed(0)}%** — computed from instrument success (${results.length}/${chosen.length}), grounding (${sources.length} passages) and input specificity.

${weak.length ? weak.map((w) => `- ⚠️ ${w}`).join('\n') : '- No structural weaknesses detected in this run.'}

**What would change this answer**
- Supplying the raw data would replace the procedural guidance with computed estimates and intervals.
- Naming the target population and the decision the work informs would change which design is optimal.
- A different smallest-effect-of-interest changes every sample-size conclusion above.

${cl.length ? `**Claims made above that you should verify independently**\n${cl.map((c) => `- ${c.claim.slice(0, 160)}`).join('\n')}` : ''}

**Suggested next moves**
${chosen.slice(0, 2).map((s) => `- Refine with \`/${s.id}\` and explicit parameters.`).join('\n')}
- Ask \`/model.card\` to see exactly what the underlying model is and is not.`;
}
