# ATLAS — Research Console

A deep-research AI console whose language model is **trained from scratch, in this repository, in plain
JavaScript**. No PyTorch, no TensorFlow, no ONNX, no hosted inference API, no pretrained weights. The
autodiff engine, the attention kernels, the AdamW optimiser, the byte-level BPE tokenizer, the training
loop, the sampler, the embedding-based retriever and the intent router are all source files you can read
here — and they run on the same sandbox that serves the UI.

```
corpus  ──▶  BPE tokenizer  ──▶  GPT (autodiff, pure JS)  ──▶  checkpoint
                                        │                          │
                                        ├── embeddings ──▶ hybrid RAG index
                                        ├── attention ────▶ interpretability
                                        └── sampling ─────▶ neural synthesis
                                                                   │
   61 deterministic research instruments ───────────────▶ agent orchestrator ──▶ SSE ──▶ React console
```

---

## Quick start

```bash
npm install                # workspaces: packages/*, server, web

npm run corpus             # 1.4M-character research corpus            (~0.1 s)
npm run train              # trains the transformer from scratch       (~70 min, 2 cores)
npm run train:router       # trains the neural intent router           (~15 s)
npm run index              # precomputes the retrieval index           (~5 s)

npm run dev                # API on :8787 + Vite dev server on :5173
```

Prefer a fast smoke run? `npm run train:quick` (120 steps) produces a working, if babbling, checkpoint in
a few minutes; everything downstream behaves identically.

Production:

```bash
npm run build              # bundles the SPA into web/dist
npm start                  # single process serving API + SPA on :8787
```

Tests:

```bash
npm test                   # 18 tests: gradient checks, overfit, serialisation, all 54 instruments
```

---

## What is actually trained here

| Component | Where | How it is trained |
| --- | --- | --- |
| **ATLAS-R1 language model** | `packages/neurojs`, `scripts/train.js` | 934,656-parameter decoder-only transformer (4 layers, 4 heads, d=128, ctx=96, vocab 1024). AdamW + warmup/cosine + grad clipping, 800 steps × batch 12 over 540,075 BPE tokens. **Final validation loss 0.4469 (perplexity 1.56)** in 70 min on 2 CPU cores. |
| **Byte-level BPE tokenizer** | `packages/neurojs/src/bpe.js` | Merge-frequency training on the corpus; 1024 tokens, ~2.6 chars/token, lossless round-trip. |
| **Neural intent router** | `scripts/train-router.js` | Hashed n-gram MLP (1024→192→61) trained on 7k synthesised paraphrases, ~96% held-out accuracy. |
| **Retrieval embeddings** | `scripts/build-index.js` | Position-weighted mean-pooled hidden states from the model itself — the RAG vectors are the LM's own representations. |

Everything is seeded: same seed ⇒ bit-identical weights. `npm run pipeline` rebuilds the entire chain.

### The neural core (`packages/neurojs`)

A miniature deep-learning framework, ~1,800 lines, zero dependencies:

- `tensor.js` — reverse-mode autodiff over `Float32Array`, with hand-tuned GEMM kernels (2 output rows ×
  4 reduction steps per iteration ⇒ ~2.4 GFLOP/s on one sandbox core, 2.7× the naive loop), fused causal
  self-attention, GELU, LayerNorm, cross-entropy, dropout.
- `nn.js` / `optim.js` — modules, parameter groups, AdamW with decoupled weight decay, global-norm
  clipping, warmup + cosine decay.
- `gpt.js` — the transformer, weight-tied head, checkpoint (de)serialisation with a 4-byte-aligned binary
  format, plus `embed()` and attention tracing for introspection.
- `sample.js` — temperature, top-k, nucleus, typical-p, repetition/frequency/presence penalties, stop
  strings, per-token entropy and probability traces.

Correctness is enforced by `tests/gradcheck.test.js`: a directional finite-difference gradient check
against every parameter tensor, a tiny-batch overfit test, a bit-exact checkpoint round-trip and a
tokenizer round-trip.

---

## The research engine (`packages/skills`) — 61 instruments

Deterministic, auditable, dependency-free tools. The neural model writes prose; **these produce the
numbers**, so nothing quantitative is ever hallucinated.

| Category | Instruments |
| --- | --- |
| Reasoning & planning | programme planner, hypothesis forge, methodology critic, limitations auditor, Socratic ladder, steelman/red team, divergent idea engine, multi-level explainer |
| Study design | experiment designer, reporting checklists (CONSORT/PRISMA/STROBE/ARRIVE/TRIPOD/ML), ethics & governance screen |
| Statistics | descriptives, t-tests (one/two/paired/Welch), ANOVA, correlation (Pearson/Spearman), OLS regression, chi-square, Mann–Whitney, power & sample size, Bayesian updating, multiplicity control, bootstrap & permutation, distributions, Monte-Carlo design simulation |
| Mathematics | expression compiler, equation solver, numeric calculus, linear algebra (det/inverse/solve/eigen), RK4 ODE integrator, optimiser, combinatorics, special functions |
| Text analytics | TextRank summariser, RAKE/TF-IDF keywords, six readability indices, corpus statistics, text comparison, claim mining, fallacy & rhetoric detector |
| Literature | citation formatter (APA/MLA/Chicago/IEEE/Vancouver/BibTeX), PICO screening matrix, evidence synthesis table, simulated peer review, abstract composer, outline architect |
| Data & code | dataset profiler, sandboxed JS runtime (`node:vm`), regex laboratory, network analyser, time-series diagnostics, JSON inspector |
| Neural introspection | raw completion, tokenizer explorer, attention cartographer, embedding probe, perplexity scorer, knowledge retrieval, model card |
| Utilities | randomisation & allocation, timeline calculator, unit converter |

The statistics are validated against published reference values (t/χ²/F quantiles, textbook t-tests,
noiseless OLS recovery) in `tests/skills.test.js`.

---

## The agent

`server/src/agent.js` runs a six-stage pipeline and streams every stage over SSE:

1. **Understand** — entity/number extraction, keyword mining, and intent ranking that fuses the trained
   neural router with per-skill heuristic matchers.
2. **Plan** — an explicit, displayed plan of which instruments will run and why.
3. **Retrieve** — hybrid dense (model embeddings) + BM25 retrieval over the chunked knowledge base.
4. **Execute** — instruments run with arguments inferred from natural language (`"90% power"` → `power=0.9`),
   each guarded so it never fires on input it cannot use.
5. **Synthesise** — instrument output, citations and an optional neural paragraph, streamed token-wise.
6. **Self-critique** — calibrated confidence, named weaknesses, and what would change the answer.

Slash commands bypass routing: `/stats.ttest {"a":"1 2 3","b":"4 5 6"}`, `/text.summarize <text>`,
`/help`, `/model.card`.

---

## The console (`web`)

React 18 + Vite, no component library — every pixel and every chart is hand-written.

- **Console** — streaming answers with a live reasoning trace, per-instrument visualisations, KaTeX maths,
  copy/export, and a token-level decoding view.
- **Skill Atlas** — all 61 instruments, searchable, each runnable from a generated parameter form.
- **Neural Lab** — sampling with live decoding stats, tokenizer explorer, per-head attention heat maps,
  perplexity scoring, embedding probes, and **live gradient descent**: run real AdamW steps against the
  loaded weights from the browser and watch the loss curve move.
- **Knowledge** — the curated entries, hybrid semantic search, and a window into the pretraining corpus.
- **Model** — parameter budget, loss curves, optimiser settings, throughput, and end-of-training samples.

Plus a ⌘K command palette, two themes, a right-hand inspector with full decoding controls, and an
answer-level confidence readout.

---

## Layout

```
packages/neurojs     autodiff, transformer, tokenizer, sampler, optimiser, hashing featuriser
packages/corpus      curated knowledge base + procedural corpus generator
packages/skills      61 research instruments + math/stats/text cores + registry
scripts/             build-corpus · train · train-router · build-index
server/src/          runtime (model + RAG) · agent orchestrator · Express/SSE API · sessions
web/src/             React console: views, components, charts, store, API client
tests/               gradient checks + instrument conformance + numerical ground truth
data/                corpus, checkpoints, retrieval index, sessions
```

## API

| Method | Route | Purpose |
| --- | --- | --- |
| `GET` | `/api/health` `/api/model` `/api/skills` `/api/knowledge` | status, model card, catalogue, knowledge base |
| `POST` | `/api/chat/stream` | SSE deep-research pipeline |
| `POST` | `/api/skills/:id/run` | execute one instrument |
| `POST` | `/api/retrieve` | hybrid retrieval |
| `POST` | `/api/neural/{generate,tokenize,attention,perplexity,embed}` | model introspection |
| `POST` | `/api/train/stream` | live fine-tuning with streamed loss |
| `GET/POST/PATCH/DELETE` | `/api/sessions/:id?` | persisted conversations |

## Honest limitations

A 0.93M-parameter model trained for ~70 minutes on 1.4M characters of domain text is a **language surface**, not
a knowledge base. It writes plausible methodology English and produces useful embeddings; it does not know
facts about the world. That division of labour is deliberate and visible everywhere in the UI: the numbers
come from instruments, the evidence comes from cited passages, and the neural paragraph is always labelled
as what it is.

MIT-style use; built end to end for this workspace.
