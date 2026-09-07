#!/usr/bin/env node
/** Build and persist the ATLAS training corpus. */
import fs from 'node:fs';
import path from 'node:path';
import { buildCorpus } from '../packages/corpus/src/generator.js';

const outDir = path.resolve('data/corpus');
fs.mkdirSync(outDir, { recursive: true });
const target = Number(process.env.CORPUS_CHARS || 1_400_000);
const t0 = Date.now();
const { text, stats } = buildCorpus({ targetChars: target, seed: 20260907 });
fs.writeFileSync(path.join(outDir, 'atlas-corpus.txt'), text);
fs.writeFileSync(path.join(outDir, 'corpus-stats.json'), JSON.stringify({ ...stats, ms: Date.now() - t0 }, null, 2));
console.log('corpus ->', stats, `${Date.now() - t0}ms`);
