/**
 * skills.research.js — reasoning, design, literature and writing skills.
 * These are deterministic "thinking instruments": they impose the structure a
 * strong methodologist would impose, adapted to the user's topic.
 */
import { table } from './registry.js';
import { words, sentences, textRank, rake, claims, fallacies, stance, readability } from './textcore.js';

const titleCase = (s) => s.replace(/\b\w/g, (c) => c.toUpperCase());
const key = (topic) => (topic || 'the phenomenon').replace(/\s+/g, ' ').trim().replace(/[.?!]$/, '');
const hash = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return Math.abs(h); };
const pickN = (arr, n, seedStr) => {
  const h = hash(seedStr || '');
  const out = [];
  for (let i = 0; i < n && i < arr.length; i++) out.push(arr[(h + i * 7) % arr.length]);
  return out;
};

const THREATS = [
  ['Selection bias', 'participants/units enter the sample in a way correlated with the outcome', 'randomise assignment; document the sampling frame; compare responders vs non-responders'],
  ['Unmeasured confounding', 'a common cause of exposure and outcome is absent from the model', 'draw a DAG, pre-specify the adjustment set, run an E-value / sensitivity bound'],
  ['Measurement error', 'the instrument does not capture the construct reliably', 'report reliability, validate in this population, model measurement explicitly'],
  ['Analytic flexibility', 'the analysis was chosen after seeing the data', 'preregister the primary analysis; run a multiverse for the rest'],
  ['Attrition / missingness', 'dropout is related to treatment or outcome', 'report the flow diagram, test MCAR, use multiple imputation or IPW'],
  ['Demand characteristics', 'participants infer the hypothesis and comply with it', 'blinding, cover story, active control condition'],
  ['Multiple comparisons', 'many tests inflate the false positive rate', 'pre-specify primary outcomes; control FDR for the exploratory family'],
  ['Range restriction', 'limited variance attenuates the observed association', 'sample across the full range; report the observed SD vs population SD'],
  ['Model misspecification', 'the functional form or error structure is wrong', 'residual diagnostics, robust SEs, out-of-sample checks'],
  ['Contamination between arms', 'control units receive part of the treatment', 'cluster randomisation; measure spillover explicitly'],
];

const DESIGNS = [
  ['Randomised controlled experiment', 'highest internal validity; requires ethical and practical feasibility of assignment', 'ATE among randomised units'],
  ['Cluster-randomised trial', 'when treatment must be delivered to groups; needs ICC-aware power', 'ATE with clustered SEs'],
  ['Within-subject / repeated measures', 'high power per participant; needs counterbalancing against order effects', 'within-person contrast'],
  ['Factorial design', 'isolates interactions; needs ~4x the n to power an interaction of equal size', 'main effects + interaction'],
  ['Prospective cohort', 'when exposure cannot be assigned; requires adjustment strategy', 'adjusted association, conditional on DAG'],
  ['Regression discontinuity', 'when a threshold rule assigns treatment', 'LATE at the cutoff'],
  ['Difference-in-differences', 'when a policy hits some units at a known time', 'ATT under parallel trends'],
  ['Instrumental variable', 'when a valid exogenous shifter exists', 'LATE among compliers'],
  ['Interrupted time series', 'single unit with a clean intervention point', 'level and slope change'],
  ['Registered replication / multi-site', 'when an existing effect needs verification at scale', 'meta-analytic estimate + heterogeneity'],
];

export default [
  {
    id: 'research.plan',
    name: 'Research Programme Planner',
    category: 'reasoning',
    summary: 'Turns a topic into a phased, milestone-driven research programme with deliverables and risk register.',
    tags: ['plan', 'roadmap', 'project', 'programme', 'proposal'],
    params: [
      { name: 'topic', type: 'string', required: true, description: 'the research topic or question' },
      { name: 'weeks', type: 'number', default: 12, description: 'time budget in weeks' },
      { name: 'resources', type: 'string', default: '', description: 'team, budget, data access constraints' },
    ],
    examples: [{ label: 'Sleep & memory', args: { topic: 'effect of sleep restriction on memory consolidation', weeks: 16 } }],
    match: (m) => (/\b(plan|roadmap|programme|program|proposal|how do i (start|approach)|design a (study|project))\b/i.test(m) ? 3 : 0),
    run: ({ topic, weeks = 12, resources = '' }) => {
      const t = key(topic);
      const w = Math.max(4, Number(weeks) || 12);
      const phases = [
        ['Framing', 0.12, ['Problem statement + decision the work informs', 'Stakeholder / literature scan (50 abstracts)', 'Draft causal graph of the domain']],
        ['Specification', 0.18, ['Pre-registration draft', 'Primary + secondary outcomes fixed', 'Power / precision analysis', 'Analysis code written against simulated data']],
        ['Instrumentation', 0.15, ['Measure validation or pilot (n≈20)', 'Data pipeline + codebook', 'Ethics / governance approval']],
        ['Collection', 0.25, ['Main data acquisition', 'Weekly data-quality audit', 'Pre-specified interim look (if sequential)']],
        ['Analysis', 0.16, ['Confirmatory analysis exactly as pre-registered', 'Robustness / multiverse grid', 'Exploratory pass, clearly labelled']],
        ['Dissemination', 0.14, ['Preprint + open materials', 'Reproducibility capsule (pinned environment)', 'Registered report of the follow-up']],
      ];
      let cursor = 0;
      const rows = phases.map(([name, frac, out]) => {
        const dur = Math.max(1, Math.round(frac * w));
        const start = cursor + 1;
        cursor += dur;
        return [`**${name}**`, `w${start}–w${Math.min(w, cursor)}`, `${dur}w`, out.join('; ')];
      });
      const risks = pickN(THREATS, 4, t).map(([n, why, fix], i) => [`R${i + 1}`, n, why, fix]);
      const md = `## Research programme — ${titleCase(t)}

**Time budget:** ${w} weeks${resources ? `  ·  **Constraints:** ${resources}` : ''}

### Guiding question
> Does ${t} hold under conditions that would falsify it, and how large is the effect where it matters?

### Phase plan
${table(['Phase', 'Window', 'Duration', 'Deliverables'], rows)}

### Decision gates
1. **Gate A (end of Specification):** if the required n exceeds feasible recruitment by >30%, switch to a sequential or within-subject design before proceeding.
2. **Gate B (end of Instrumentation):** if measure reliability < 0.7, the confirmatory phase does not start — fix measurement first.
3. **Gate C (interim look):** stop for futility if the conditional power for the smallest effect of interest drops below 20%.

### Risk register
${table(['#', 'Threat', 'Why it bites here', 'Mitigation'], risks)}

### Definition of done
- Pre-registration timestamped **before** the first observation is analysed.
- Every figure regenerable by \`make all\` from raw data in a pinned container.
- Limitations written as falsifiable statements, not as apologies.`;
      return { markdown: md, data: { topic: t, weeks: w, phases: phases.map((p) => p[0]) } };
    },
  },

  {
    id: 'research.hypothesis',
    name: 'Hypothesis Forge',
    category: 'reasoning',
    summary: 'Generates competing, falsifiable hypotheses with the prediction each one forbids.',
    tags: ['hypothesis', 'falsifiable', 'prediction', 'theory'],
    params: [
      { name: 'topic', type: 'string', required: true, description: 'phenomenon or observation' },
      { name: 'count', type: 'number', default: 4, description: 'number of rival hypotheses' },
    ],
    match: (m) => (/\bhypothes[ie]s|falsifiab|predict|theory|mechanism\b/i.test(m) ? 3 : 0),
    run: ({ topic, count = 4 }) => {
      const t = key(topic);
      const frames = [
        ['Direct causal', `X exerts a direct causal influence on ${t}`, 'a randomised manipulation of X shifts the outcome by at least the smallest effect of interest', 'no shift under randomisation, or the shift reverses under blinding'],
        ['Mediated', `the influence on ${t} runs entirely through an intermediate mechanism M`, 'blocking M abolishes the effect while leaving X intact', 'the effect survives complete blockade of M'],
        ['Moderated / boundary', `${t} appears only inside a specific parameter regime`, 'the effect is present in regime A and statistically absent in regime B, with a significant interaction', 'the interaction is null while both simple effects are non-zero'],
        ['Confounded / artefactual', `${t} is produced by a common cause or by the measurement procedure`, 'the association vanishes after adjustment or under an alternative instrument', 'the association survives adjustment, instrument change and negative controls'],
        ['Selection-generated', `${t} is an artefact of who enters the sample`, 'the effect disappears in a population sampled without the selection rule', 'the effect replicates in an unselected population'],
        ['Reverse causal', `the outcome drives the putative cause rather than the converse`, 'temporal precedence tests and cross-lagged panels favour the reverse path', 'lagged models show the forward path dominating'],
      ];
      const chosen = frames.slice(0, Math.max(2, Math.min(6, Number(count) || 4)));
      const md = `## Rival hypotheses — ${titleCase(t)}

Each hypothesis is stated with the observation it **forbids**. A hypothesis that forbids nothing cannot be tested.

${chosen.map(([label, h, supports, refutes], i) => `### H${i + 1} · ${label}
- **Claim:** ${h}.
- **Confirming prediction:** ${supports}.
- **Forbidden observation (falsifier):** ${refutes}.
- **Discriminating test:** design a contrast where H${i + 1} and H${((i + 1) % chosen.length) + 1} make *opposite* predictions rather than merely different ones.`).join('\n\n')}

### Crucial experiment
Build a single design whose outcome space partitions the hypotheses: manipulate X, measure M, and sample both regimes. A 2×2 with mediation measurement separates H1–H3 in one collection wave.

### Severity checklist
- [ ] Each hypothesis excludes at least one observable outcome.
- [ ] The test has power ≥ 0.8 against the smallest effect that would matter.
- [ ] The auxiliary assumptions that would be sacrificed on refutation are named in advance.`;
      return { markdown: md, data: { hypotheses: chosen.map((c) => c[1]) } };
    },
  },

  {
    id: 'research.design',
    name: 'Experiment Designer',
    category: 'design',
    summary: 'Recommends a design, estimand, randomisation scheme, controls and analysis plan.',
    tags: ['experiment', 'design', 'randomisation', 'estimand', 'protocol'],
    params: [
      { name: 'topic', type: 'string', required: true, description: 'what you want to test' },
      { name: 'units', type: 'string', default: 'participants', description: 'unit of analysis' },
      { name: 'constraints', type: 'string', default: '', description: 'ethical / logistical constraints' },
    ],
    match: (m) => (/\b(experiment|design|randomi|control group|protocol|rct|trial)\b/i.test(m) ? 2.5 : 0),
    run: ({ topic, units = 'participants', constraints = '' }) => {
      const t = key(topic);
      const canRandomise = !/observational|cannot randomi|ethic|retrospective|historical/i.test(`${t} ${constraints}`);
      const primary = canRandomise ? DESIGNS[0] : DESIGNS[4];
      const alts = pickN(DESIGNS.slice(1), 3, t);
      const md = `## Design specification — ${titleCase(t)}

**Unit of analysis:** ${units}${constraints ? `  ·  **Constraints:** ${constraints}` : ''}

### 1. Estimand (state before anything else)
> The average effect of the manipulation on the primary outcome among ${units} drawn from the target population, measured at the pre-specified time point.

### 2. Recommended design
**${primary[0]}** — ${primary[1]}. Estimand delivered: *${primary[2]}*.

**Alternatives if the primary is infeasible**
${table(['Design', 'When it is right', 'Estimand'], alts.map((d) => [d[0], d[1], d[2]]))}

### 3. Assignment & control
- Randomise at the level of ${units}; use **blocked randomisation** on the strongest prognostic covariate to reduce error variance.
- Include an **active control**, not just a passive one, so expectancy is matched.
- Blind participants, deliverers and analysts wherever possible; report which blinds held.
- Pre-register the allocation ratio, the seed and the person who generated the sequence.

### 4. Measurement
- One **primary outcome**. Everything else is secondary or exploratory, labelled as such.
- Report reliability for each instrument **in this sample**, not from the manual.
- Add a **positive control** (a manipulation known to work) and a **negative control** (an outcome the theory says must not move).

### 5. Analysis plan (pre-specified)
1. Intention-to-treat as primary; per-protocol as a secondary sensitivity analysis.
2. Model: outcome ~ condition + block + baseline covariate; report the coefficient with a 95% interval and the standardised effect.
3. Missing data: state the mechanism assumed and the imputation method before collection.
4. Stopping rule: fixed n, or a sequential design with pre-specified alpha-spending.

### 6. What would change my mind
State now, in one sentence, the result that would make you abandon the hypothesis. If no such result exists, the design is not yet an experiment.`;
      return { markdown: md, data: { design: primary[0], randomised: canRandomise } };
    },
  },

  {
    id: 'research.critique',
    name: 'Methodology Critic',
    category: 'reasoning',
    summary: 'Adversarial review of a described study: threats, severity, and what a reviewer will attack.',
    tags: ['critique', 'review', 'limitations', 'threats', 'validity'],
    params: [{ name: 'text', type: 'string', required: true, description: 'description of the study/method' }],
    match: (m) => (/\b(critique|critici[sz]e|review my|what.s wrong|weakness|limitation|flaw)\b/i.test(m) ? 3 : 0),
    run: ({ text }) => {
      const t = String(text);
      const lower = t.toLowerCase();
      const signals = [
        [!/random/i.test(t), 'No randomisation mentioned', 'Assignment mechanism is unspecified — every causal claim rests on an untested ignorability assumption.', 'high'],
        [!/(preregist|pre-regist|osf|registered report)/i.test(t), 'No preregistration', 'Confirmatory and exploratory analyses cannot be distinguished by the reader.', 'high'],
        [!/(power|sample size|n\s*=|participants)/i.test(t), 'No sample-size justification', 'Precision is unknown; a null is uninterpretable and a positive is likely inflated.', 'high'],
        [!/(blind|masked)/i.test(t), 'No blinding described', 'Expectancy and assessment bias are unbounded.', 'medium'],
        [!/(reliab|validit|cronbach|icc|alpha)/i.test(t), 'No measurement validation', 'Construct validity is asserted rather than demonstrated.', 'medium'],
        [!/(confound|covariate|adjust|dag)/i.test(t), 'No adjustment strategy', 'Back-door paths are neither drawn nor blocked.', 'high'],
        [/(correlat|associat)/i.test(t) && /(cause|effect of|leads to|improves)/i.test(t), 'Causal language on associational design', 'The verb choice outruns the identification strategy.', 'high'],
        [!/(missing|attrition|dropout)/i.test(t), 'Missing-data plan absent', 'Complete-case analysis is only valid under MCAR, which is rarely defensible.', 'medium'],
        [/(post hoc|after (we|i) (saw|looked)|exploratory analysis revealed)/i.test(lower), 'Post hoc analysis flagged as finding', 'Error rate is undefined for hypotheses generated by the data.', 'high'],
        [!/(replicat|robust|sensitivity|multiverse)/i.test(t), 'No robustness checks', 'A single specification is a point estimate of a researcher decision tree.', 'medium'],
      ].filter(([hit]) => hit).map(([, title, why, sev]) => [sev.toUpperCase(), title, why]);

      const fal = fallacies(t);
      const st = stance(t);
      const cl = claims(t).slice(0, 5);
      const md = `## Adversarial methods review

**Severity-ranked findings (${signals.length})**
${signals.length ? table(['Severity', 'Finding', 'Why it matters'], signals.sort((a, b) => (a[0] === 'HIGH' ? -1 : 1))) : '_No structural gaps detected in the description — unusual; verify the description is complete._'}

### Claims a reviewer will demand support for
${cl.length ? cl.map((c, i) => `${i + 1}. *"${c.claim.slice(0, 180)}"* — ${c.type} claim${c.hedged ? ' (hedged)' : ', stated unhedged'}; checkability ${(c.checkability * 100).toFixed(0)}%.`).join('\n') : '_No strong checkable claims were detected; the text may be too vague to review._'}

### Rhetorical audit
- Epistemic style: **${st.epistemicStyle}** (hedge density ${(st.hedgeDensity * 100).toFixed(1)}%, booster density ${(st.boosterDensity * 100).toFixed(1)}%).
${fal.length ? fal.slice(0, 6).map((f) => `- ⚠️ **${f.id}** — ${f.note}`).join('\n') : '- No fallacy patterns matched.'}

### Three questions to answer before submission
1. What is the smallest effect that would change a decision, and is the design powered for it?
2. If the result is null, what will you conclude — and did you commit to that in advance?
3. Which single auxiliary assumption, if false, destroys the inference?`;
      return { markdown: md, data: { findings: signals.length, fallacies: fal.length, stance: st.label } };
    },
  },

  {
    id: 'research.peerreview',
    name: 'Simulated Peer Review',
    category: 'literature',
    summary: 'Produces a structured referee report with recommendation and itemised revisions.',
    tags: ['peer review', 'referee', 'journal', 'revision'],
    params: [
      { name: 'text', type: 'string', required: true, description: 'abstract or manuscript text' },
      { name: 'venue', type: 'string', default: 'a selective empirical journal', description: 'target venue' },
    ],
    match: (m) => (/\b(peer review|referee|reviewer 2|submit to|journal)\b/i.test(m) ? 3 : 0),
    run: ({ text, venue = 'a selective empirical journal' }) => {
      const rd = readability(text);
      const st = stance(text);
      const cl = claims(text);
      const kws = rake(text, 6).map((k) => k.phrase);
      const score = Math.max(1, Math.min(5, Math.round(
        3 + (cl.length > 2 ? 0.5 : -0.5) + (st.hedgeDensity > 0.01 ? 0.5 : -0.5) + (rd.fleschReadingEase > 25 ? 0.3 : -0.3),
      )));
      const rec = score >= 4 ? 'Minor revision' : score === 3 ? 'Major revision' : 'Reject and resubmit';
      const md = `## Referee report — ${venue}

**Recommendation: ${rec}**  ·  Overall assessment ${score}/5

### Summary of the submission
The manuscript addresses ${kws.slice(0, 3).map((k) => `*${k}*`).join(', ') || 'the stated topic'} and advances ${cl.length} checkable claim(s). Prose sits at grade ${rd.consensusGrade.toFixed(1)} (${rd.band}); ${rd.words} words, ${rd.sentences} sentences.

### Major points
1. **Identification.** The manuscript must state the estimand and the assumption under which it is identified. As written, a reader cannot tell whether the target is an ATE, an ATT or a conditional association.
2. **Pre-specification.** Please indicate which analyses were planned before data inspection. If none were, relabel the results as exploratory throughout, including in the abstract.
3. **Precision.** Report effect sizes with intervals in the abstract. ${st.boosterDensity > st.hedgeDensity ? 'The current language is more certain than the design licenses.' : 'The hedging is appropriate; keep it in revision.'}
4. **Robustness.** Provide a specification curve or at minimum three alternative analytic choices with the primary estimate overlaid.

### Minor points
- Define every abbreviation on first use; the abstract currently assumes reader familiarity.
- Report exact test statistics and degrees of freedom, not only p-values.
- State software versions and deposit analysis code; a DOI'd capsule is preferred.
- ${rd.avgSentenceLength > 28 ? `Sentences average ${rd.avgSentenceLength.toFixed(0)} words — split the longest ones for readability.` : 'Sentence length is appropriate for the venue.'}

### Questions to the authors
1. What result would you have accepted as disconfirming?
2. How were outliers and exclusions decided, and were the rules fixed in advance?
3. Does the effect survive in the subgroup where the mechanism should *not* operate (negative control)?

### Confidential note to the editor
The contribution is ${score >= 4 ? 'sound and incremental in a useful direction' : 'potentially valuable but currently under-specified in its identification strategy'}. A revision that fixes the estimand and pre-specification issues would be reviewable.`;
      return { markdown: md, data: { recommendation: rec, score, keywords: kws } };
    },
  },

  {
    id: 'research.limitations',
    name: 'Limitations Auditor',
    category: 'reasoning',
    summary: 'Writes specific, falsifiable limitations (not the generic "more research is needed" paragraph).',
    tags: ['limitations', 'threats', 'discussion', 'bounds'],
    params: [{ name: 'text', type: 'string', required: true, description: 'study description' }],
    match: (m) => (/\blimitation|caveat|threat to validity|bound(s)? of\b/i.test(m) ? 2.5 : 0),
    run: ({ text }) => {
      const t = key(text);
      const picked = pickN(THREATS, 5, t);
      const md = `## Limitations — written as bounds, not apologies

${picked.map(([n, why, fix], i) => `**${i + 1}. ${n}.** ${why[0].toUpperCase()}${why.slice(1)}. This bounds the claim: the estimate should be read as valid *conditional on* the absence of this mechanism. A reader who doubts that condition should discount the estimate toward the null. Mitigation available in a revision: ${fix}.`).join('\n\n')}

### Quantified rather than gestured
- State the E-value: how strong would an unmeasured confounder need to be, on the risk-ratio scale, to explain the estimate away?
- State the attrition differential between arms in percentage points.
- State the reliability coefficient and the resulting attenuation factor.

### What this study cannot answer
1. Anything about populations outside the sampling frame.
2. Any mechanism not measured on the causal path.
3. Any effect at doses/intensities outside the observed range.`;
      return { markdown: md, data: { limitations: picked.map((p) => p[0]) } };
    },
  },

  {
    id: 'research.abstract',
    name: 'Abstract Composer',
    category: 'literature',
    summary: 'Compresses material into a structured 4-move abstract plus a one-sentence significance statement.',
    tags: ['abstract', 'writing', 'summary', 'paper'],
    params: [
      { name: 'text', type: 'string', required: true, description: 'notes, results or draft' },
      { name: 'style', type: 'string', default: 'structured', description: 'structured | narrative' },
    ],
    match: (m) => (/\babstract|write the (intro|summary)|one paragraph summary\b/i.test(m) ? 2.5 : 0),
    run: ({ text, style = 'structured' }) => {
      const tr = textRank(text, { maxSentences: 4 });
      const kws = rake(text, 5).map((k) => k.phrase);
      const cl = claims(text);
      const result = cl[0]?.claim || tr.summary[tr.summary.length - 1] || 'the principal result';
      const md = `## Abstract draft (${style})

${style === 'structured' ? `**Background.** ${tr.summary[0] || 'The problem is stated here in one sentence.'}
**Methods.** ${tr.summary[1] || 'The design, sample and analysis are stated in one sentence.'}
**Results.** ${result} *(insert the point estimate with its 95% interval here — an abstract without a number is a press release).*
**Conclusions.** ${tr.summary[tr.summary.length - 1] || 'The implication, bounded by the design, in one sentence.'}` : tr.summary.join(' ')}

### Significance statement (one sentence)
This work matters because it converts ${kws[0] ? `*${kws[0]}*` : 'the target phenomenon'} from an assumption into a measured quantity with stated uncertainty.

### Keyword set
${kws.map((k) => `\`${k}\``).join(' · ') || '_none extracted_'}

### Abstract quality checklist
- [ ] Contains at least one number with an interval.
- [ ] Names the design explicitly (not "we investigated").
- [ ] States the population the estimate generalises to.
- [ ] Contains no claim absent from the results section.`;
      return { markdown: md, data: { keywords: kws, sentences: tr.summary } };
    },
  },

  {
    id: 'research.outline',
    name: 'Paper Outline Architect',
    category: 'literature',
    summary: 'Builds an IMRaD outline with per-section word budgets and the argument each section must carry.',
    tags: ['outline', 'imrad', 'structure', 'paper', 'thesis'],
    params: [
      { name: 'topic', type: 'string', required: true, description: 'paper topic' },
      { name: 'words', type: 'number', default: 6000, description: 'total word budget' },
    ],
    match: (m) => (/\boutline|structure (the|my) (paper|thesis)|table of contents\b/i.test(m) ? 2.5 : 0),
    run: ({ topic, words: budget = 6000 }) => {
      const t = key(topic);
      const W = Number(budget) || 6000;
      const sections = [
        ['Abstract', 0.04, 'The whole argument in four moves.'],
        ['1. Introduction', 0.14, 'Gap → question → claim. End with the specific claim the paper defends.'],
        ['2. Background & related work', 0.14, 'Organise by *position*, not by chronology. Each paragraph = one contested question.'],
        ['3. Methods', 0.2, 'Reproducible by a stranger: sample, materials, procedure, analysis, deviations.'],
        ['4. Results', 0.2, 'Evidence without interpretation. One figure per claim, intervals everywhere.'],
        ['5. Discussion', 0.18, 'Interpretation, mechanism, bounds, alternatives you cannot exclude.'],
        ['6. Conclusion', 0.05, 'What is now known that was not known before, in two sentences.'],
        ['References & appendices', 0.05, 'Data availability, code DOI, preregistration link.'],
      ];
      const md = `## Outline — ${titleCase(t)}  (${W.toLocaleString()} words)

${table(['Section', 'Budget', 'Job it must do'], sections.map(([n, f, job]) => [n, `${Math.round(f * W)} w`, job]))}

### Paragraph-level skeleton for the Introduction
1. **Hook (1 ¶):** the phenomenon and why the current account is incomplete.
2. **State of the art (2 ¶):** what is established; cite the strongest opposing work, not the weakest.
3. **The gap (1 ¶):** the specific unmeasured quantity or untested prediction.
4. **This paper (1 ¶):** "We test whether … using … and find …" — the claim, stated as a claim.
5. **Contributions (bulleted):** three at most, each verifiable from the results.

### Figure plan
- F1: the causal graph / conceptual model.
- F2: the design and flow of units.
- F3: the primary estimate with interval, alongside the pre-specified smallest effect of interest.
- F4: robustness — specification curve or multiverse.

### Argument integrity test
Read only the section headings and the first sentence of each paragraph. If the argument does not survive that reading, the structure — not the prose — needs work.`;
      return { markdown: md, data: { sections: sections.map((s) => s[0]), words: W } };
    },
  },

  {
    id: 'research.socratic',
    name: 'Socratic Ladder',
    category: 'reasoning',
    summary: 'Escalating question ladder that drives a vague idea down to an operational, testable specification.',
    tags: ['socratic', 'questions', 'clarify', 'sharpen'],
    params: [{ name: 'topic', type: 'string', required: true, description: 'idea to sharpen' }],
    match: (m) => (/\b(socratic|help me think|sharpen|clarify|questions? (about|to ask))\b/i.test(m) ? 2.5 : 0),
    run: ({ topic }) => {
      const t = key(topic);
      const rungs = [
        ['Definition', `What exactly counts as "${t}"? Give a rule that a stranger could apply to classify cases.`],
        ['Observation', `What would you literally see, record or measure? Name the instrument and its units.`],
        ['Contrast', `Compared to what? Every claim about ${t} is implicitly a comparison — state the counterfactual.`],
        ['Magnitude', `How big must the effect be before it changes a decision? Give a number, not "meaningful".`],
        ['Mechanism', `Through what chain of events would this happen? Draw it, then mark which links you can measure.`],
        ['Alternative', `What is the strongest rival explanation, and what observation distinguishes it from yours?`],
        ['Falsifier', `What result would make you abandon the idea? If none, what are you actually claiming?`],
        ['Prior', `What is your probability that this is true before data? Write it down; you will be tempted to revise it dishonestly later.`],
        ['Value of information', `If you learned the answer tomorrow, what would you do differently? If nothing, why run the study?`],
        ['Generalisation', `To which population, setting and time does the answer apply? Name a case where it should fail.`],
      ];
      return {
        markdown: `## Socratic ladder — ${titleCase(t)}\n\nAnswer these in order. Do not skip a rung; each one closes an escape hatch.\n\n${rungs.map(([n, q], i) => `**${i + 1}. ${n}.** ${q}`).join('\n\n')}\n\n> When you can answer all ten in writing, you have a protocol rather than an interest.`,
        data: { rungs: rungs.map((r) => r[0]) },
      };
    },
  },

  {
    id: 'research.steelman',
    name: 'Steelman & Red Team',
    category: 'reasoning',
    summary: 'Constructs the strongest version of the opposing position, then attacks your own.',
    tags: ['steelman', 'devil advocate', 'red team', 'counterargument', 'debate'],
    params: [{ name: 'claim', type: 'string', required: true, description: 'the position to test' }],
    match: (m) => (/\b(steelman|devil.s advocate|counter(argument|point)|red.?team|opposing view|argue against)\b/i.test(m) ? 3 : 0),
    run: ({ claim }) => {
      const c = key(claim);
      return {
        markdown: `## Steelman & red team — "${c}"

### Steelman of the opposing position
A serious opponent would not deny your data. They would argue:
1. **Scope.** The effect is real inside your operationalisation but the construct does not travel; the label is doing work the measurement cannot support.
2. **Base rates.** In the population where the decision is actually made, the prior probability is low enough that even this evidence leaves the posterior below the action threshold.
3. **Cost asymmetry.** Acting on the claim has a worse tail than not acting, so the decision-relevant question is not the mean effect but the 5th percentile.
4. **Mechanism plausibility.** No known pathway produces an effect of this magnitude at this timescale; extraordinary magnitudes require extraordinary mechanisms.
5. **Selection in the evidence base.** The published estimates are a filtered sample; the unfiltered distribution is centred closer to zero.

### Red team against your own claim
- **Attack the measurement:** what would a deliberately hostile reanalysis of your raw data do first? Do it yourself now.
- **Attack the sample:** which subgroup drives the result? Remove it and report what remains.
- **Attack the specification:** enumerate every defensible analytic path and report the distribution of estimates across all of them.
- **Attack the timing:** does the effect appear before the cause could plausibly act? Run the placebo-in-time test.
- **Attack the incentive:** what result would have been convenient for you, and did you get it?

### Reconciliation
The strongest form of your claim, after the above, is probably narrower and conditional. Write that version down — it is the one that will survive.`,
        data: { claim: c },
      };
    },
  },

  {
    id: 'research.brainstorm',
    name: 'Divergent Idea Engine',
    category: 'reasoning',
    summary: 'Systematic idea generation across orthogonal axes (mechanism, population, method, scale, inversion).',
    tags: ['brainstorm', 'ideas', 'creative', 'divergent'],
    params: [
      { name: 'topic', type: 'string', required: true, description: 'seed topic' },
      { name: 'count', type: 'number', default: 12, description: 'ideas to generate' },
    ],
    match: (m) => (/\b(brainstorm|ideas?|what could i study|research questions?)\b/i.test(m) ? 2 : 0),
    run: ({ topic, count = 12 }) => {
      const t = key(topic);
      const axes = [
        ['Mechanism', `Isolate the intermediate step in ${t} and manipulate it directly.`],
        ['Population', `Test ${t} where the theory predicts it must fail — the boundary population.`],
        ['Timescale', `Compress or extend the timescale of ${t} by an order of magnitude.`],
        ['Measurement', `Replace the standard instrument for ${t} with an unrelated modality; agreement is evidence of construct validity.`],
        ['Inversion', `Invert the causal arrow of ${t} and design the test that distinguishes the directions.`],
        ['Scale', `Move ${t} from the individual to the group level and check whether the aggregate relation reverses (Simpson's paradox as a hypothesis).`],
        ['Negative control', `Find an outcome that must not move if the mechanism of ${t} is real, and measure it.`],
        ['Dose', `Establish the dose-response curve of ${t} rather than a binary contrast.`],
        ['Adversarial', `Run ${t} as an adversarial collaboration with someone who predicts the opposite.`],
        ['Simulation', `Build a generative model of ${t}, fit it, and test whether it reproduces held-out phenomena.`],
        ['Historical', `Exploit a natural experiment in the historical record where ${t} was shocked exogenously.`],
        ['Meta', `Meta-analyse the existing ${t} literature with selection models to estimate the bias-corrected effect.`],
      ];
      const chosen = axes.slice(0, Math.max(4, Math.min(12, Number(count) || 12)));
      return {
        markdown: `## Idea generation — ${titleCase(t)}\n\n${chosen.map(([axis, idea], i) => `**${i + 1}. ${axis}** — ${idea}`).join('\n\n')}\n\n### Triage grid\nScore each idea 1–5 on: *novelty*, *feasibility with current resources*, *value of information*, *risk of null being uninformative*. Keep only ideas where value-of-information ≥ 4 **and** a null result would still be publishable.`,
        data: { ideas: chosen.map((c) => c[1]) },
      };
    },
  },

  {
    id: 'research.checklist',
    name: 'Reporting Checklist',
    category: 'design',
    summary: 'Emits the right reporting checklist (PRISMA, CONSORT, STROBE, ARRIVE, TRIPOD, ML) for your design.',
    tags: ['checklist', 'prisma', 'consort', 'strobe', 'reporting', 'guidelines'],
    params: [{ name: 'design', type: 'string', required: true, description: 'trial | review | observational | animal | prediction-model | ml' }],
    match: (m) => (/\b(prisma|consort|strobe|arrive|tripod|checklist|reporting guideline)\b/i.test(m) ? 3 : 0),
    run: ({ design }) => {
      const d = String(design).toLowerCase();
      const lib = {
        trial: ['CONSORT 2010', ['Trial design & allocation ratio', 'Eligibility criteria & settings', 'Interventions with enough detail to replicate', 'Pre-specified primary and secondary outcomes', 'Sample size determination', 'Randomisation: sequence generation, concealment, implementation', 'Blinding of participants, deliverers, assessors', 'Statistical methods incl. subgroup & adjusted analyses', 'Participant flow diagram with losses per arm', 'Baseline table', 'Effect sizes with precision for each outcome', 'Harms', 'Registration number & protocol availability', 'Funding and role of funder']],
        review: ['PRISMA 2020', ['Protocol registration (PROSPERO) and any amendments', 'Full search strategy per database with dates', 'Eligibility criteria (PICO)', 'Selection process incl. number of reviewers and agreement', 'Data extraction process and items', 'Risk-of-bias assessment tool and process', 'Effect measures and synthesis methods', 'Heterogeneity assessment (tau², I²)', 'Reporting-bias assessment', 'Certainty assessment (GRADE)', 'Flow diagram with records at each stage', 'Characteristics of included studies table', 'Results of syntheses with prediction intervals', 'Data, code and extraction sheet availability']],
        observational: ['STROBE', ['Study design stated in the title/abstract', 'Setting, locations, recruitment periods', 'Eligibility and matching criteria', 'Variables: outcomes, exposures, predictors, confounders, effect modifiers', 'Data sources and measurement methods per variable', 'Bias mitigation efforts', 'Study size rationale', 'Handling of quantitative variables and groupings', 'Statistical methods incl. confounding control, subgroups, missing data, sensitivity', 'Participant flow numbers at each stage', 'Descriptive and outcome data', 'Unadjusted and adjusted estimates with precision', 'Generalisability discussion', 'Funding']],
        animal: ['ARRIVE 2.0', ['Study design and groups', 'Sample size and its justification', 'Inclusion/exclusion criteria set a priori', 'Randomisation method', 'Blinding at allocation, conduct, assessment and analysis', 'Outcome measures defined', 'Statistical methods and unit of analysis', 'Experimental animals: species, strain, sex, age, weight, source', 'Housing and husbandry', 'Ethical statement and approvals', 'Results with effect sizes and variability', 'Adverse events', 'Protocol registration', 'Data access']],
        'prediction-model': ['TRIPOD+AI', ['Source of data and study design', 'Participants and eligibility', 'Outcome definition and blinded assessment', 'Predictors and their measurement timing', 'Sample size and events-per-variable', 'Missing data handling', 'Model development: selection, shrinkage, hyperparameters', 'Model performance: discrimination, calibration plot, clinical utility', 'Internal validation method (bootstrap / CV) and optimism correction', 'External validation cohort and its differences', 'Fairness assessment across subgroups', 'Full model specification released', 'Intended use and failure modes', 'Code and data availability']],
        ml: ['ML reproducibility (NeurIPS-style)', ['Precise task and dataset provenance incl. licensing', 'Train/validation/test split policy and contamination checks', 'Model architecture and parameter count', 'Full hyperparameter grid and selection protocol', 'Compute budget and hardware', 'Number of random seeds and variance reported', 'Baselines: strongest available, tuned equally', 'Statistical significance of comparisons', 'Ablations for every claimed component', 'Calibration and robustness under shift', 'Failure cases and subgroup breakdown', 'Broader impact and dual-use', 'Released code, weights and environment lock file', 'Reproduction instructions verified on a clean machine']],
      };
      const chosen = lib[d] || (/(trial|rct|random)/.test(d) ? lib.trial : /(review|meta)/.test(d) ? lib.review : /(cohort|case|survey|observ)/.test(d) ? lib.observational : /(model|predict)/.test(d) ? lib['prediction-model'] : /(ml|neural|learning|ai)/.test(d) ? lib.ml : lib.observational);
      return {
        markdown: `## ${chosen[0]} checklist\n\n${chosen[1].map((i) => `- [ ] ${i}`).join('\n')}\n\n> Attach the completed checklist as a supplement with page numbers. Reviewers check whether the boxes correspond to actual text.`,
        data: { standard: chosen[0], items: chosen[1].length },
      };
    },
  },

  {
    id: 'research.ethics',
    name: 'Ethics & Governance Review',
    category: 'design',
    summary: 'Belmont-grounded ethics screen with data protection, dual-use and vulnerability analysis.',
    tags: ['ethics', 'irb', 'consent', 'governance', 'privacy'],
    params: [{ name: 'text', type: 'string', required: true, description: 'study description' }],
    match: (m) => (/\b(ethic|irb|consent|privacy|gdpr|vulnerable|dual.?use)\b/i.test(m) ? 3 : 0),
    run: ({ text }) => {
      const t = String(text).toLowerCase();
      const flags = [
        [/child|minor|adolescent|student|patient|prisoner|refugee|elderly|disabilit/.test(t), 'Vulnerable population', 'Additional safeguards, assent procedures and independent advocacy required.'],
        [/deception|cover story|misle/.test(t), 'Deception', 'Justify necessity, minimise harm, guarantee full debrief with withdrawal of data option.'],
        [/personal data|identifiab|health record|biometric|genetic|location/.test(t), 'Identifiable data', 'Lawful basis, DPIA, minimisation, pseudonymisation at the earliest point, retention schedule.'],
        [/social media|scraped|public data|web data/.test(t), 'Public-but-personal data', 'Public availability is not consent; assess contextual integrity and re-identification risk.'],
        [/pain|stress|distress|invasive|drug|intervention/.test(t), 'Physical or psychological risk', 'Risk-benefit ratio, stopping rules, adverse-event reporting, clinician on call.'],
        [/model|deploy|automat|algorithm|ai/.test(t), 'Dual-use / deployment', 'Anticipatory ethics of downstream use, misuse pathways, release strategy.'],
        [/incentive|payment|compensat/.test(t), 'Compensation', 'Ensure payment is fair but not coercive relative to local norms.'],
      ].filter(([hit]) => hit);
      return {
        markdown: `## Ethics & governance screen

### Belmont mapping
- **Respect for persons** — consent must be informed, voluntary and revocable; document comprehension checks, not just signature collection.
- **Beneficence** — state the expected benefit and the maximum foreseeable harm, and show the ratio is favourable *ex ante*.
- **Justice** — the population bearing the burden should be among those who benefit; justify exclusions on scientific grounds only.

### Triggered flags (${flags.length})
${flags.length ? flags.map(([, name, action]) => `- **${name}** → ${action}`).join('\n') : '- No high-risk features detected from the description. Still file the standard protocol.'}

### Data governance minimum
1. Lawful basis and, where applicable, a Data Protection Impact Assessment.
2. Storage: encrypted at rest, access log, named data custodian.
3. Sharing: de-identified public tier + controlled-access tier with a data-use agreement.
4. Retention: fixed period with a deletion date, and a documented exception process.

### Questions the committee will ask
- Who can re-identify a participant, and what would it take?
- What happens to the data if the project ends early or the PI moves institution?
- If the model or finding is misused, what is the mitigation path?`,
        data: { flags: flags.map((f) => f[1]) },
      };
    },
  },

  {
    id: 'research.explain',
    name: 'Multi-Level Explainer',
    category: 'reasoning',
    summary: 'Explains a concept at five levels: child, student, practitioner, expert, and formal.',
    tags: ['explain', 'eli5', 'teaching', 'levels'],
    params: [{ name: 'concept', type: 'string', required: true, description: 'concept to explain' }],
    match: (m) => (/\b(explain|eli5|what is|how does .* work|teach me)\b/i.test(m) ? 1.5 : 0),
    run: ({ concept }, ctx) => {
      const c = key(concept);
      const grounded = ctx?.retrieve ? ctx.retrieve(c, 2) : [];
      const gloss = grounded.length ? grounded[0].text.split(/(?<=\.)\s/)[0] : null;
      return {
        markdown: `## ${titleCase(c)} — five levels

**1 · Child.** Imagine you want to know if something really works. You try it lots of times, count how often it works, and check whether it could have happened by luck.

**2 · Student.** ${gloss || `${titleCase(c)} is best understood as a procedure with inputs, assumptions and an output whose meaning depends on those assumptions holding.`}

**3 · Practitioner.** In applied work the decisive questions are: what is the estimand, which assumptions are load-bearing, how is uncertainty quantified, and what does the procedure do when its assumptions fail? Failure modes matter more than the happy path.

**4 · Expert.** The interesting content is at the boundaries: the regime where the standard treatment breaks down, the trade-off it hides (usually bias against variance, or generality against power), and the alternatives that dominate it in specific corners of the parameter space.

**5 · Formal.** State the object, the assumption set, and the theorem or estimator that connects them. Anything that cannot be written down at this level is intuition, not knowledge — which is fine, provided it is labelled.

${grounded.length ? `\n### Grounded in the ATLAS knowledge base\n${grounded.map((g) => `- **${g.title}** — ${g.text.slice(0, 200)}…`).join('\n')}` : ''}`,
        data: { concept: c, grounded: grounded.map((g) => g.id) },
      };
    },
  },
];
