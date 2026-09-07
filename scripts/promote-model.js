#!/usr/bin/env node
/**
 * promote-model.js — swap a freshly trained checkpoint into the live slot.
 *
 *   node scripts/promote-model.js --from data/models_v2
 *   node scripts/promote-model.js --from data/models_v2 --watch
 *
 * With --watch it waits until the training run finishes (the checkpoint stops
 * being marked partial and stops changing), then promotes and rebuilds the
 * retrieval index. The running server hot-reloads the new weights by itself.
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const arg = (n, d) => {
  const i = process.argv.indexOf(`--${n}`);
  return i > -1 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : d;
};
const FROM = path.resolve(arg('from', 'data/models_v2'));
const TO = path.resolve(arg('to', 'data/models'));
const WATCH = process.argv.includes('--watch');
const FILES = ['atlas.bin', 'tokenizer.json', 'training-history.json', 'corpus.tokens.bin'];

function readMeta() {
  const f = path.join(FROM, 'training-history.json');
  if (!fs.existsSync(f)) return null;
  try { return JSON.parse(fs.readFileSync(f, 'utf8')).meta || null; } catch { return null; }
}

function isComplete() {
  const meta = readMeta();
  return !!meta && !meta.partial && Number.isFinite(meta.finalValLoss);
}

function promote() {
  fs.mkdirSync(TO, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backup = path.join(TO, `backup-${stamp}`);
  fs.mkdirSync(backup, { recursive: true });
  for (const f of FILES) {
    const src = path.join(FROM, f);
    const dst = path.join(TO, f);
    if (!fs.existsSync(src)) continue;
    if (fs.existsSync(dst)) fs.copyFileSync(dst, path.join(backup, f));
    fs.copyFileSync(src, dst);
  }
  // the retrieval index is keyed to the old weights — force a rebuild
  const idx = path.join(TO, 'retrieval-index.json');
  if (fs.existsSync(idx)) fs.rmSync(idx);
  const meta = readMeta();
  console.log(`promoted ${FROM} -> ${TO}`);
  if (meta) {
    console.log(`  params ${meta.params?.toLocaleString?.() ?? '—'} · val loss ${meta.finalValLoss?.toFixed?.(4)} · ppl ${meta.perplexity?.toFixed?.(2)} · ${meta.steps} steps`);
  }
  console.log(`  previous checkpoint saved in ${backup}`);
  try {
    execFileSync(process.execPath, [path.resolve('scripts/build-index.js')], { stdio: 'inherit' });
  } catch (e) {
    console.warn('  index rebuild failed — the server will rebuild it on next load:', e.message);
  }
}

if (!WATCH) {
  if (!isComplete()) {
    console.error(`${FROM} has no finished checkpoint yet (still training or never trained).`);
    process.exit(1);
  }
  promote();
} else {
  console.log(`watching ${FROM} for a completed training run…`);
  const tick = () => {
    if (isComplete()) {
      promote();
      process.exit(0);
    }
    const meta = readMeta();
    if (meta?.partial) process.stdout.write(`\r  step ${meta.step}/${meta.steps}…    `);
    setTimeout(tick, 20_000);
  };
  tick();
}
