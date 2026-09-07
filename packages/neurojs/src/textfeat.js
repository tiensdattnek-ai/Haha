/**
 * textfeat.js — hashing featuriser shared by the intent router.
 * Word unigrams + bigrams + char 4-grams hashed into a fixed vector.
 */

const HASH_DIM = 1024;

function fnv(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

export function featurize(text, dim = HASH_DIM) {
  const v = new Float32Array(dim);
  const clean = String(text).toLowerCase().replace(/[^a-z0-9\s.=<>+\-*/^%]/g, ' ');
  const toks = clean.split(/\s+/).filter(Boolean);
  const add = (key, w = 1) => { v[fnv(key) % dim] += w; };
  for (let i = 0; i < toks.length; i++) {
    add(`u:${toks[i]}`, 1);
    if (i + 1 < toks.length) add(`b:${toks[i]}_${toks[i + 1]}`, 0.7);
    const t = toks[i];
    for (let c = 0; c + 4 <= t.length; c++) add(`c:${t.slice(c, c + 4)}`, 0.35);
  }
  if (/\d/.test(clean)) add('meta:hasnumber', 1.5);
  if (/[=<>]/.test(clean)) add('meta:hasoperator', 1.2);
  if (/\?/.test(String(text))) add('meta:question', 1.0);
  add(`meta:len${Math.min(9, Math.floor(toks.length / 6))}`, 0.8);
  let n = 0;
  for (let i = 0; i < dim; i++) n += v[i] * v[i];
  n = Math.sqrt(n) || 1;
  for (let i = 0; i < dim; i++) v[i] /= n;
  return v;
}

export const FEATURE_DIM = HASH_DIM;
