/**
 * generator.js — procedural corpus synthesis.
 *
 * ATLAS is trained from scratch, so it needs a corpus with (a) enough volume to
 * learn syntax, (b) a constrained, coherent domain so a ~1M parameter model can
 * actually master it, and (c) chat structure so the model learns the dialogue
 * format used at inference time. We therefore *generate* the corpus from a
 * hand-written research-language grammar, then mix in the curated knowledge base.
 */
import { RNG } from '../../neurojs/src/rng.js';
import { KNOWLEDGE, knowledgeText } from './knowledge.js';

const L = {
  field: ['cognitive psychology', 'molecular biology', 'health economics', 'climate science', 'machine learning',
    'epidemiology', 'behavioural economics', 'materials science', 'linguistics', 'neuroscience',
    'political science', 'ecology', 'human-computer interaction', 'public health', 'astrophysics'],
  construct: ['working memory capacity', 'treatment adherence', 'sample entropy', 'reaction time', 'cortical thickness',
    'model calibration', 'species richness', 'metabolic rate', 'lexical diversity', 'policy uptake',
    'catalytic efficiency', 'sleep latency', 'attentional control', 'household savings', 'signal fidelity'],
  design: ['a preregistered randomised controlled trial', 'a within-subjects factorial experiment',
    'a prospective cohort study', 'a stratified cluster-randomised design', 'a multi-site replication',
    'a regression discontinuity design', 'an interrupted time series', 'a matched case-control study',
    'a sequential design with pre-specified interim analyses', 'a many-analysts study'],
  method: ['hierarchical Bayesian modelling', 'mixed-effects regression', 'propensity score matching',
    'bootstrap resampling', 'permutation testing', 'structural equation modelling', 'cross-validated regularisation',
    'causal mediation analysis', 'meta-regression', 'variance decomposition'],
  metric: ['effect size', 'posterior mean', 'standardised difference', 'explained variance', 'log-likelihood',
    'false discovery rate', 'intraclass correlation', 'prediction interval', 'calibration error', 'hazard ratio'],
  quality: ['robust', 'fragile', 'well-powered', 'underpowered', 'preregistered', 'exploratory', 'confirmatory',
    'heterogeneous', 'consistent', 'reproducible', 'contested', 'convergent'],
  verbFind: ['found', 'reported', 'observed', 'documented', 'estimated', 'detected', 'recovered'],
  verbShow: ['suggests', 'indicates', 'implies', 'demonstrates', 'supports', 'undermines', 'qualifies'],
  hedge: ['appears to', 'may', 'is likely to', 'plausibly', 'tentatively', 'consistently', 'reliably'],
  connector: ['however', 'moreover', 'consequently', 'in contrast', 'critically', 'importantly', 'nevertheless',
    'by comparison', 'in addition', 'therefore'],
  threat: ['selection bias', 'measurement error', 'unmeasured confounding', 'attrition', 'demand characteristics',
    'multiple comparisons', 'model misspecification', 'range restriction', 'ceiling effects', 'publication bias'],
  remedy: ['blinding', 'randomisation', 'preregistration', 'sensitivity analysis', 'holdout validation',
    'multiverse analysis', 'active control conditions', 'independent replication', 'robust standard errors',
    'measurement invariance testing'],
  artefact: ['the effect', 'the association', 'the estimate', 'the interaction', 'the coefficient', 'the difference'],
};

const SENTENCES = [
  '{Design} in {field} {verbFind} that {construct} predicted {metric} across conditions.',
  'The authors {verbFind} a {quality} relationship between {construct} and {metric}, which {verbShow} that the mechanism is not purely artefactual.',
  '{Connector}, {artefact} {hedge} depend on {threat}, so {remedy} was applied before inference.',
  'Using {method}, the analysis estimated {artefact} with a {quality} {metric} and reported the interval rather than the point alone.',
  'A {quality} literature in {field} disagrees about whether {construct} causes {metric} or merely tracks it.',
  'Because {threat} cannot be excluded by design, the claim should be treated as {quality} until independent replication.',
  'The preregistration specified {method} as the primary analysis and everything else as exploratory.',
  'Power analysis indicated that detecting the smallest effect of interest required a substantially larger sample than the pilot suggested.',
  '{Connector}, the reported {metric} is compatible with effects ranging from negligible to substantial, so the study is best described as uninformative about magnitude.',
  'Replication across sites recovered {artefact} at roughly half the originally published magnitude, a pattern consistent with the winner\u2019s curse.',
  'The measurement model must be validated before groups are compared, otherwise the comparison confounds construct level with item functioning.',
  'When {method} is applied to observational data, identification rests on assumptions that the algorithm itself cannot verify.',
  'A {quality} design in {field} isolates {construct} by holding the remaining factors constant and randomising assignment.',
  'The discussion should state which validity the design privileges instead of implying that all forms were maximised.',
  'Sensitivity analysis showed that {artefact} survived reasonable variation in the analytic choices, which strengthens the inference.',
  'Reporting {metric} without uncertainty invites over-interpretation and hides the fragility of {artefact}.',
  '{Connector}, heterogeneity across studies exceeded what sampling error alone would produce, so a random-effects model is appropriate.',
  'Conditioning on a collider can manufacture an association between two independent variables, which is why adjustment sets should be derived from a causal graph.',
  'The theory forbids a specific pattern of results, and that prohibition is what makes the test informative.',
  'Exploratory analysis is legitimate and valuable provided it is labelled as exploratory in the report.',
  'The research team documented the stopping rule in advance so that optional stopping could not inflate the false positive rate.',
  'Effect sizes should be interpreted against a benchmark of practical relevance rather than against statistical significance.',
  'Model comparison used out-of-sample predictive accuracy because in-sample fit always improves with additional parameters.',
  'A registered report shifts peer review before data collection and thereby removes the incentive to obtain a significant result.',
  'Data, materials, and analysis code were released in a version-pinned container so the computation is reproducible by a stranger.',
  '{Connector}, {construct} interacts with context, which limits transport of {artefact} to other populations and settings.',
  'The instrument showed acceptable reliability, but reliability bounds validity and does not establish it.',
  'The estimate was attenuated by measurement error, so the corrected value is larger but rests on the assumed reliability coefficient.',
  'Between-study variance was substantial, so the prediction interval rather than the confidence interval of the mean should guide expectations.',
  'A causal claim in {field} requires an identification strategy, not merely a well-specified regression.',
];

const QA = [
  {
    q: ['how do I design a study of {construct} in {field}', 'what design should I use to test {construct}',
      'help me design an experiment about {construct}'],
    a: [
      'Start from the decision the study must inform, then choose the design that protects the validity you care about most.',
      'For {construct} in {field}, {design} is the strongest feasible option because it severs the main path from {threat} to the outcome.',
      'Specify the primary outcome, the analysis, and the stopping rule before collection; label everything else exploratory.',
      'Plan the sample against the smallest effect of practical interest rather than against a noisy pilot estimate.',
      'Pre-commit to {remedy} so that {artefact} cannot be rescued by analytic flexibility after the fact.',
    ],
  },
  {
    q: ['what does a p value of 0.03 mean', 'how should I interpret this p value', 'is my result significant'],
    a: [
      'A p value is the probability of data at least this extreme assuming the null model and every auxiliary assumption hold exactly.',
      'It is not the probability that the hypothesis is true and it is not a measure of magnitude.',
      'Report the effect size with an interval; the interval tells you which values the data fail to contradict.',
      'If the stopping rule was flexible, the nominal error rate no longer describes the procedure that produced the number.',
      'Treat the value as one summary of surprise and interpret it alongside precision, prior evidence, and design quality.',
    ],
  },
  {
    q: ['how many participants do I need', 'what sample size should I plan for', 'help me with power analysis'],
    a: [
      'Sample size follows from the smallest effect of interest, the desired power, the significance level, and the design.',
      'For a two-group comparison, required per-group n grows roughly with the inverse square of the standardised effect size.',
      'Detecting an interaction of the same magnitude as a main effect typically needs about four times the sample.',
      'Underpowered studies both miss real effects and exaggerate the ones they detect, so plan for at least eighty percent power.',
      'A sequential design with pre-specified interim looks is more efficient than a fixed design when the effect size is uncertain.',
    ],
  },
  {
    q: ['how do I review this literature', 'how should I structure a systematic review', 'help me synthesise the literature on {construct}'],
    a: [
      'Register a protocol first, then fix the search string, databases, and dates before screening begins.',
      'Screen in duplicate, record agreement, and account for every record in a flow diagram from identification to inclusion.',
      'Assess risk of bias per study and let that assessment weight the narrative rather than sit unused in an appendix.',
      'Pool quantitatively only when the studies estimate a comparable quantity; otherwise synthesise narratively and say why.',
      'Report heterogeneity and probe small-study effects, remembering these diagnostics are weak with few studies.',
    ],
  },
  {
    q: ['can I claim causation here', 'is this a causal effect', 'how do I rule out confounding in {field}'],
    a: [
      'Draw the causal graph first; identification is a property of the assumed structure, not of the estimator.',
      'Adjust for common causes, never for colliders, and state which back-door paths the adjustment set blocks.',
      'If unmeasured confounding is plausible, an instrument, a discontinuity, or a difference-in-differences contrast may recover the effect.',
      'Quantify how strong an unmeasured confounder would have to be to explain away {artefact}, and report that bound.',
      'Absent randomisation, describe the claim as conditional on the identification assumption rather than as established.',
    ],
  },
  {
    q: ['why did my result fail to replicate', 'what explains replication failure', 'how do I make my work reproducible'],
    a: [
      'Distinguish computational reproducibility, replicability of the result, and generalisability of the claim.',
      'Original estimates are inflated when only significant results are published, so shrinkage toward the meta-analytic mean is expected.',
      'Check whether the replication had the power to detect the smaller, more realistic effect before calling it a failure.',
      'Release data, materials, and a pinned environment so the computation can be rerun without contacting you.',
      'Preregistration and registered reports remove the incentive structure that produces fragile findings.',
    ],
  },
  {
    q: ['explain the transformer architecture', 'how does attention work', 'what is self attention'],
    a: [
      'Each position is projected into a query, a key, and a value; affinities between queries and keys become softmax weights over values.',
      'Scores are divided by the square root of the head dimension to keep the softmax out of saturation.',
      'Multiple heads attend in parallel subspaces so different relations can be represented at once.',
      'A position-wise feed-forward network supplies non-linear capacity, and residual connections with pre-layer normalisation make depth trainable.',
      'Causal masking restricts attention to earlier positions, turning the stack into an autoregressive model trained by next-token prediction.',
    ],
  },
  {
    q: ['how should I evaluate this model', 'what benchmarks should I use', 'is this evaluation sound'],
    a: [
      'State the construct the benchmark is proxying, because every proxy degrades once it is optimised against.',
      'Use held-out data with known provenance and check for contamination against the training corpus.',
      'Report variance across seeds and prompts instead of a single score, and include a strong baseline.',
      'Break results down by subgroup and input length; aggregates hide the failures that matter.',
      'Include calibration, robustness under shift, and efficiency in the report alongside accuracy.',
    ],
  },
  {
    q: ['what are the limitations of my study', 'critique this design', 'what could go wrong with this experiment'],
    a: [
      'The main threat is {threat}, which the current design does not address and which {remedy} would partially mitigate.',
      'Generalisation is bounded by the sampling frame; state the population the estimate is meant to describe.',
      'If the measurement model has not been validated in this population, group comparisons confound construct and instrument.',
      'Analytic flexibility remains a risk wherever the analysis was chosen after inspecting the data.',
      'State limitations specifically and quantitatively; a generic call for further research communicates nothing.',
    ],
  },
  {
    q: ['how do I write the abstract', 'help me structure the paper', 'how should I report these results'],
    a: [
      'One sentence for the gap, one for the approach, one for the principal result with its uncertainty, one for the implication.',
      'The introduction should end with the specific claim the paper defends, not a general statement of interest.',
      'Methods must let a competent stranger reproduce the work without contacting you.',
      'Results present evidence without interpretation; the discussion interprets and bounds it.',
      'Report intervals, exact test statistics, and the analysis code location rather than rounded verdicts.',
    ],
  },
];

function fill(tpl, rng) {
  return tpl.replace(/\{(\w+)\}/g, (_, key) => {
    const lower = key[0].toLowerCase() + key.slice(1);
    const bank = L[lower];
    if (!bank) return key;
    const v = rng.pick(bank);
    return key[0] === key[0].toUpperCase() ? v[0].toUpperCase() + v.slice(1) : v;
  });
}

/** Build a paragraph of research prose. */
export function paragraph(rng, n = 4) {
  const out = [];
  for (let i = 0; i < n; i++) out.push(fill(rng.pick(SENTENCES), rng));
  return out.join(' ');
}

/** Build one chat exchange in ATLAS dialogue format. */
export function exchange(rng) {
  const item = rng.pick(QA);
  const q = fill(rng.pick(item.q), rng);
  const answers = rng.shuffle(item.a.slice()).slice(0, 3 + rng.int(2));
  const body = answers.map((a) => fill(a, rng)).join(' ');
  return `<bos><user> ${q}? <atlas> ${body}<eos>`;
}

/**
 * Assemble the full training corpus.
 * Returns { text, stats }.
 */
export function buildCorpus({ seed = 7, targetChars = 1_200_000, chatRatio = 0.45 } = {}) {
  const rng = new RNG(seed);
  const parts = [];
  let chars = 0;

  // 1. curated knowledge, repeated a few times so facts imprint
  const kb = knowledgeText();
  for (let i = 0; i < 3; i++) {
    parts.push(kb);
    chars += kb.length;
  }

  // 2. knowledge-grounded Q/A pairs so the model can answer about its own KB
  for (const k of KNOWLEDGE) {
    const sentences = k.text.split(/(?<=\.)\s+/);
    for (let r = 0; r < 3; r++) {
      const picked = rng.shuffle(sentences.slice()).slice(0, 3).join(' ');
      const ex = `<bos><user> ${rng.pick(['what is', 'explain', 'tell me about', 'summarise'])} ${k.title.toLowerCase()}? <atlas> ${picked}<eos>`;
      parts.push(ex);
      chars += ex.length;
    }
  }

  // 3. mixture of prose and dialogue up to the target size
  while (chars < targetChars) {
    if (rng.next() < chatRatio) {
      const e = exchange(rng);
      parts.push(e);
      chars += e.length;
    } else {
      const p = paragraph(rng, 3 + rng.int(4));
      parts.push(p);
      chars += p.length;
    }
  }

  const text = parts.join('\n\n');
  const words = text.split(/\s+/).length;
  return {
    text,
    stats: {
      chars: text.length,
      words,
      segments: parts.length,
      knowledgeEntries: KNOWLEDGE.length,
      uniqueWords: new Set(text.toLowerCase().match(/[a-z']+/g) || []).size,
    },
  };
}
