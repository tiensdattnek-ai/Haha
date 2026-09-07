# ATLAS — a local research assistant with a model trained from scratch

A chat app you can talk to about anything. It plans the work, **searches live sources**, runs
**70 deterministic instruments** for every number it reports, writes and runs code, and tells you how
confident it is. The language model at its centre was **trained from scratch in this repository, in plain
JavaScript** — no PyTorch, no TensorFlow, no pretrained weights, no inference API.

Accounts and conversations live **in your browser** (IndexedDB). Nothing about you is stored on a server,
because there is no server-side account.

```
                    ┌──────────── live web ────────────┐
                    │ GitHub repos · code · issues     │
   you ──▶ agent ──▶│ npm · PyPI · Wikipedia · DDG · SO│──┐
                    └──────────────────────────────────┘  │
                             │                            ├──▶ ranked, quoted, cited answer
   ATLAS-R1 (trained here) ──┤ embeddings · generation    │
                             │                            │
   70 instruments ───────────┤ statistics · code · text ──┘
                             │
   local knowledge base ─────┘ hybrid dense + BM25 retrieval
```

---

## Quick start

```bash
npm install

npm run corpus         # 3.8M-char corpus: research prose + code + dialogue   (~0.2 s)
npm run train          # trains the transformer from scratch                  (~75 min, 2 cores)
npm run train:router   # trains the neural intent router                      (~15 s)
npm run index          # precomputes the retrieval index                      (~5 s)

npm run dev            # API on :8787 + UI on :5173
```

In a hurry? `npm run train:quick` gives a working (if babbling) checkpoint in a few minutes; everything
downstream behaves identically. Then open the UI, **create an account**, and start typing.

Production: `npm run build && npm start` serves the whole thing from one process on `:8787`.
Tests: `npm test` — 18 suites covering gradients, instruments and numerical ground truth.
UI safety net: `npm run smoke` renders every screen in Node to catch render crashes.

---

## What the app does

**Type anything.** Three modes, one input box:

| Mode | What runs |
| --- | --- |
| **Chat** | one instrument, no web, fastest path |
| **Research** | plan → live search → local retrieval → instruments → synthesis → self-critique |
| **Code** | coding instruments plus GitHub code search, npm and PyPI |

Every answer shows its work: the ranked intents, the searches it ran, the documents it read, the
instruments it executed with their runtime, the sources it cited, and a calibrated confidence figure.
Code blocks have **copy** and **run** buttons — `run` executes the snippet in an isolated `node:vm`
sandbox and prints the output underneath.

### Live sources, honestly reported

The web layer probes each provider at boot and adapts:

| Provider | Kind | Reachability |
| --- | --- | --- |
| GitHub repositories / code / issues | code, community | works wherever `api.github.com` is reachable |
| npm registry, PyPI | packages | public JSON APIs |
| Wikipedia, DuckDuckGo, Stack Overflow | reference, web, community | activate automatically on an unrestricted network |

Unreachable providers are skipped and shown as offline in Settings → Live sources — the app never
pretends to have searched something it could not reach. Results are merged, de-duplicated, ranked with
the model's **own embeddings** plus lexical scoring and provider agreement, and the best documents are
fetched and quoted. A second retrieval pass expands the query with terms mined from the first answer.

The HTTP layer also trusts the machine's CA store, so TLS-intercepting proxies (corporate networks,
sandboxes) do not silently break every search.

---

## The model, trained here

| Component | Where | How it is trained |
| --- | --- | --- |
| **ATLAS-R1** | `packages/neurojs`, `scripts/train.js` | decoder-only transformer, 4 layers / 4 heads / d=128 / ctx 96, byte-level BPE. AdamW + warmup/cosine + gradient clipping. v1 shipped at 934,656 params, **val loss 0.4469 (ppl 1.56)**; v2 adds a 2048-token vocabulary for code and trains on the 3.8M-char corpus. |
| **Intent router** | `scripts/train-router.js` | hashed n-gram MLP (1024→192→70) over 7k synthesised paraphrases, ~96% held-out accuracy. Fused with per-skill rule matchers and numeric priors. |
| **Retrieval embeddings** | `scripts/build-index.js` | position-weighted mean-pooled hidden states — the RAG vectors are the model's own representations. |

Everything is seeded: same seed ⇒ bit-identical weights. `npm run pipeline` rebuilds the entire chain,
and `npm run promote -- --from data/models_v2 --watch` hot-swaps a newly finished checkpoint into the
running server without a restart.

**The neural core** (`packages/neurojs`, ~1,900 lines, zero dependencies): reverse-mode autodiff over
`Float32Array`, hand-tuned GEMM kernels (2 output rows × 4 reduction steps per iteration — 2.4 GFLOP/s
per core, 2.7× the naive loop), fused causal self-attention with per-head tracing, GELU, LayerNorm,
cross-entropy, dropout, AdamW, cosine schedules, byte-level BPE, and a sampler with temperature, top-k,
nucleus, typical-p and repetition penalties. Correctness is enforced by directional finite-difference
gradient checks against **every** parameter tensor, a tiny-batch overfit test and a bit-exact checkpoint
round-trip.

---

## The 70 instruments

Deterministic, auditable, dependency-free. The model writes prose; **these produce the numbers**.

| Category | Instruments |
| --- | --- |
| Software engineering | code writer (36 vetted recipes), reviewer, runner, explainer, test generator, scaffolder, language translator, debug assistant, complexity analyser, regex builder |
| Statistics | descriptives, t-tests, ANOVA, correlation, OLS, chi-square, Mann–Whitney, power, Bayesian updating, multiplicity control, bootstrap & permutation, distributions, Monte-Carlo design simulation |
| Mathematics | expression compiler, equation solver, numeric calculus, linear algebra, RK4, optimiser, combinatorics, special functions |
| Research & design | programme planner, hypothesis forge, experiment designer, methodology critic, limitations auditor, reporting checklists, ethics screen, Socratic ladder, steelman, idea engine |
| Text & literature | TextRank summariser, keywords, readability, corpus stats, comparison, claim mining, fallacy detector, citation formatter, PICO screening, evidence synthesis, peer review, abstract, outline |
| Data | dataset profiler, regex lab, network analyser, time-series diagnostics, JSON inspector |
| Neural introspection | completion, tokenizer explorer, attention maps, embedding probe, perplexity, knowledge retrieval, model card |
| Utilities | randomisation, timeline calculator, unit converter |

The code recipes are shared with the corpus generator, so the model was **trained on the same code the
console serves**.

---

## Accounts and privacy

- Register and sign in locally; multiple accounts per browser are supported.
- Passwords are never stored or transmitted — only a PBKDF2-SHA256 verifier (210,000 iterations, random
  per-account salt), which is the current OWASP floor.
- Conversations, messages, traces and settings live in IndexedDB, scoped per account.
- Settings → Account & data offers a full JSON export, a one-click wipe, password change and account
  deletion. Clearing site data erases everything; there is no recovery, because there is no copy.

---

## Interface

Strictly monochrome — two themes (**Ink**, **Paper**), no hue anywhere, hierarchy from weight, spacing and
hairlines. Chat-first: sidebar of conversations, one composer, answers with inline source chips. A
details drawer holds the reasoning trace, sources, instrument outputs and charts. ⌘K opens a command
palette over every instrument and setting. Secondary workspaces: **Instruments** (run any of the 70 from
a generated form), **Neural lab** (sampling, tokenizer, attention heat maps, perplexity, embeddings, and
live gradient descent from the browser), **Knowledge**, **Model**.

---

## Layout

```
packages/neurojs     autodiff · transformer · tokenizer · sampler · optimiser · hashing featuriser
packages/corpus      knowledge base · 36 code recipes · dialogue + code corpus generator
packages/skills      70 instruments · math/stats/text cores · registry
server/src           runtime · agent orchestrator · web/ (providers + researcher) · API · sessions
web/src              React console: auth gate · chat · drawer · settings · labs · charts
scripts/             corpus · train · train-router · build-index · promote-model · ssr-smoke
tests/               gradient checks · instrument conformance · numerical ground truth
data/                corpus · checkpoints · retrieval index · web cache
```

## API

| Method | Route | Purpose |
| --- | --- | --- |
| `GET` | `/api/health` `/api/model` `/api/skills` `/api/knowledge` | status, model card, catalogue, KB |
| `GET` | `/api/web/status` | provider reachability + TLS trust |
| `POST` | `/api/web/search` | live multi-provider search |
| `POST` | `/api/chat/stream` | SSE agent pipeline |
| `POST` | `/api/skills/:id/run` | execute one instrument |
| `POST` | `/api/neural/{generate,tokenize,attention,perplexity,embed}` | model introspection |
| `POST` | `/api/train/stream` | live fine-tuning with streamed loss |

## Honest limitations

A ~1M-parameter model trained for about an hour is a **language surface**, not a knowledge base. It
writes plausible methodology and code English and produces useful embeddings; it does not know facts
about the world. That division of labour is visible everywhere: numbers come from instruments, evidence
comes from cited sources, and the neural paragraph is always labelled as what it is.

MIT-style use; built end to end for this workspace.
