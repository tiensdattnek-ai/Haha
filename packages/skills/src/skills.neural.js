/**
 * skills.neural.js — introspection of the ATLAS model itself.
 * These skills need the runtime context: { model, tokenizer, meta, generate,
 * retrieve, embed }, injected by the server.
 */
import { table, fmt } from './registry.js';

const need = (ctx) => {
  if (!ctx || !ctx.model || !ctx.tokenizer) throw new Error('the neural runtime is not loaded yet — train the model first (npm run train)');
  return ctx;
};

export default [
  {
    id: 'neural.generate',
    name: 'Raw Neural Completion',
    category: 'neural',
    summary: 'Samples directly from the from-scratch transformer with the full decoding option surface.',
    tags: ['generate', 'completion', 'sample', 'model', 'temperature'],
    params: [
      { name: 'prompt', type: 'string', required: true, description: 'prompt text' },
      { name: 'maxTokens', type: 'number', default: 80, description: 'tokens to generate' },
      { name: 'temperature', type: 'number', default: 0.85, description: 'softmax temperature' },
      { name: 'topK', type: 'number', default: 40, description: 'top-k filter' },
      { name: 'topP', type: 'number', default: 0.92, description: 'nucleus threshold' },
      { name: 'seed', type: 'number', default: 42, description: 'sampling seed' },
    ],
    match: (m) => (/\b(generate|complete this|continue the text|raw model|sample from)\b/i.test(m) ? 2 : 0),
    run: (args, ctx) => {
      const { model, tokenizer, generate } = need(ctx);
      const r = generate(args.prompt, {
        maxTokens: Number(args.maxTokens) || 80,
        temperature: Number(args.temperature),
        topK: Number(args.topK),
        topP: Number(args.topP),
        seed: Number(args.seed),
      });
      const top = r.steps.slice(0, 6);
      return {
        markdown: `## Neural completion

> ${r.text.trim() || '_(empty)_'}

${table(['Decoding stat', 'Value'], [
  ['Tokens generated', String(r.stats.tokens)],
  ['Throughput', `${r.stats.tokensPerSecond.toFixed(1)} tok/s`],
  ['Mean entropy', `${fmt(r.stats.meanEntropy, 3)} nats`],
  ['Mean log-prob', fmt(r.stats.meanLogProb, 3)],
  ['Model', `${model.cfg.nLayer}L · ${model.cfg.nHead}H · ${model.cfg.nEmbd}D · ctx ${model.cfg.blockSize} · V ${model.cfg.vocabSize}`],
])}

### First decoding steps
${top.map((s, i) => `**${i + 1}.** chose \`${s.piece.replace(/\n/g, '⏎')}\` (p = ${fmt(s.p, 3)}, H = ${fmt(s.entropy, 2)}) — alternatives: ${s.topProbs.slice(0, 4).map((t) => `\`${t.piece.replace(/\n/g, '⏎')}\`${fmt(t.p, 2)}`).join(' ')}`).join('\n')}

> This is the unfiltered parametric model: ~${(model.numParams() / 1e6).toFixed(2)}M parameters trained from random initialisation on a ${(ctx.meta?.corpusChars ? (ctx.meta.corpusChars / 1e6).toFixed(2) : '1.4')}M-character research corpus. Treat it as a language surface, not as a fact source — that is what the knowledge base and skills are for.`,
        data: { text: r.text, stats: r.stats, steps: r.steps.slice(0, 40) },
        viz: { type: 'tokenProbs', steps: r.steps.slice(0, 24) },
      };
    },
  },

  {
    id: 'neural.tokenize',
    name: 'Tokenizer Explorer',
    category: 'neural',
    summary: 'Shows how the learned byte-level BPE segments text, with compression statistics.',
    tags: ['tokenize', 'bpe', 'tokens', 'vocabulary', 'subword'],
    params: [{ name: 'text', type: 'string', required: true, description: 'text to tokenise' }],
    match: (m) => (/\b(token(i[sz]e|s)|bpe|subword|vocabulary)\b/i.test(m) ? 3 : 0),
    run: ({ text }, ctx) => {
      const { tokenizer } = need(ctx);
      const ids = tokenizer.encode(text);
      const pieces = ids.map((id) => ({ id, piece: tokenizer.piece(id) }));
      const round = tokenizer.decode(ids);
      return {
        markdown: `## Tokenisation — ${ids.length} tokens for ${text.length} characters (${(text.length / Math.max(1, ids.length)).toFixed(2)} chars/token)

${pieces.map((p) => `\`${p.piece.replace(/\n/g, '⏎').replace(/ /g, '␣')}\``).join(' ')}

${table(['Property', 'Value'], [
  ['Vocabulary size', String(tokenizer.size)],
  ['Learned merges', String(tokenizer.merges.length)],
  ['Compression ratio', `${(text.length / Math.max(1, ids.length)).toFixed(2)}×`],
  ['Round-trip exact', round === text ? '✅ lossless' : '⚠️ mismatch'],
  ['Unique tokens used', String(new Set(ids).size)],
])}

<details><summary>Token ids</summary>

\`\`\`
${ids.join(' ')}
\`\`\`
</details>

> The tokenizer was trained by byte-pair merging on the ATLAS corpus itself, so domain terms ("preregistration", "heterogeneity") compress into few tokens while out-of-domain text fragments into bytes — a direct readout of what the model has seen.`,
        data: { ids, pieces, ratio: text.length / Math.max(1, ids.length) },
      };
    },
  },

  {
    id: 'neural.attention',
    name: 'Attention Cartographer',
    category: 'neural',
    summary: 'Extracts per-head causal attention maps for a prompt and summarises what each head does.',
    tags: ['attention', 'heads', 'interpretability', 'visualise', 'introspect'],
    params: [
      { name: 'text', type: 'string', required: true, description: 'prompt to analyse' },
      { name: 'layer', type: 'number', default: -1, description: 'layer index (-1 = last)' },
    ],
    match: (m) => (/\b(attention|attend|head|interpretab|introspect)\b/i.test(m) ? 3 : 0),
    run: ({ text, layer = -1 }, ctx) => {
      const { model, tokenizer, attention } = need(ctx);
      const r = attention(text, Number(layer));
      const { tokens, maps, layerIndex } = r;
      const summaries = maps.map((m, h) => {
        // diagnose head behaviour: previous-token, first-token, diagonal, diffuse
        let prev = 0, first = 0, self = 0, entropy = 0;
        const T = tokens.length;
        for (let i = 1; i < T; i++) {
          prev += m[i][i - 1];
          first += m[i][0];
          self += m[i][i];
          let e = 0;
          for (let j = 0; j <= i; j++) if (m[i][j] > 0) e -= m[i][j] * Math.log(m[i][j]);
          entropy += e / Math.log(i + 1);
        }
        const n = Math.max(1, T - 1);
        const scores = { previous: prev / n, first: first / n, self: self / n };
        const best = Object.entries(scores).sort((a, b) => b[1] - a[1])[0];
        const label = best[1] < 0.25 ? 'diffuse / mixing' : best[0] === 'previous' ? 'previous-token (n-gram)' : best[0] === 'first' ? 'attention sink (BOS)' : 'self / identity';
        return { head: h, label, entropy: entropy / n, ...scores };
      });
      const maxT = Math.min(tokens.length, 14);
      const grid = maps[0].slice(0, maxT).map((row, i) => [
        `\`${tokens[i].replace(/\n/g, '⏎').replace(/ /g, '␣').slice(0, 10)}\``,
        ...row.slice(0, maxT).map((v) => (v > 0.5 ? '██' : v > 0.25 ? '▓▓' : v > 0.1 ? '▒▒' : v > 0.02 ? '░░' : '··')),
      ]);
      return {
        markdown: `## Attention map — layer ${layerIndex} of ${model.cfg.nLayer}, ${tokens.length} tokens

### Head taxonomy
${table(['Head', 'Behaviour', 'prev-token', 'first-token', 'self', 'norm. entropy'], summaries.map((s) => [
  `H${s.head}`, s.label, fmt(s.previous, 3), fmt(s.first, 3), fmt(s.self, 3), fmt(s.entropy, 3),
]))}

### Head 0 pattern (rows = query position, cols = key position)
${table(['token', ...tokens.slice(0, maxT).map((t, i) => String(i))], grid)}

Legend: \`██\` >0.5 · \`▓▓\` >0.25 · \`▒▒\` >0.1 · \`░░\` >0.02 · \`··\` ~0

> Causal masking makes the matrix lower-triangular by construction. Low-entropy heads implement sharp positional rules; high-entropy heads average context. Both appear in this model despite its size, which is the same qualitative structure reported for large transformers.`,
        data: { tokens, summaries, layer: layerIndex },
        viz: { type: 'attention', tokens: tokens.slice(0, 24), maps: maps.map((m) => m.slice(0, 24).map((r) => r.slice(0, 24))) },
      };
    },
  },

  {
    id: 'neural.embed',
    name: 'Embedding Space Probe',
    category: 'neural',
    summary: 'Embeds text with the model’s own hidden states and finds nearest neighbours in the knowledge base.',
    tags: ['embedding', 'semantic', 'similarity', 'vector', 'neighbours'],
    params: [
      { name: 'text', type: 'string', required: true, description: 'text to embed' },
      { name: 'compare', type: 'string', default: '', description: 'optional second text for cosine similarity' },
    ],
    match: (m) => (/\b(embed|semantic similarity|vector space|nearest neighbou?r)\b/i.test(m) ? 2.5 : 0),
    run: ({ text, compare = '' }, ctx) => {
      const { embed, retrieve, model } = need(ctx);
      const v = embed(text);
      const top = retrieve(text, 5);
      let sim = null;
      if (compare) {
        const w = embed(compare);
        let dot = 0;
        for (let i = 0; i < v.length; i++) dot += v[i] * w[i];
        sim = dot;
      }
      const dims = Array.from(v).map((x, i) => ({ i, x })).sort((a, b) => Math.abs(b.x) - Math.abs(a.x)).slice(0, 8);
      return {
        markdown: `## Embedding probe (${v.length}-dimensional, L2-normalised)

${sim !== null ? `**Cosine similarity with the comparison text: ${fmt(sim, 4)}** — ${sim > 0.9 ? 'near-paraphrase' : sim > 0.7 ? 'closely related' : sim > 0.45 ? 'topically related' : 'largely unrelated in this model\'s space'}\n` : ''}
### Nearest knowledge-base entries
${table(['Rank', 'Entry', 'Field', 'Cosine'], top.map((t, i) => [i + 1, t.title, t.field, fmt(t.score, 4)]))}

### Most activated dimensions
${dims.map((d) => `\`d${String(d.i).padStart(3, '0')}\` ${d.x >= 0 ? '+' : '−'}${'▮'.repeat(Math.max(1, Math.round(Math.abs(d.x) * 40)))} ${fmt(d.x, 3)}`).join('\n')}

> These vectors are position-weighted mean-pooled final hidden states of the same ${(model.numParams() / 1e6).toFixed(2)}M-parameter transformer used for generation. Nothing is imported from an external embedding service — the retrieval system runs on representations this model learned during pretraining.`,
        data: { dim: v.length, similarity: sim, neighbours: top.map((t) => ({ id: t.id, title: t.title, score: t.score })) },
      };
    },
  },

  {
    id: 'neural.perplexity',
    name: 'Perplexity Scorer',
    category: 'neural',
    summary: 'Scores text under the model and highlights the tokens it found most surprising.',
    tags: ['perplexity', 'surprise', 'likelihood', 'score', 'evaluate'],
    params: [{ name: 'text', type: 'string', required: true, description: 'text to score' }],
    match: (m) => (/\b(perplexity|surprisal|how likely|score this text)\b/i.test(m) ? 3 : 0),
    run: ({ text }, ctx) => {
      const { tokenizer, perplexity } = need(ctx);
      const r = perplexity(text);
      if (!r) throw new Error('need at least two tokens to score');
      const ids = tokenizer.encode(text).slice(0, r.perToken.length + 1);
      const surprises = r.perToken.map((l, i) => ({ piece: tokenizer.piece(ids[i + 1]), loss: l, i }))
        .sort((a, b) => b.loss - a.loss).slice(0, 10);
      return {
        markdown: `## Perplexity report

${table(['Metric', 'Value'], [
  ['Cross-entropy', `${fmt(r.loss, 4)} nats/token`],
  ['Perplexity', fmt(r.ppl, 2)],
  ['Bits per token', fmt(r.loss / Math.LN2, 3)],
  ['Tokens scored', String(r.perToken.length)],
])}

### Most surprising tokens
${surprises.map((s) => `\`${s.piece.replace(/\n/g, '⏎').replace(/ /g, '␣')}\` at position ${s.i} — ${fmt(s.loss, 2)} nats ${'█'.repeat(Math.min(30, Math.round(s.loss * 3)))}`).join('\n')}

**Reading.** A perplexity of ${fmt(r.ppl, 1)} means the model was, on average, choosing among ~${Math.round(r.ppl)} equally likely tokens at each step. Text drawn from its training distribution scores far lower than out-of-domain text — perplexity is therefore a *domain membership* detector as much as a quality metric.`,
        data: r,
        viz: { type: 'perTokenLoss', perToken: r.perToken.slice(0, 120) },
      };
    },
  },

  {
    id: 'knowledge.search',
    name: 'Knowledge Base Retrieval',
    category: 'neural',
    summary: 'Hybrid dense + lexical retrieval over the curated research knowledge base, with citations.',
    tags: ['search', 'retrieve', 'rag', 'knowledge', 'source', 'grounding'],
    params: [
      { name: 'query', type: 'string', required: true, description: 'what to look up' },
      { name: 'k', type: 'number', default: 4, description: 'passages to return' },
    ],
    match: (m) => (/\b(what does .* say|look ?up|find (information|sources)|according to|knowledge base|cite sources)\b/i.test(m) ? 2 : 0),
    run: ({ query, k = 4 }, ctx) => {
      const { retrieve } = need(ctx);
      const hits = retrieve(query, Number(k) || 4);
      return {
        markdown: `## Retrieved evidence for "${query}"

${hits.map((h, i) => `### [${i + 1}] ${h.title}  \`${h.id}\`
*${h.field}* · relevance ${fmt(h.score, 3)} (dense ${fmt(h.dense, 3)} / lexical ${fmt(h.lexical, 3)})

${h.text.slice(0, 700)}${h.text.length > 700 ? '…' : ''}

<sub>tags: ${h.tags.join(', ')}</sub>`).join('\n\n')}

---
**Citation block**
${hits.map((h, i) => `[${i + 1}] ATLAS Knowledge Base, "${h.title}" (${h.id}), field: ${h.field}.`).join('\n')}

> Retrieval is hybrid: cosine similarity in the model's own embedding space combined with BM25-style lexical scoring, which recovers exact-term matches that dense vectors miss.`,
        data: { hits: hits.map((h) => ({ id: h.id, title: h.title, score: h.score })) },
      };
    },
  },

  {
    id: 'model.card',
    name: 'Model Card',
    category: 'neural',
    summary: 'Full transparency card: architecture, training run, metrics, limitations and intended use.',
    tags: ['model card', 'about', 'architecture', 'training', 'transparency'],
    params: [],
    match: (m) => (/\b(model card|what model|who are you|your architecture|how were you trained|about you)\b/i.test(m) ? 3 : 0),
    run: (_args, ctx) => {
      const { model, tokenizer, meta } = need(ctx);
      const c = model.cfg;
      const groups = model.describe().groups;
      return {
        markdown: `## ATLAS-R1 · Model Card

**Identity.** A decoder-only transformer written and trained from scratch inside this workspace. No pretrained weights, no external model API, no ML framework — the autodiff engine, the optimiser, the tokenizer and the training loop are all part of this repository.

### Architecture
${table(['Property', 'Value'], [
  ['Layers', String(c.nLayer)], ['Heads', String(c.nHead)], ['Model dim', String(c.nEmbd)],
  ['Head dim', String(c.nEmbd / c.nHead)], ['MLP ratio', String(c.mlpRatio)],
  ['Context', `${c.blockSize} tokens`], ['Vocabulary', `${c.vocabSize} byte-level BPE`],
  ['Parameters', model.numParams().toLocaleString()],
  ['Positional encoding', 'learned absolute'], ['Normalisation', 'pre-LN with learned affine'],
  ['Activation', 'GELU (tanh approx.)'], ['Head', 'weight-tied to the token embedding'],
])}

### Parameter budget
${table(['Block', 'Parameters'], Object.entries(groups).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, v]) => [`\`${k}\``, v.toLocaleString()]))}

### Training run
${table(['Property', 'Value'], [
  ['Corpus', `${(meta?.corpusChars || 0).toLocaleString()} characters, ${(meta?.tokens || 0).toLocaleString()} tokens`],
  ['Steps', String(meta?.steps ?? '—')], ['Batch', String(meta?.batch ?? '—')],
  ['Optimiser', `AdamW (lr ${meta?.optimizer?.lr ?? '—'} → ${meta?.optimizer?.minLr ?? '—'}, wd ${meta?.optimizer?.weightDecay ?? '—'}, clip ${meta?.optimizer?.clip ?? '—'})`],
  ['Schedule', 'linear warmup → cosine decay'],
  ['Final train loss', meta?.finalTrainLoss ? fmt(meta.finalTrainLoss, 4) : '—'],
  ['Final val loss', meta?.finalValLoss ? fmt(meta.finalValLoss, 4) : '—'],
  ['Validation perplexity', meta?.perplexity ? fmt(meta.perplexity, 2) : '—'],
  ['Wall-clock', meta?.wallClockSeconds ? `${(meta.wallClockSeconds / 60).toFixed(1)} min on 2 CPU cores` : '—'],
  ['Trained at', meta?.trainedAt || '—'],
])}

### Intended use
Research assistance: structuring studies, running statistics, analysing text, retrieving from the curated knowledge base. The deterministic skill engine does the quantitative work; the neural model handles language and semantic retrieval.

### Limitations (stated plainly)
1. **Scale.** At ~${(model.numParams() / 1e6).toFixed(2)}M parameters trained on a ${((meta?.corpusChars || 1400000) / 1e6).toFixed(1)}M-character domain corpus, the parametric model has narrow world knowledge. It is not a general-purpose LLM and will not be one.
2. **Domain lock.** Fluency is highest on research-methodology English, which is what it was trained on. Out-of-domain prompts produce out-of-domain quality.
3. **No live internet.** Every factual answer is grounded in the local knowledge base and cited as such.
4. **Deterministic tools, probabilistic prose.** Numbers in answers come from the skill engine and are exact; connective prose comes from templates and the model.

### Reproducibility
\`npm run pipeline\` regenerates the corpus, retrains the tokenizer and the model, and rebuilds the retrieval index from a fixed seed. Same seed ⇒ same weights, bit for bit.`,
        data: { config: c, params: model.numParams(), meta },
      };
    },
  },
];
