/**
 * bpe.js — byte-level Byte Pair Encoding, trained from scratch.
 *
 * Pipeline: text -> regex pre-tokenisation -> UTF-8 bytes -> learned merges.
 * Special tokens live at the top of the vocabulary so chat structure is a
 * first-class citizen of the model, not a string hack.
 */

export const SPECIALS = ['<pad>', '<bos>', '<eos>', '<user>', '<atlas>', '<sys>', '<sep>', '<unk>'];

const PRETOK = /\p{L}+|\p{N}|[^\s\p{L}\p{N}]+|\s+/gu;

function pretokenize(text) {
  return text.match(PRETOK) || [];
}

function bytesOf(str) {
  return Array.from(Buffer.from(str, 'utf8'));
}

export class BPETokenizer {
  constructor() {
    this.merges = [];            // [[a,b] -> id]
    this.mergeRank = new Map();  // "a,b" -> rank
    this.vocab = [];             // id -> Uint8Array | special string
    this.specialIds = new Map();
    this.cache = new Map();
  }

  get size() {
    return this.vocab.length;
  }

  /** Train merges on a corpus string. */
  train(text, vocabSize = 1024, { verbose = false, log = console.log } = {}) {
    // base vocab: specials + 256 bytes
    this.vocab = [];
    this.specialIds = new Map();
    for (const s of SPECIALS) {
      this.specialIds.set(s, this.vocab.length);
      this.vocab.push({ special: s });
    }
    for (let b = 0; b < 256; b++) this.vocab.push({ bytes: Uint8Array.of(b) });

    // word frequency table over pre-tokens
    const freq = new Map();
    for (const w of pretokenize(text)) freq.set(w, (freq.get(w) || 0) + 1);

    const words = [];
    const counts = [];
    const base = SPECIALS.length;
    for (const [w, c] of freq) {
      words.push(bytesOf(w).map((b) => b + base));
      counts.push(c);
    }

    this.merges = [];
    this.mergeRank = new Map();
    while (this.vocab.length < vocabSize) {
      const pairs = new Map();
      for (let i = 0; i < words.length; i++) {
        const seq = words[i];
        const c = counts[i];
        for (let j = 0; j + 1 < seq.length; j++) {
          const key = seq[j] * 1e6 + seq[j + 1];
          pairs.set(key, (pairs.get(key) || 0) + c);
        }
      }
      if (pairs.size === 0) break;
      let bestKey = -1;
      let bestCount = 0;
      for (const [k, v] of pairs) {
        if (v > bestCount) {
          bestCount = v;
          bestKey = k;
        }
      }
      if (bestCount < 2) break;
      const a = Math.floor(bestKey / 1e6);
      const b = bestKey % 1e6;
      const newId = this.vocab.length;
      const bytes = new Uint8Array([...this.tokenBytes(a), ...this.tokenBytes(b)]);
      this.vocab.push({ bytes });
      this.mergeRank.set(`${a},${b}`, this.merges.length);
      this.merges.push([a, b, newId]);
      // apply merge
      for (let i = 0; i < words.length; i++) {
        const seq = words[i];
        if (seq.length < 2) continue;
        const out = [];
        for (let j = 0; j < seq.length; j++) {
          if (j + 1 < seq.length && seq[j] === a && seq[j + 1] === b) {
            out.push(newId);
            j++;
          } else out.push(seq[j]);
        }
        words[i] = out;
      }
      if (verbose && this.vocab.length % 128 === 0) {
        log(`  bpe vocab=${this.vocab.length} lastMerge="${this.decode([newId]).replace(/\n/g, '\\n')}" freq=${bestCount}`);
      }
    }
    this.cache.clear();
    return this;
  }

  tokenBytes(id) {
    const v = this.vocab[id];
    if (!v) return [];
    if (v.special) return bytesOf(v.special);
    return Array.from(v.bytes);
  }

  _encodeWord(word) {
    const cached = this.cache.get(word);
    if (cached) return cached;
    const base = SPECIALS.length;
    let seq = bytesOf(word).map((b) => b + base);
    while (seq.length > 1) {
      let bestRank = Infinity;
      let bestIdx = -1;
      for (let i = 0; i + 1 < seq.length; i++) {
        const r = this.mergeRank.get(`${seq[i]},${seq[i + 1]}`);
        if (r !== undefined && r < bestRank) {
          bestRank = r;
          bestIdx = i;
        }
      }
      if (bestIdx < 0) break;
      const merged = this.merges[bestRank][2];
      seq = [...seq.slice(0, bestIdx), merged, ...seq.slice(bestIdx + 2)];
    }
    if (this.cache.size < 50000) this.cache.set(word, seq);
    return seq;
  }

  /** Encode text; handles <specials> inline. */
  encode(text, { bos = false, eos = false } = {}) {
    const out = [];
    if (bos) out.push(this.specialIds.get('<bos>'));
    const parts = String(text).split(/(<pad>|<bos>|<eos>|<user>|<atlas>|<sys>|<sep>|<unk>)/g);
    for (const part of parts) {
      if (!part) continue;
      if (this.specialIds.has(part)) {
        out.push(this.specialIds.get(part));
        continue;
      }
      for (const w of pretokenize(part)) out.push(...this._encodeWord(w));
    }
    if (eos) out.push(this.specialIds.get('<eos>'));
    return out;
  }

  decode(ids, { skipSpecial = false } = {}) {
    const bytes = [];
    for (const id of ids) {
      const v = this.vocab[id];
      if (!v) continue;
      if (v.special) {
        if (!skipSpecial) bytes.push(...bytesOf(v.special));
        continue;
      }
      bytes.push(...v.bytes);
    }
    return Buffer.from(Uint8Array.from(bytes)).toString('utf8');
  }

  /** Pretty piece for UI token inspectors. */
  piece(id) {
    const v = this.vocab[id];
    if (!v) return '?';
    if (v.special) return v.special;
    return Buffer.from(v.bytes).toString('utf8');
  }

  toJSON() {
    return {
      version: 1,
      specials: SPECIALS,
      merges: this.merges,
      vocabSize: this.vocab.length,
    };
  }

  static fromJSON(json) {
    const t = new BPETokenizer();
    t.vocab = [];
    for (const s of json.specials) {
      t.specialIds.set(s, t.vocab.length);
      t.vocab.push({ special: s });
    }
    for (let b = 0; b < 256; b++) t.vocab.push({ bytes: Uint8Array.of(b) });
    t.merges = json.merges;
    t.mergeRank = new Map();
    for (let i = 0; i < json.merges.length; i++) {
      const [a, b, id] = json.merges[i];
      t.mergeRank.set(`${a},${b}`, i);
      t.vocab[id] = { bytes: new Uint8Array([...t.tokenBytes(a), ...t.tokenBytes(b)]) };
    }
    return t;
  }
}
