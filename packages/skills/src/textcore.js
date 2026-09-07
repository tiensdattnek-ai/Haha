/**
 * textcore.js — linguistic analytics: tokenisation, TF-IDF, TextRank,
 * RAKE keywords, readability indices, string metrics, lexicon sentiment,
 * hedging/claim detection and fallacy heuristics. Zero dependencies.
 */

export const STOPWORDS = new Set(`a about above after again against all am an and any are aren't as at be because been
before being below between both but by can't cannot could couldn't did didn't do does doesn't doing don't down during
each few for from further had hadn't has hasn't have haven't having he he'd he'll he's her here here's hers herself him
himself his how how's i i'd i'll i'm i've if in into is isn't it it's its itself let's me more most mustn't my myself no
nor not of off on once only or other ought our ours ourselves out over own same shan't she she'd she'll she's should
shouldn't so some such than that that's the their theirs them themselves then there there's these they they'd they'll
they're they've this those through to too under until up very was wasn't we we'd we'll we're we've were weren't what
what's when when's where where's which while who who's whom why why's with won't would wouldn't you you'd you'll you're
you've your yours yourself yourselves also may might must shall will can upon thus however therefore whereas within
across among since given via etc based used using`.split(/\s+/));

export function words(text) {
  return (String(text).toLowerCase().match(/[a-zà-ÿ']+/gi) || []).map((w) => w.replace(/^'+|'+$/g, '')).filter(Boolean);
}

export function sentences(text) {
  return String(text)
    .replace(/\s+/g, ' ')
    .split(/(?<=[.!?])\s+(?=[A-Z(“"']|\d)/)
    .map((s) => s.trim())
    .filter((s) => s.length > 1);
}

export function syllables(word) {
  const w = word.toLowerCase().replace(/[^a-z]/g, '');
  if (w.length <= 3) return 1;
  const cleaned = w.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, '').replace(/^y/, '');
  const m = cleaned.match(/[aeiouy]{1,2}/g);
  return Math.max(1, m ? m.length : 1);
}

export function readability(text) {
  const ws = words(text);
  const ss = sentences(text);
  const nW = ws.length || 1;
  const nS = ss.length || 1;
  const syl = ws.reduce((a, w) => a + syllables(w), 0);
  const complex = ws.filter((w) => syllables(w) >= 3).length;
  const chars = ws.join('').length;
  const asl = nW / nS;
  const asw = syl / nW;
  const flesch = 206.835 - 1.015 * asl - 84.6 * asw;
  const fk = 0.39 * asl + 11.8 * asw - 15.59;
  const fog = 0.4 * (asl + 100 * (complex / nW));
  const smog = 1.0430 * Math.sqrt(complex * (30 / nS)) + 3.1291;
  const cli = 0.0588 * (100 * (chars / nW)) - 0.296 * (100 * (nS / nW)) - 15.8;
  const ari = 4.71 * (chars / nW) + 0.5 * asl - 21.43;
  const band = flesch >= 70 ? 'accessible' : flesch >= 50 ? 'undergraduate' : flesch >= 30 ? 'graduate' : 'dense academic';
  return {
    words: nW, sentences: nS, syllables: syl, complexWords: complex,
    avgSentenceLength: asl, avgSyllablesPerWord: asw,
    fleschReadingEase: flesch, fleschKincaidGrade: fk, gunningFog: fog,
    smogIndex: smog, colemanLiau: cli, automatedReadability: ari,
    consensusGrade: (fk + fog + smog + cli + ari) / 5,
    band,
  };
}

export function textStats(text) {
  const ws = words(text);
  const types = new Set(ws);
  const freq = new Map();
  for (const w of ws) freq.set(w, (freq.get(w) || 0) + 1);
  const content = ws.filter((w) => !STOPWORDS.has(w));
  const sorted = [...freq.entries()].sort((a, b) => b[1] - a[1]);
  const hapax = sorted.filter(([, c]) => c === 1).length;
  let entropy = 0;
  for (const [, c] of freq) {
    const p = c / ws.length;
    entropy -= p * Math.log2(p);
  }
  return {
    characters: text.length,
    words: ws.length,
    types: types.size,
    typeTokenRatio: types.size / Math.max(1, ws.length),
    rootTTR: types.size / Math.sqrt(Math.max(1, ws.length)),
    hapaxLegomena: hapax,
    contentWordRatio: content.length / Math.max(1, ws.length),
    sentences: sentences(text).length,
    paragraphs: text.split(/\n{2,}/).filter((p) => p.trim()).length,
    entropyBitsPerWord: entropy,
    topWords: sorted.filter(([w]) => !STOPWORDS.has(w)).slice(0, 20).map(([w, c]) => ({ word: w, count: c })),
    zipfFit: sorted.slice(0, 30).map(([w, c], i) => ({ rank: i + 1, word: w, count: c })),
  };
}

export function tfidf(docs) {
  const tokenised = docs.map((d) => words(d).filter((w) => !STOPWORDS.has(w) && w.length > 2));
  const df = new Map();
  for (const doc of tokenised) for (const w of new Set(doc)) df.set(w, (df.get(w) || 0) + 1);
  const N = docs.length;
  return tokenised.map((doc) => {
    const tf = new Map();
    for (const w of doc) tf.set(w, (tf.get(w) || 0) + 1);
    const vec = new Map();
    for (const [w, c] of tf) {
      vec.set(w, (c / doc.length) * Math.log((N + 1) / ((df.get(w) || 0) + 1)) + 1e-9);
    }
    return vec;
  });
}

export function cosineMaps(a, b) {
  let dot = 0, na = 0, nb = 0;
  for (const [k, v] of a) {
    na += v * v;
    if (b.has(k)) dot += v * b.get(k);
  }
  for (const v of b.values()) nb += v * v;
  return dot / (Math.sqrt(na) * Math.sqrt(nb) || 1);
}

/** Extractive summarisation with a TextRank-style power iteration. */
export function textRank(text, { maxSentences = 5, damping = 0.85, iterations = 60 } = {}) {
  const ss = sentences(text);
  if (ss.length <= maxSentences) {
    return {
      summary: ss,
      scores: ss.map((s, i) => ({ sentence: s, index: i, score: 1 })),
      sentences: ss.length,
      compression: 1,
    };
  }
  const vecs = tfidf(ss);
  const n = ss.length;
  const sim = Array.from({ length: n }, () => new Array(n).fill(0));
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const s = cosineMaps(vecs[i], vecs[j]);
      sim[i][j] = s;
      sim[j][i] = s;
    }
  }
  let rank = new Array(n).fill(1 / n);
  for (let it = 0; it < iterations; it++) {
    const next = new Array(n).fill((1 - damping) / n);
    for (let i = 0; i < n; i++) {
      const out = sim[i].reduce((a, b) => a + b, 0) || 1;
      for (let j = 0; j < n; j++) if (i !== j) next[j] += damping * rank[i] * (sim[i][j] / out);
    }
    rank = next;
  }
  // positional prior: openings and closings matter in academic prose
  const scored = ss.map((s, i) => ({
    sentence: s,
    index: i,
    score: rank[i] * (1 + (i === 0 ? 0.25 : 0) + (i === n - 1 ? 0.1 : 0)),
  }));
  const chosen = scored.slice().sort((a, b) => b.score - a.score).slice(0, maxSentences).sort((a, b) => a.index - b.index);
  return { summary: chosen.map((c) => c.sentence), scores: scored, sentences: n, compression: chosen.length / n };
}

/** RAKE — Rapid Automatic Keyword Extraction. */
export function rake(text, topN = 12) {
  const chunks = String(text).toLowerCase().split(/[^a-zà-ÿ0-9'\-]+/i);
  const phrases = [];
  let cur = [];
  for (const w of chunks) {
    if (!w) continue;
    if (STOPWORDS.has(w) || w.length < 2) {
      if (cur.length) phrases.push(cur);
      cur = [];
    } else cur.push(w);
  }
  if (cur.length) phrases.push(cur);
  const freq = new Map();
  const degree = new Map();
  for (const p of phrases) {
    for (const w of p) {
      freq.set(w, (freq.get(w) || 0) + 1);
      degree.set(w, (degree.get(w) || 0) + p.length - 1);
    }
  }
  const scoreWord = (w) => ((degree.get(w) || 0) + (freq.get(w) || 0)) / (freq.get(w) || 1);
  const seen = new Map();
  for (const p of phrases) {
    const key = p.join(' ');
    const s = p.reduce((a, w) => a + scoreWord(w), 0);
    seen.set(key, Math.max(seen.get(key) || 0, s));
  }
  return [...seen.entries()]
    .map(([phrase, score]) => ({ phrase, score, words: phrase.split(' ').length }))
    .sort((a, b) => b.score - a.score)
    .slice(0, topN);
}

export function levenshtein(a, b) {
  const m = a.length, n = b.length;
  if (!m) return n;
  if (!n) return m;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[n];
}

export function jaccard(a, b) {
  const A = new Set(words(a));
  const B = new Set(words(b));
  const inter = [...A].filter((x) => B.has(x)).length;
  return inter / (A.size + B.size - inter || 1);
}

const POSITIVE = new Set(`robust significant strong consistent reliable novel promising effective improved superior
accurate valid replicated confirmed supported clear compelling rigorous efficient beneficial advance breakthrough
converging successful precise transparent reproducible`.split(/\s+/));
const NEGATIVE = new Set(`weak fragile inconsistent unreliable flawed biased confounded questionable failed refuted
contradicted underpowered spurious misleading limited problematic retracted inconclusive artefactual noisy overfit
irreproducible contested doubtful`.split(/\s+/));
const HEDGES = new Set(`may might could possibly perhaps suggest suggests suggested appear appears seem seems likely
unlikely presumably tentatively arguably potentially assume assumed approximately roughly somewhat generally`.split(/\s+/));
const BOOSTERS = new Set(`clearly obviously certainly definitely undoubtedly always never proves proven demonstrates
establishes confirms conclusive unequivocal must all none every`.split(/\s+/));

export function stance(text) {
  const ws = words(text);
  let pos = 0, neg = 0, hedge = 0, boost = 0;
  const found = { positive: [], negative: [], hedges: [], boosters: [] };
  for (const w of ws) {
    if (POSITIVE.has(w)) { pos++; found.positive.push(w); }
    if (NEGATIVE.has(w)) { neg++; found.negative.push(w); }
    if (HEDGES.has(w)) { hedge++; found.hedges.push(w); }
    if (BOOSTERS.has(w)) { boost++; found.boosters.push(w); }
  }
  const n = ws.length || 1;
  const polarity = (pos - neg) / Math.max(1, pos + neg);
  return {
    polarity,
    label: polarity > 0.25 ? 'affirmative' : polarity < -0.25 ? 'critical' : 'neutral',
    positiveRate: pos / n, negativeRate: neg / n,
    hedgeDensity: hedge / n, boosterDensity: boost / n,
    certaintyIndex: (boost - hedge) / Math.max(1, boost + hedge),
    epistemicStyle: hedge > boost ? 'cautious / appropriately hedged' : boost > hedge ? 'assertive — check for overclaiming' : 'balanced',
    found,
  };
}

const FALLACY_PATTERNS = [
  { id: 'appeal-to-authority', re: /\b(according to|as .{0,20}(professor|expert|nobel)|renowned)\b/i, note: 'Authority is evidence about credibility, not about the claim.' },
  { id: 'hasty-generalisation', re: /\b(all|every|none|never|always)\b/i, note: 'Universal quantifier — check whether the sample supports it.' },
  { id: 'post-hoc', re: /\b(after|following|since)\b[^.]{0,60}\b(caused|led to|resulted in|because of)\b/i, note: 'Temporal order is not causal identification.' },
  { id: 'false-dichotomy', re: /\b(either|only two|must choose between)\b/i, note: 'Check for excluded middle options.' },
  { id: 'straw-man', re: /\b(critics claim|opponents argue|they would have us believe)\b/i, note: 'Steelman the opposing position before rebutting it.' },
  { id: 'appeal-to-nature', re: /\b(natural(ly)? (better|superior)|unnatural)\b/i, note: 'Naturalness does not entail value.' },
  { id: 'correlation-causation', re: /\b(correlat\w+)\b[^.]{0,50}\b(so|therefore|thus|means)\b/i, note: 'Association requires an identification strategy to become causal.' },
  { id: 'p-hacking-signal', re: /\b(marginally significant|approaching significance|trend toward significance)\b/i, note: 'Significance is not a gradient; report the estimate and interval.' },
  { id: 'circular', re: /\b(because it is|by definition)\b[^.]{0,40}\b(true|works|correct)\b/i, note: 'Conclusion appears among the premises.' },
  { id: 'anecdote', re: /\b(in my experience|i have seen|one patient|a colleague told)\b/i, note: 'Anecdote sets priors; it does not test them.' },
  { id: 'moving-goalposts', re: /\b(but that('s| is) not (really|the) (same|point))\b/i, note: 'Criteria changed after evidence was presented.' },
  { id: 'bandwagon', re: /\b(everyone (knows|agrees)|widely accepted|consensus shows)\b/i, note: 'Consensus summarises evidence; it does not replace it.' },
];

export function fallacies(text) {
  const ss = sentences(text);
  const hits = [];
  for (const s of ss) {
    for (const f of FALLACY_PATTERNS) {
      if (f.re.test(s)) hits.push({ id: f.id, note: f.note, sentence: s.slice(0, 220) });
    }
  }
  return hits;
}

/** Claim mining: sentences that assert something checkable. */
export function claims(text) {
  const ss = sentences(text);
  const out = [];
  for (const s of ss) {
    const hasNumber = /\d/.test(s);
    const causal = /\b(cause[sd]?|lead[s]? to|results? in|increase[sd]?|decrease[sd]?|reduce[sd]?|improve[sd]?|predict[s]?)\b/i.test(s);
    const compare = /\b(more|less|greater|higher|lower|better|worse|than)\b/i.test(s);
    const hedged = /\b(may|might|could|suggests?|appears?|seems?|likely)\b/i.test(s);
    const score = (hasNumber ? 0.35 : 0) + (causal ? 0.4 : 0) + (compare ? 0.25 : 0) - (hedged ? 0.15 : 0);
    if (score > 0.3) {
      out.push({
        claim: s.trim(),
        checkability: Math.min(1, score),
        type: causal ? 'causal' : compare ? 'comparative' : 'descriptive',
        hedged,
        quantitative: hasNumber,
      });
    }
  }
  return out.sort((a, b) => b.checkability - a.checkability);
}

const ENTITY_RULES = [
  { type: 'doi', re: /\b10\.\d{4,9}\/[-._;()/:A-Z0-9]+\b/gi },
  { type: 'url', re: /https?:\/\/[^\s)]+/g },
  { type: 'year', re: /\b(1[89]\d{2}|20[0-4]\d)\b/g },
  { type: 'p-value', re: /\bp\s*[<>=]\s*\.?\d+(\.\d+)?\b/gi },
  { type: 'statistic', re: /\b(?:t|F|r|z|d|χ2|R2)\s*(?:\(\d+(?:,\s*\d+)?\))?\s*=\s*-?\d+(?:\.\d+)?/g },
  { type: 'percentage', re: /\b\d+(?:\.\d+)?\s?%/g },
  { type: 'sample-size', re: /\bN\s*=\s*\d+/gi },
  { type: 'confidence-interval', re: /\b\d+%?\s?CI\s*[:=]?\s*\[?-?\d+(?:\.\d+)?[,;\s]+-?\d+(?:\.\d+)?\]?/gi },
  { type: 'citation', re: /\([A-Z][A-Za-z\-']+(?: (?:et al\.?|&|and) [A-Z][A-Za-z\-']+)*,? \d{4}[a-z]?\)/g },
  { type: 'proper-noun', re: /\b(?:[A-Z][a-z]{2,}\s){1,3}(?:University|Institute|Laboratory|Foundation|Society|Association)\b/g },
];

export function entities(text) {
  const out = [];
  for (const rule of ENTITY_RULES) {
    const matches = String(text).match(rule.re);
    if (matches) {
      for (const m of [...new Set(matches)]) out.push({ type: rule.type, value: m.trim() });
    }
  }
  return out;
}
