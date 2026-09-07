#!/usr/bin/env node
/**
 * build-index.js — precomputes the retrieval index (dense vectors + BM25 stats)
 * so the server boots instantly instead of embedding 50+ passages on start-up.
 */
import fs from 'node:fs';
import path from 'node:path';
import { deserialize } from '../packages/neurojs/src/gpt.js';
import { BPETokenizer } from '../packages/neurojs/src/bpe.js';
import { KNOWLEDGE } from '../packages/corpus/src/knowledge.js';

const MODEL_DIR = path.resolve('data/models');
const ckpt = path.join(MODEL_DIR, 'atlas.bin');
const tokPath = path.join(MODEL_DIR, 'tokenizer.json');

if (!fs.existsSync(ckpt) || !fs.existsSync(tokPath)) {
  console.error('no checkpoint — run: npm run train');
  process.exit(1);
}

const t0 = Date.now();
const { model, header } = deserialize(fs.readFileSync(ckpt));
const tokenizer = BPETokenizer.fromJSON(JSON.parse(fs.readFileSync(tokPath, 'utf8')));

const chunks = [];
for (const entry of KNOWLEDGE) {
  const sents = entry.text.split(/(?<=\.)\s+/);
  let i = 0;
  let n = 0;
  while (i < sents.length) {
    const text = sents.slice(i, i + 3).join(' ');
    if (text.trim().length > 40) {
      chunks.push({ id: `${entry.id}#${n++}`, parent: entry.id, title: entry.title, field: entry.field, tags: entry.tags, text });
    }
    i += 3;
  }
  if (!n) chunks.push({ id: `${entry.id}#0`, parent: entry.id, title: entry.title, field: entry.field, tags: entry.tags, text: entry.text });
}

const vectors = [];
for (const c of chunks) {
  const v = model.embed(tokenizer.encode(`${c.title}. ${c.text}`.slice(0, 1200)));
  vectors.push(Buffer.from(v.buffer, v.byteOffset, v.length * 4).toString('base64'));
  process.stdout.write(`\r  embedding ${vectors.length}/${chunks.length}`);
}
process.stdout.write('\n');

const payload = {
  version: 1,
  builtAt: new Date().toISOString(),
  checkpointMtime: fs.statSync(ckpt).mtimeMs,
  params: model.numParams(),
  dim: model.cfg.nEmbd,
  trainedAt: header.meta?.trainedAt || null,
  chunks: chunks.map((c, i) => ({ ...c, vector: vectors[i] })),
};
const out = path.join(MODEL_DIR, 'retrieval-index.json');
fs.writeFileSync(out, JSON.stringify(payload));
console.log(`indexed ${chunks.length} passages (${model.cfg.nEmbd}-d) in ${Date.now() - t0}ms -> ${out}`);
