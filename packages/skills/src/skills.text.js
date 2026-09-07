/**
 * skills.text.js — text analytics and literature/citation tooling.
 */
import { table, fmt } from './registry.js';
import {
  textRank, rake, readability, textStats, stance, fallacies, claims, entities,
  levenshtein, jaccard, tfidf, cosineMaps, sentences, words,
} from './textcore.js';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function parseRef(input) {
  const s = String(input).trim();
  const year = (s.match(/\b(1[89]\d{2}|20[0-5]\d)\b/) || [])[1] || 'n.d.';
  const doi = (s.match(/10\.\d{4,9}\/[-._;()/:A-Z0-9]+/i) || [])[0] || null;
  const url = (s.match(/https?:\/\/\S+/) || [])[0] || null;
  // authors: leading "Surname, A." patterns or "A. Surname" list before the year
  const beforeYear = s.split(String(year))[0] || s;
  const authors = beforeYear
    .split(/\s*(?:;|,\s*(?=[A-Z][a-z]+\s*,)|&|\band\b)\s*/)
    .map((a) => a.replace(/[(),.]+$/, '').trim())
    .filter((a) => a && /[A-Za-z]/.test(a) && a.split(/\s+/).length <= 4)
    .slice(0, 8);
  const afterYear = s.split(String(year))[1] || '';
  const parts = afterYear.split(/[.·|]/).map((p) => p.trim()).filter(Boolean);
  const title = parts[0] || s.slice(0, 80);
  const journal = parts[1] || '';
  const volume = (afterYear.match(/\b(\d{1,3})\s*\(\s*\d+\s*\)/) || [])[1] || (afterYear.match(/\b(\d{1,3}),\s*\d+/) || [])[1] || '';
  const pages = (afterYear.match(/\b(\d+\s*[–-]\s*\d+)\b/) || [])[1] || '';
  return { authors, year, title, journal, volume, pages, doi, url };
}

export default [
  {
    id: 'text.summarize',
    name: 'Extractive Summariser',
    category: 'text',
    summary: 'TextRank summary with sentence-level importance scores and compression ratio.',
    tags: ['summarize', 'summarise', 'tldr', 'condense', 'key points'],
    params: [
      { name: 'text', type: 'string', required: true, description: 'text to summarise' },
      { name: 'sentences', type: 'number', default: 5, description: 'sentences to keep' },
    ],
    match: (m) => (/\b(summari[sz]e|tl;?dr|key points|condense|shorten)\b/i.test(m) ? 3 : 0),
    run: ({ text, sentences: k = 5 }) => {
      const r = textRank(text, { maxSentences: Math.max(1, Number(k) || 5) });
      const top = r.scores.slice().sort((a, b) => b.score - a.score).slice(0, 8);
      const kws = rake(text, 8);
      return {
        markdown: `## Summary (${r.summary.length} of ${r.sentences} sentences${r.compression ? `, ${(r.compression * 100).toFixed(0)}% retained` : ''})

${r.summary.map((s, i) => `${i + 1}. ${s}`).join('\n')}

### Key phrases
${kws.map((k) => `\`${k.phrase}\` (${fmt(k.score, 2)})`).join(' · ')}

<details><summary>Sentence importance ranking</summary>

${table(['#', 'Score', 'Sentence'], top.map((s) => [s.index + 1, fmt(s.score, 4), s.sentence.slice(0, 110) + (s.sentence.length > 110 ? '…' : '')]))}
</details>

> Extractive summarisation preserves the author's wording, so nothing is hallucinated — but it also inherits the author's framing. For a critical reading, pair this with the Methodology Critic.`,
        data: { summary: r.summary, keywords: kws, sentences: r.sentences },
      };
    },
  },

  {
    id: 'text.keywords',
    name: 'Keyword & Concept Extractor',
    category: 'text',
    summary: 'RAKE phrases plus TF-IDF terms and a concept co-occurrence map.',
    tags: ['keywords', 'terms', 'concepts', 'indexing', 'tags'],
    params: [
      { name: 'text', type: 'string', required: true, description: 'source text' },
      { name: 'top', type: 'number', default: 15, description: 'how many phrases' },
    ],
    match: (m) => (/\b(keywords?|key ?terms|tags for|index terms)\b/i.test(m) ? 3 : 0),
    run: ({ text, top = 15 }) => {
      const N = Number(top) || 15;
      const phrases = rake(text, N);
      const ss = sentences(text);
      const vecs = tfidf(ss);
      const global = new Map();
      for (const v of vecs) for (const [w, s] of v) global.set(w, (global.get(w) || 0) + s);
      const terms = [...global.entries()].sort((a, b) => b[1] - a[1]).slice(0, N);
      // co-occurrence of the top 8 terms
      const topTerms = terms.slice(0, 8).map((t) => t[0]);
      const co = topTerms.map((a) => topTerms.map((b) => (a === b ? '·' : ss.filter((s) => s.toLowerCase().includes(a) && s.toLowerCase().includes(b)).length)));
      return {
        markdown: `## Keyword extraction

**RAKE phrases**
${table(['Phrase', 'Score', 'Words'], phrases.map((p) => [`\`${p.phrase}\``, fmt(p.score, 2), p.words]))}

**TF-IDF terms**
${terms.map(([w, s]) => `\`${w}\`(${fmt(s, 3)})`).join(' · ')}

**Co-occurrence (sentences containing both)**
${table(['', ...topTerms], co.map((row, i) => [topTerms[i], ...row.map(String)]))}

> Use the multi-word RAKE phrases as manuscript keywords and the single TF-IDF terms as database search terms — they serve different retrieval systems.`,
        data: { phrases, terms },
      };
    },
  },

  {
    id: 'text.readability',
    name: 'Readability & Style',
    category: 'text',
    summary: 'Six readability indices, sentence-length distribution and audience calibration advice.',
    tags: ['readability', 'flesch', 'grade level', 'style', 'clarity'],
    params: [{ name: 'text', type: 'string', required: true, description: 'text to score' }],
    match: (m) => (/\b(readab|flesch|grade level|too complex|plain language|clarity)\b/i.test(m) ? 3 : 0),
    run: ({ text }) => {
      const r = readability(text);
      const st = textStats(text);
      const ss = sentences(text).map((s) => words(s).length);
      const longest = Math.max(...ss, 0);
      return {
        markdown: `## Readability report

${table(['Index', 'Score', 'Interpretation'], [
  ['Flesch Reading Ease', fmt(r.fleschReadingEase, 1), r.band],
  ['Flesch–Kincaid Grade', fmt(r.fleschKincaidGrade, 1), `US grade ${Math.round(r.fleschKincaidGrade)}`],
  ['Gunning Fog', fmt(r.gunningFog, 1), 'years of formal education needed'],
  ['SMOG', fmt(r.smogIndex, 1), 'best for health/consent materials'],
  ['Coleman–Liau', fmt(r.colemanLiau, 1), 'character-based, robust to syllable errors'],
  ['Automated Readability', fmt(r.automatedReadability, 1), 'character + sentence based'],
  ['**Consensus grade**', `**${fmt(r.consensusGrade, 1)}**`, 'mean of the five grade scales'],
])}

${table(['Structure', 'Value'], [
  ['Words / sentences', `${r.words} / ${r.sentences}`],
  ['Mean sentence length', `${fmt(r.avgSentenceLength, 1)} words`],
  ['Longest sentence', `${longest} words`],
  ['Complex words (3+ syllables)', `${r.complexWords} (${((r.complexWords / r.words) * 100).toFixed(1)}%)`],
  ['Type-token ratio', fmt(st.typeTokenRatio, 3)],
  ['Lexical entropy', `${fmt(st.entropyBitsPerWord, 2)} bits/word`],
])}

### Calibration
- **Journal abstract:** grade 13–16 is normal. You are at ${fmt(r.consensusGrade, 1)}.
- **Grant lay summary / consent form:** target grade ≤ 8. ${r.consensusGrade > 8 ? `You are ${fmt(r.consensusGrade - 8, 1)} grades above that — split sentences over ${Math.round(r.avgSentenceLength)} words and replace ${r.complexWords} polysyllabic terms.` : 'You already meet this target.'}
- ${longest > 40 ? `⚠️ A ${longest}-word sentence exists — sentences beyond ~35 words lose most readers regardless of expertise.` : 'No runaway sentences detected.'}`,
        data: { ...r, stats: st },
      };
    },
  },

  {
    id: 'text.stats',
    name: 'Corpus Statistics',
    category: 'text',
    summary: 'Lexical richness, Zipf profile, entropy and frequency spectrum of a text.',
    tags: ['text stats', 'word count', 'lexical', 'zipf', 'frequency'],
    params: [{ name: 'text', type: 'string', required: true, description: 'text to profile' }],
    match: (m) => (/\b(word count|how many words|lexical|vocabulary|zipf|frequency)\b/i.test(m) ? 2.5 : 0),
    run: ({ text }) => {
      const s = textStats(text);
      const max = s.topWords[0]?.count || 1;
      return {
        markdown: `## Corpus profile

${table(['Metric', 'Value', 'Metric', 'Value'], [
  ['Characters', s.characters.toLocaleString(), 'Words', s.words.toLocaleString()],
  ['Unique types', s.types.toLocaleString(), 'Sentences', s.sentences],
  ['Type–token ratio', fmt(s.typeTokenRatio, 4), 'Root TTR', fmt(s.rootTTR, 3)],
  ['Hapax legomena', s.hapaxLegomena, 'Content-word ratio', fmt(s.contentWordRatio, 3)],
  ['Entropy', `${fmt(s.entropyBitsPerWord, 3)} bits/word`, 'Paragraphs', s.paragraphs],
])}

### Frequency spectrum (content words)
${s.topWords.slice(0, 15).map((w) => `\`${w.word.padEnd(18)}\` ${'█'.repeat(Math.max(1, Math.round((w.count / max) * 28)))} ${w.count}`).join('\n')}

### Zipf check
${table(['Rank', 'Word', 'Observed', 'Zipf prediction (c/r)'], s.zipfFit.slice(0, 8).map((z) => [z.rank, z.word, z.count, fmt(s.zipfFit[0].count / z.rank, 1)]))}

Deviation from the Zipf line indicates domain-specific vocabulary concentration — normal in technical writing, suspicious in "general audience" material.`,
        data: s,
      };
    },
  },

  {
    id: 'text.compare',
    name: 'Text Comparison',
    category: 'text',
    summary: 'Cosine, Jaccard, Levenshtein and shared-vocabulary analysis of two texts.',
    tags: ['compare', 'similarity', 'plagiarism', 'diff', 'overlap'],
    params: [
      { name: 'a', type: 'string', required: true, description: 'first text' },
      { name: 'b', type: 'string', required: true, description: 'second text' },
    ],
    match: (m) => (/\b(compare|similarity|how similar|overlap|plagiar)\b/i.test(m) ? 2.5 : 0),
    run: ({ a, b }) => {
      const [va, vb] = tfidf([a, b]);
      const cos = cosineMaps(va, vb);
      const jac = jaccard(a, b);
      const lev = levenshtein(String(a).slice(0, 2000), String(b).slice(0, 2000));
      const maxLen = Math.max(String(a).length, String(b).length, 1);
      const wa = new Set(words(a));
      const wb = new Set(words(b));
      const shared = [...wa].filter((w) => wb.has(w));
      const onlyA = [...wa].filter((w) => !wb.has(w)).slice(0, 15);
      const onlyB = [...wb].filter((w) => !wa.has(w)).slice(0, 15);
      const verdict = cos > 0.85 ? 'near-duplicate — check for self-plagiarism or template reuse'
        : cos > 0.6 ? 'strongly overlapping content'
          : cos > 0.3 ? 'related but distinct' : 'largely unrelated';
      return {
        markdown: `## Text comparison

${table(['Metric', 'Value', 'Range'], [
  ['TF-IDF cosine', fmt(cos, 4), '0 = unrelated, 1 = identical vocabulary profile'],
  ['Jaccard (word sets)', fmt(jac, 4), 'set overlap'],
  ['Levenshtein distance', String(lev), `${((1 - lev / maxLen) * 100).toFixed(1)}% character similarity`],
  ['Shared vocabulary', String(shared.length), `${((shared.length / (wa.size + wb.size - shared.length || 1)) * 100).toFixed(1)}% of the union`],
])}

**Verdict: ${verdict}.**

- Unique to A: ${onlyA.map((w) => `\`${w}\``).join(' ') || '—'}
- Unique to B: ${onlyB.map((w) => `\`${w}\``).join(' ') || '—'}

> Lexical similarity is not semantic identity. For paraphrase detection use the neural embedding skill (\`neural.embed\`), which compares meaning in the model's learned space rather than surface words.`,
        data: { cosine: cos, jaccard: jac, levenshtein: lev, shared: shared.length },
      };
    },
  },

  {
    id: 'text.claims',
    name: 'Claim & Evidence Miner',
    category: 'text',
    summary: 'Extracts checkable claims, classifies them, and flags the evidence each one needs.',
    tags: ['claims', 'evidence', 'fact check', 'assertions'],
    params: [{ name: 'text', type: 'string', required: true, description: 'text to mine' }],
    match: (m) => (/\b(claims?|assertions?|fact.?check|what does it claim)\b/i.test(m) ? 2.5 : 0),
    run: ({ text }) => {
      const cl = claims(text);
      const ents = entities(text);
      const byType = ents.reduce((acc, e) => { (acc[e.type] ||= []).push(e.value); return acc; }, {});
      return {
        markdown: `## Claim extraction (${cl.length} found)

${cl.length ? cl.slice(0, 12).map((c, i) => `**${i + 1}. [${c.type}${c.hedged ? ', hedged' : ''}${c.quantitative ? ', quantitative' : ''}]** ${c.claim}
   - *Checkability* ${(c.checkability * 100).toFixed(0)}% · *Evidence required:* ${c.type === 'causal' ? 'an identification strategy (randomisation, instrument, discontinuity) plus an effect size with interval' : c.type === 'comparative' ? 'both quantities with uncertainty and the comparison test' : 'the measurement procedure and its reliability'}`).join('\n\n') : '_No strongly checkable claims detected — the text may be descriptive or too hedged to evaluate._'}

### Extracted entities
${Object.keys(byType).length ? table(['Type', 'Values'], Object.entries(byType).map(([t, v]) => [t, v.slice(0, 6).map((x) => `\`${x}\``).join(', ')])) : '_none_'}

### Evidence ledger template
${table(['#', 'Claim', 'Source', 'Design', 'Strength'], cl.slice(0, 5).map((c, i) => [i + 1, c.claim.slice(0, 50) + '…', '_fill_', '_fill_', '_fill_']))}`,
        data: { claims: cl, entities: ents },
      };
    },
  },

  {
    id: 'text.fallacies',
    name: 'Fallacy & Rhetoric Detector',
    category: 'text',
    summary: 'Flags fallacy patterns, hedging/boosting balance and overclaiming risk.',
    tags: ['fallacy', 'rhetoric', 'logic', 'bias', 'overclaim'],
    params: [{ name: 'text', type: 'string', required: true, description: 'argument text' }],
    match: (m) => (/\b(fallac|logical error|rhetoric|overclaim|is this argument)\b/i.test(m) ? 3 : 0),
    run: ({ text }) => {
      const f = fallacies(text);
      const st = stance(text);
      return {
        markdown: `## Argument audit

### Detected patterns (${f.length})
${f.length ? f.map((h) => `- **${h.id}** — ${h.note}\n  > "${h.sentence}"`).join('\n') : '_No fallacy patterns matched. Note: pattern matching detects form, not soundness — a valid-looking argument can still rest on a false premise._'}

### Epistemic posture
${table(['Metric', 'Value'], [
  ['Polarity', `${fmt(st.polarity, 3)} (${st.label})`],
  ['Hedge density', `${(st.hedgeDensity * 100).toFixed(2)}%`],
  ['Booster density', `${(st.boosterDensity * 100).toFixed(2)}%`],
  ['Certainty index', fmt(st.certaintyIndex, 3)],
  ['Style', st.epistemicStyle],
])}

${st.found.boosters.length ? `**Booster words used:** ${[...new Set(st.found.boosters)].map((w) => `\`${w}\``).join(' ')} — each one is a promise the evidence must keep.` : ''}
${st.found.hedges.length ? `\n**Hedges used:** ${[...new Set(st.found.hedges)].map((w) => `\`${w}\``).join(' ')} — appropriate hedging is a virtue, not weakness.` : ''}`,
        data: { fallacies: f, stance: st },
      };
    },
  },

  {
    id: 'lit.cite',
    name: 'Citation Formatter',
    category: 'literature',
    summary: 'Formats a reference into APA 7, MLA 9, Chicago, IEEE, Vancouver and BibTeX.',
    tags: ['citation', 'cite', 'apa', 'mla', 'bibtex', 'reference', 'bibliography'],
    params: [
      { name: 'reference', type: 'string', required: true, description: 'raw reference text' },
      { name: 'type', type: 'string', default: 'article', description: 'article | book | conference | preprint' },
    ],
    match: (m) => (/\b(cite|citation|apa|mla|bibtex|reference (format|style)|bibliograph)\b/i.test(m) ? 3 : 0),
    run: ({ reference, type = 'article' }) => {
      const r = parseRef(reference);
      const surnames = r.authors.map((a) => a.split(/[\s,]+/)[0]);
      const apaAuthors = r.authors.map((a) => {
        const parts = a.split(/[\s,]+/).filter(Boolean);
        return parts.length > 1 ? `${parts[0]}, ${parts.slice(1).map((p) => `${p[0]}.`).join(' ')}` : parts[0];
      }).join(', ');
      const key = `${(surnames[0] || 'anon').toLowerCase()}${r.year}${(r.title.split(/\s+/)[0] || '').toLowerCase().replace(/\W/g, '')}`;
      const bib = `@${type}{${key},
  author  = {${r.authors.join(' and ')}},
  title   = {${r.title}},
  ${type === 'book' ? 'publisher' : 'journal'} = {${r.journal || 'TODO'}},
  year    = {${r.year}},${r.volume ? `\n  volume  = {${r.volume}},` : ''}${r.pages ? `\n  pages   = {${r.pages}},` : ''}${r.doi ? `\n  doi     = {${r.doi}},` : ''}${r.url ? `\n  url     = {${r.url}},` : ''}
}`;
      return {
        markdown: `## Formatted citations

**APA 7**
> ${apaAuthors} (${r.year}). ${r.title}. *${r.journal}*${r.volume ? `, ${r.volume}` : ''}${r.pages ? `, ${r.pages}` : ''}.${r.doi ? ` https://doi.org/${r.doi}` : ''}

**MLA 9**
> ${r.authors[0] || 'Author'}${r.authors.length > 1 ? ', et al' : ''}. "${r.title}." *${r.journal}*${r.volume ? `, vol. ${r.volume}` : ''}, ${r.year}${r.pages ? `, pp. ${r.pages}` : ''}.

**Chicago (author–date)**
> ${apaAuthors}. ${r.year}. "${r.title}." *${r.journal}*${r.volume ? ` ${r.volume}` : ''}${r.pages ? `: ${r.pages}` : ''}.

**IEEE**
> ${r.authors.map((a) => { const p = a.split(/[\s,]+/); return p.length > 1 ? `${p.slice(1).map((x) => `${x[0]}.`).join(' ')} ${p[0]}` : a; }).join(', ')}, "${r.title}," *${r.journal}*${r.volume ? `, vol. ${r.volume}` : ''}${r.pages ? `, pp. ${r.pages}` : ''}, ${r.year}.

**Vancouver**
> ${surnames.map((s, i) => `${s} ${(r.authors[i].split(/[\s,]+/)[1] || '')[0] || ''}`).join(', ')}. ${r.title}. ${r.journal}. ${r.year}${r.volume ? `;${r.volume}` : ''}${r.pages ? `:${r.pages}` : ''}.

**In-text:** (${surnames[0] || 'Author'}${surnames.length > 2 ? ' et al.' : surnames[1] ? ` & ${surnames[1]}` : ''}, ${r.year})

**BibTeX**
\`\`\`bibtex
${bib}
\`\`\`

${!r.doi ? '> ⚠️ No DOI detected. Add one — a citation without a persistent identifier will rot.' : `> DOI resolves to https://doi.org/${r.doi}`}`,
        data: r,
      };
    },
  },

  {
    id: 'lit.screen',
    name: 'Literature Screening Matrix',
    category: 'literature',
    summary: 'Builds PICO criteria, a boolean search string and a screening decision matrix.',
    tags: ['screening', 'pico', 'search string', 'inclusion', 'systematic review'],
    params: [
      { name: 'question', type: 'string', required: true, description: 'review question' },
      { name: 'databases', type: 'string', default: 'PubMed, Scopus, Web of Science, PsycINFO', description: 'databases' },
    ],
    match: (m) => (/\b(search string|boolean|pico|screening|inclusion criteria|literature search)\b/i.test(m) ? 3 : 0),
    run: ({ question, databases = 'PubMed, Scopus, Web of Science, PsycINFO' }) => {
      const kws = rake(question, 6).map((k) => k.phrase);
      const core = kws.slice(0, 3);
      const expand = (t) => `("${t}" OR "${t.replace(/s$/, '')}*" OR "${t.split(' ').reverse().join(' ')}")`;
      const query = core.map(expand).join(' AND ');
      return {
        markdown: `## Screening protocol

**Question:** ${question}

### PICO frame
${table(['Element', 'Specification'], [
  ['**P**opulation', core[0] || '_define_'],
  ['**I**ntervention / exposure', core[1] || '_define_'],
  ['**C**omparator', '_state the counterfactual explicitly — "no treatment" is not specific enough_'],
  ['**O**utcome', core[2] || '_define with instrument and timing_'],
  ['**S**tudy designs', 'RCTs, quasi-experiments, prospective cohorts (state the hierarchy)'],
])}

### Boolean search string
\`\`\`
${query || '"term A" AND "term B"'}
\`\`\`
Run in: ${databases}. Record the exact date, the number of hits per database, and any filters applied. Export the RIS files — screenshots are not a record.

### Eligibility criteria
| | Include | Exclude |
| --- | --- | --- |
| Population | matches P above | different population or age band |
| Design | comparative with a control | case reports, editorials, narrative reviews |
| Outcome | reports the primary outcome quantitatively | outcome only qualitative or unmeasured |
| Language | any, with translation logged | none |
| Date | justified window | pre-instrument-validation era |

### Screening matrix (fill per record)
${table(['ID', 'Title', 'T/A decision', 'Reviewer 1', 'Reviewer 2', 'Conflict?', 'Full-text decision', 'Exclusion reason'], [['1', '…', '', '', '', '', '', '']])}

### Reporting
Report κ or percentage agreement at title/abstract stage, the number of conflicts and how they were resolved, and produce the PRISMA flow diagram from these counts.`,
        data: { query, keywords: kws },
      };
    },
  },

  {
    id: 'lit.synthesis',
    name: 'Evidence Synthesis Table',
    category: 'literature',
    summary: 'Turns notes about several studies into a comparison matrix and a synthesis narrative.',
    tags: ['synthesis', 'evidence table', 'compare studies', 'review'],
    params: [{ name: 'text', type: 'string', required: true, description: 'notes; one study per line' }],
    match: (m) => (/\b(synthesi[sz]|evidence table|compare (the )?studies|across studies)\b/i.test(m) ? 2.5 : 0),
    run: ({ text }) => {
      const lines = String(text).split('\n').map((l) => l.trim()).filter((l) => l.length > 8);
      const rows = lines.map((l, i) => {
        const ents = entities(l);
        const n = ents.find((e) => e.type === 'sample-size')?.value || '—';
        const year = ents.find((e) => e.type === 'year')?.value || '—';
        const stat = ents.filter((e) => e.type === 'statistic' || e.type === 'percentage').map((e) => e.value).slice(0, 2).join(', ') || '—';
        const design = /random|rct|trial/i.test(l) ? 'RCT' : /cohort|longitudinal/i.test(l) ? 'Cohort' : /cross.?section|survey/i.test(l) ? 'Cross-sectional' : /case/i.test(l) ? 'Case-control' : /meta|review/i.test(l) ? 'Synthesis' : 'Unclear';
        const st = stance(l);
        return [`S${i + 1}`, year, design, n, stat, st.label, l.slice(0, 60) + (l.length > 60 ? '…' : '')];
      });
      const designs = rows.reduce((acc, r) => { acc[r[2]] = (acc[r[2]] || 0) + 1; return acc; }, {});
      const dirs = rows.reduce((acc, r) => { acc[r[5]] = (acc[r[5]] || 0) + 1; return acc; }, {});
      return {
        markdown: `## Evidence synthesis (${rows.length} studies)

${table(['ID', 'Year', 'Design', 'N', 'Statistics', 'Direction', 'Note'], rows)}

### Design distribution
${Object.entries(designs).map(([d, c]) => `- ${d}: ${c} (${((c / rows.length) * 100).toFixed(0)}%)`).join('\n')}

### Convergence
${Object.entries(dirs).map(([d, c]) => `- ${d}: ${c}`).join('\n')}

**Synthesis narrative.** The evidence base is ${designs.RCT >= rows.length / 2 ? 'dominated by randomised designs, so internal validity is comparatively strong' : 'predominantly observational, so every pooled estimate inherits the identification assumptions of its weakest component'}. ${Object.keys(dirs).length > 1 ? 'Directions of effect are not unanimous — treat heterogeneity as a finding to explain (moderators, populations, instruments), not as noise to average away.' : 'Directions agree across studies, which raises confidence, though shared method bias can produce agreement without truth.'} Before pooling, check that the studies estimate the *same* estimand; if they do not, synthesise narratively and say so.

### Next steps
1. Extract effect sizes on a common scale with variances; if a study omits them, request the data.
2. Assess risk of bias per study (RoB 2 / ROBINS-I) and run a sensitivity analysis excluding high-risk studies.
3. Compute τ² and I²; report a prediction interval alongside the pooled mean.`,
        data: { rows, designs, directions: dirs },
      };
    },
  },
];
