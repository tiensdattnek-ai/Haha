/**
 * knowledge.js — the curated knowledge base ATLAS retrieves from.
 * Hand-written, citable notes on research methodology, statistics, ML and
 * epistemology. Every RAG answer is grounded in these entries.
 */

export const KNOWLEDGE = [
  {
    id: 'kb-001',
    title: 'The hypothetico-deductive cycle',
    field: 'Philosophy of Science',
    tags: ['method', 'hypothesis', 'falsification', 'epistemology'],
    text: `Modern empirical research is organised around a loop: observe an anomaly, formulate a hypothesis that would explain it, deduce a prediction that must hold if the hypothesis is true, design a test whose outcome can contradict that prediction, and then revise. The decisive property of a good hypothesis is not that it can be confirmed but that it forbids something: a hypothesis compatible with every possible observation carries no information. Popper called this falsifiability; information theory gives the same conclusion in different clothing, since a claim that excludes no outcome reduces no entropy. In practice the cycle rarely terminates in a clean refutation. Auxiliary assumptions — instrument calibration, sampling frames, statistical models — are tested jointly with the hypothesis, a difficulty known as the Duhem–Quine problem. Strong programmes therefore pre-register which auxiliary assumptions they are willing to sacrifice and which they treat as load-bearing before the data arrive.`,
  },
  {
    id: 'kb-002',
    title: 'Internal, external and construct validity',
    field: 'Research Design',
    tags: ['validity', 'design', 'confounding', 'generalisation'],
    text: `Validity is not a single property but a family of questions. Internal validity asks whether the observed difference was produced by the manipulated variable rather than by a confounder, selection effect, or measurement artefact; randomisation and blinding are its main defences. External validity asks whether the effect survives transport to other populations, settings, and times; it is threatened by convenience samples and by treatment effects that interact with context. Construct validity asks whether the measured quantity is the theoretical quantity of interest — whether a reaction-time difference really indexes attention, or a benchmark score really indexes reasoning. Statistical conclusion validity asks whether the inferential machinery was applied correctly at all. The four trade off against each other: tight laboratory control buys internal validity at the cost of external validity, while field studies do the reverse. Reporting should therefore state which validity the design privileges rather than pretending all four were maximised.`,
  },
  {
    id: 'kb-003',
    title: 'What a p-value is and is not',
    field: 'Statistics',
    tags: ['p-value', 'nhst', 'inference', 'misinterpretation'],
    text: `A p-value is the probability of observing data at least as extreme as the data actually observed, computed under the assumption that the null hypothesis and every modelling assumption are exactly true. It is a statement about data given a model, not about a model given data. It is therefore not the probability that the null hypothesis is true, not the probability that the result will replicate, and not a measure of effect size. A p-value of 0.049 and one of 0.051 describe nearly identical evidence; the boundary at 0.05 is a convention, not a discovery. Because p-values depend on the sampling plan, optional stopping and undisclosed analytic flexibility inflate the false positive rate far above the nominal level — the garden of forking paths. Sound practice reports effect sizes with confidence intervals, states the stopping rule in advance, and treats a p-value as one summary of surprise rather than as a verdict.`,
  },
  {
    id: 'kb-004',
    title: 'Statistical power and sample size planning',
    field: 'Statistics',
    tags: ['power', 'sample size', 'design', 'effect size'],
    text: `Power is the probability of detecting an effect of a given size if that effect truly exists. For a two-sample comparison of means it depends on the standardised effect size d, the per-group sample size n, and the significance level alpha, approximately through the non-centrality parameter d times the square root of n divided by two. Underpowered studies are doubly harmful: they miss real effects, and the effects they do detect are exaggerated, because only unusually large sample estimates cross the significance threshold — the winner's curse or type M error. Planning should target 80 to 95 percent power against the smallest effect size of practical interest, not against the effect size observed in a small pilot, which is itself noisy. Where an effect size cannot be justified from theory, a sequential design with pre-specified interim analyses or an equivalence test against a bound of practical relevance is more honest than a post hoc power calculation.`,
  },
  {
    id: 'kb-005',
    title: 'Confidence intervals and interval thinking',
    field: 'Statistics',
    tags: ['confidence interval', 'estimation', 'uncertainty'],
    text: `A 95 percent confidence interval is generated by a procedure that, across hypothetical repetitions of the study, contains the true parameter 95 percent of the time. Any single interval either contains the parameter or does not; the probability lives in the procedure. Despite this awkwardness intervals are more informative than tests because they display the range of parameter values the data do not strongly contradict, and because their width communicates precision directly. A wide interval that includes zero means the study was uninformative, which is a different conclusion from the claim that the effect is absent. Reporting intervals also disciplines interpretation: the same data that yield a significant test may be compatible with effects ranging from negligible to enormous. Bayesian credible intervals answer the question researchers usually intend to ask — where the parameter probably lies given the data and a prior — at the price of stating that prior explicitly.`,
  },
  {
    id: 'kb-006',
    title: 'Bayesian updating and the likelihood principle',
    field: 'Statistics',
    tags: ['bayes', 'prior', 'posterior', 'evidence'],
    text: `Bayes' theorem states that the posterior is proportional to the likelihood times the prior. Its practical force is that evidence is relative: data support a hypothesis only in comparison with rival hypotheses, quantified by the Bayes factor, the ratio of marginal likelihoods. The likelihood principle follows — all evidential information in the data is carried by the likelihood function, so the intention to stop collecting data does not by itself change what the data say. Conjugate families make updating analytic: a Beta prior with parameters a and b, combined with s successes in n trials, yields a Beta posterior with parameters a plus s and b plus n minus s. Priors are neither an embarrassment nor a free parameter to be tuned after seeing results; they are an explicit part of the model that should be justified, varied in sensitivity analysis, and reported alongside the posterior.`,
  },
  {
    id: 'kb-007',
    title: 'Causal inference: confounding, colliders and DAGs',
    field: 'Causal Inference',
    tags: ['causality', 'confounder', 'collider', 'dag', 'identification'],
    text: `Correlation constrains causation but does not determine it. A directed acyclic graph makes the assumed causal structure explicit and turns identification into a graphical question. Controlling for a common cause of exposure and outcome removes confounding bias; controlling for a common effect of two variables — a collider — creates a spurious association where none existed, which is why conditioning on selection into a sample can manufacture correlations. The back-door criterion specifies which sets of variables suffice for adjustment; the front-door criterion and instrumental variables recover effects when unmeasured confounding blocks the back door. Randomisation is powerful precisely because it severs all arrows into the exposure. When randomisation is impossible, difference-in-differences, regression discontinuity, and matching each buy identification with a different, checkable assumption, and the assumption rather than the algorithm is what deserves scrutiny.`,
  },
  {
    id: 'kb-008',
    title: 'The replication crisis and its remedies',
    field: 'Metascience',
    tags: ['replication', 'reproducibility', 'preregistration', 'bias'],
    text: `Large-scale replication projects in psychology, cancer biology, and economics recovered effects at rates far below what published significance rates implied. The causes are structural rather than individual: publication bias against null results, analytic flexibility, small samples, and incentives that reward novelty over verification. Remedies operate at several levels. At the study level, preregistration separates confirmatory from exploratory analysis and registered reports move peer review before data collection, removing the incentive to produce a significant result. At the infrastructure level, open data, open materials, and containerised analysis code make computational reproducibility checkable. At the evaluation level, multi-site replications, many-analysts studies, and meta-analytic thinking replace the single decisive experiment with a distribution of estimates. Reproducibility of the computation, replicability of the result, and generalisability of the claim are distinct goals and should be reported separately.`,
  },
  {
    id: 'kb-009',
    title: 'Systematic review and PRISMA',
    field: 'Literature Synthesis',
    tags: ['systematic review', 'prisma', 'screening', 'meta-analysis'],
    text: `A systematic review is an experiment whose units are studies. It requires a protocol registered in advance, an explicit search string executed across multiple databases with the dates recorded, inclusion and exclusion criteria fixed before screening, dual independent screening with a measured agreement statistic, structured data extraction, and a risk-of-bias assessment for each included study. PRISMA specifies the reporting skeleton, including the flow diagram that accounts for every record from identification through screening, eligibility, and inclusion. Narrative synthesis is appropriate where studies are heterogeneous in design or outcome; quantitative meta-analysis is appropriate where they estimate a comparable quantity. Heterogeneity is quantified with tau squared and I squared, and publication bias is probed with funnel plots and selection models, remembering that these diagnostics are themselves low-powered when the number of studies is small.`,
  },
  {
    id: 'kb-010',
    title: 'Meta-analysis: fixed and random effects',
    field: 'Literature Synthesis',
    tags: ['meta-analysis', 'heterogeneity', 'weights', 'effect size'],
    text: `Meta-analysis pools effect estimates by weighting each study by the inverse of its variance, so precise studies dominate. A fixed-effect model assumes every study estimates one common true effect and that variation is sampling noise alone; a random-effects model assumes true effects vary across studies and estimates the between-study variance tau squared in addition to the mean. Random effects widen the interval and give small studies relatively more weight, which makes the model more vulnerable to small-study bias. Prediction intervals, which describe where the true effect of a new study is expected to fall, are more useful than the confidence interval of the mean when heterogeneity is substantial. Moderator analysis and meta-regression can explain heterogeneity but are observational across studies, so their conclusions are hypothesis-generating rather than confirmatory.`,
  },
  {
    id: 'kb-011',
    title: 'Measurement, reliability and validity of instruments',
    field: 'Psychometrics',
    tags: ['measurement', 'reliability', 'validity', 'scale'],
    text: `Every quantitative claim rests on a measurement model. Reliability describes the consistency of a measure — across items with Cronbach's alpha or omega, across time with test-retest correlation, across raters with intraclass correlation or Cohen's kappa. Reliability bounds validity: an unreliable instrument attenuates observed correlations toward zero, so correction for attenuation is sometimes justified but always assumption-laden. Validity evidence accumulates from content, from relations with criteria, and from the structure of the construct itself, typically probed with factor analysis. Measurement invariance must be established before groups are compared, otherwise an apparent group difference may reflect different functioning of the items rather than different levels of the construct. In fields that borrow instruments across languages and cultures, invariance testing is not a technicality but the precondition of the comparison.`,
  },
  {
    id: 'kb-012',
    title: 'Experimental designs: between, within, factorial',
    field: 'Research Design',
    tags: ['experiment', 'factorial', 'counterbalancing', 'randomisation'],
    text: `A between-subjects design assigns each participant to one condition and is robust to carry-over effects but demands larger samples. A within-subjects design uses each participant as their own control, removing between-person variance and gaining power, at the cost of practice, fatigue, and demand effects that must be controlled by counterbalancing or Latin squares. Factorial designs cross two or more factors and are the only way to detect interactions, which are frequently the theoretically interesting quantity and are systematically underpowered relative to main effects — detecting an interaction of the same size as a main effect typically requires roughly four times the sample. Blocking, stratified randomisation, and covariate adjustment specified in advance all reduce error variance. Cluster randomisation, in which groups rather than individuals are assigned, requires the analysis to account for the intra-cluster correlation or the nominal error rate collapses.`,
  },
  {
    id: 'kb-013',
    title: 'Regression: assumptions and diagnostics',
    field: 'Statistics',
    tags: ['regression', 'ols', 'assumptions', 'diagnostics'],
    text: `Ordinary least squares estimates the conditional mean of an outcome as a linear function of predictors, and its inferential guarantees rest on linearity in parameters, independence of errors, homoscedasticity, and — for small samples — approximate normality of residuals. Diagnostics are therefore mandatory: residual-versus-fitted plots reveal non-linearity and heteroscedasticity, quantile-quantile plots reveal tail problems, Cook's distance and leverage reveal influential points, and the variance inflation factor reveals collinearity that inflates standard errors without biasing coefficients. Robust or cluster-robust standard errors repair some violations of the error structure. R squared measures variance explained in this sample and always increases with predictors, so adjusted R squared or out-of-sample error is preferable for model comparison. A regression coefficient is causal only under the same identification assumptions that any causal claim requires; the arithmetic never supplies them.`,
  },
  {
    id: 'kb-014',
    title: 'Multiple comparisons and error rate control',
    field: 'Statistics',
    tags: ['multiplicity', 'fdr', 'bonferroni', 'error rate'],
    text: `Testing many hypotheses inflates the chance of at least one false positive. The family-wise error rate is the probability of any false positive and is controlled conservatively by Bonferroni correction or, more powerfully and still validly under arbitrary dependence structures of a certain class, by Holm's step-down procedure. The false discovery rate is the expected proportion of false positives among rejections and is controlled by Benjamini–Hochberg; it is the appropriate target in exploratory screens where a tolerable fraction of false leads is acceptable. Neither correction rescues a study whose hypotheses were chosen after inspecting the data. Pre-specifying a small number of primary outcomes, treating the rest as exploratory and labelling them as such in the report, is more effective than any post hoc adjustment.`,
  },
  {
    id: 'kb-015',
    title: 'Qualitative inquiry and thematic analysis',
    field: 'Qualitative Methods',
    tags: ['qualitative', 'coding', 'saturation', 'reflexivity'],
    text: `Qualitative research answers questions about meaning, process, and mechanism that frequency counts cannot address. Thematic analysis proceeds through familiarisation, systematic coding, construction of candidate themes, review against the full data set, and definition of final themes, and it may be inductive or theory-driven. Rigour is established not by sample size but by transparency of the audit trail, by reflexivity about the researcher's position, by negative case analysis that actively seeks disconfirming material, and where appropriate by member checking. The concept of saturation should be operationalised in advance rather than claimed retrospectively. Mixed-methods designs must state whether the qualitative strand is exploratory sequencing into a quantitative phase, explanatory of quantitative findings, or convergent, and how the strands will be integrated rather than merely reported side by side.`,
  },
  {
    id: 'kb-016',
    title: 'Research ethics and human subjects',
    field: 'Research Ethics',
    tags: ['ethics', 'consent', 'irb', 'risk'],
    text: `The Belmont principles — respect for persons, beneficence, and justice — translate into informed consent, favourable risk-benefit assessment, and fair selection of participants. Consent must be informed, voluntary, and ongoing, which requires attention to comprehension and to power asymmetries between researcher and participant. Deception is permissible only when the knowledge sought is important, no non-deceptive alternative exists, and debriefing is provided. Data protection obligations continue after the study: pseudonymisation, minimisation, defined retention, and a plan for secondary use. In digital research, public availability of data does not by itself establish consent for research use, and re-identification risk grows with linkage. Studies involving vulnerable groups, dual-use potential, or deployment of autonomous systems require anticipatory ethics review of downstream consequences, not only of the immediate protocol.`,
  },
  {
    id: 'kb-017',
    title: 'Attention and the transformer architecture',
    field: 'Machine Learning',
    tags: ['transformer', 'attention', 'architecture', 'sequence model'],
    text: `A transformer layer maps a sequence of vectors to a sequence of vectors using two sublayers. Self-attention projects each position into a query, key, and value; the affinity between a query and every key produces weights, normalised by softmax, which mix the values. Scaling scores by one over the square root of the head dimension keeps the softmax out of its saturated regime. Multiple heads run this operation in parallel subspaces so that different relations — syntactic dependency, coreference, positional offset — can be represented simultaneously. A position-wise feed-forward network then expands and contracts each vector independently, supplying non-linear capacity. Residual connections and layer normalisation, applied before each sublayer in modern implementations, make deep stacks trainable. Causal masking restricts attention to previous positions, which turns the stack into an autoregressive language model whose training objective is simply next-token prediction.`,
  },
  {
    id: 'kb-018',
    title: 'Language model training dynamics',
    field: 'Machine Learning',
    tags: ['training', 'optimisation', 'scaling', 'loss'],
    text: `Language models are trained by minimising cross-entropy between predicted and actual next tokens, which is equivalent to maximising the likelihood of the corpus and, after exponentiation, to minimising perplexity. Optimisation in practice uses AdamW with a warmup phase that prevents early instability while second-moment estimates are still noisy, followed by cosine decay. Gradient clipping bounds rare large updates from outlier batches. Loss curves are informative: a plateau at the unigram entropy of the corpus means the model has learned token frequency and nothing else, while a steady logarithmic decline indicates that structure is being absorbed. Scaling laws relate loss to parameters, data, and compute by power laws, implying that a small model trained on a well-matched, low-entropy corpus can reach a low loss on that distribution even though it cannot generalise beyond it. Small models are therefore best evaluated within the domain they were trained for.`,
  },
  {
    id: 'kb-019',
    title: 'Retrieval-augmented generation',
    field: 'Machine Learning',
    tags: ['rag', 'retrieval', 'grounding', 'embeddings'],
    text: `Retrieval-augmented generation separates parametric knowledge, stored in weights, from non-parametric knowledge, stored in an external index that can be inspected and updated. A query is embedded into a vector space, nearest documents are retrieved by cosine similarity, and the retrieved passages are placed in context so the generator can quote and cite them. The architecture reduces hallucination because claims can be attributed, and it allows knowledge to change without retraining. Its failure modes are retrieval failures rather than generation failures: an ambiguous query embeds badly, chunk boundaries split the answer, or lexically dissimilar but semantically relevant passages are missed. Hybrid retrieval that combines dense embeddings with sparse lexical scoring such as BM25, followed by reranking, is more robust than either alone. Grounding should be verified by requiring that every factual sentence in the output map to a retrieved span.`,
  },
  {
    id: 'kb-020',
    title: 'Evaluating models and benchmarks',
    field: 'Machine Learning',
    tags: ['evaluation', 'benchmark', 'metrics', 'contamination'],
    text: `A benchmark is a proxy, and every proxy is eventually optimised until it stops measuring what it proxied — Goodhart's law applied to machine learning. Sound evaluation states the construct being measured, uses held-out data whose provenance excludes contamination from training corpora, reports variance across seeds and prompts rather than a single number, and includes baselines that are strong rather than convenient. Aggregate scores hide distributional failures, so error analysis by subgroup and by input length is more informative than a leaderboard position. For generative systems, automatic metrics correlate imperfectly with human judgement, so preference studies need inter-rater reliability statistics and pre-registered rubrics. Efficiency, calibration, robustness to distribution shift, and behaviour under adversarial input belong in the evaluation report alongside accuracy.`,
  },
  {
    id: 'kb-021',
    title: 'Information theory for researchers',
    field: 'Information Theory',
    tags: ['entropy', 'information', 'kl divergence', 'compression'],
    text: `Entropy measures the average surprise of a distribution and sets the lower bound on lossless code length. Cross-entropy measures the cost of coding one distribution with a code optimised for another, and the excess over the true entropy is the Kullback–Leibler divergence, which is non-negative and zero only when the distributions coincide. Mutual information measures how much observing one variable reduces uncertainty about another and, unlike correlation, detects non-linear dependence. These quantities give a unified language for experimental design: an experiment is valuable in proportion to the expected reduction in entropy over the hypotheses, which is the formal core of optimal experimental design and of active learning. Compression and understanding are the same phenomenon viewed from two directions, since a model that predicts a corpus well is precisely a short description of it.`,
  },
  {
    id: 'kb-022',
    title: 'Cognitive biases in the research process',
    field: 'Metascience',
    tags: ['bias', 'reasoning', 'heuristics', 'blinding'],
    text: `Researchers are subject to the biases they study. Confirmation bias directs attention toward supportive evidence and toward analytic choices that favour the preferred hypothesis. Hindsight bias makes exploratory findings feel predicted, which is why hypothesising after results are known is so easy to do without noticing. Anchoring fixes estimates near an initial value such as a pilot effect size. Availability makes vivid cases feel representative. The remedy is procedural rather than exhortative: blind analysis in which condition labels are scrambled until the pipeline is fixed, pre-registered analysis plans, adversarial collaboration with a colleague holding the opposite prior, red-teaming of the design before data collection, and standardised reporting checklists that make omissions visible. Institutions that reward the discovery of one's own errors produce fewer of them in print.`,
  },
  {
    id: 'kb-023',
    title: 'Time series and sequential data',
    field: 'Statistics',
    tags: ['time series', 'autocorrelation', 'stationarity', 'forecasting'],
    text: `Sequential observations violate the independence assumption of standard tests, and ignoring autocorrelation produces standard errors that are far too small. Stationarity — constant mean, variance and autocovariance structure — is the working assumption of classical models and is usually obtained by differencing or detrending. ARIMA models combine autoregressive memory, differencing, and moving-average error structure; state-space formulations generalise them and handle missing data naturally. Spurious regression between two independent random walks is a standard trap, resolved by testing for cointegration rather than by inspecting R squared. For forecasting, evaluation must use rolling-origin backtesting rather than random cross-validation folds, because random folds leak future information into training. Interrupted time series with a well-defined intervention point is one of the strongest quasi-experimental designs when randomisation is impossible.`,
  },
  {
    id: 'kb-024',
    title: 'Writing the research report',
    field: 'Scientific Writing',
    tags: ['writing', 'imrad', 'abstract', 'reporting'],
    text: `The IMRaD structure exists because it mirrors the logic of inquiry: introduction states the gap and the question, methods make the study repeatable, results present the evidence without interpretation, and discussion interprets, bounds, and situates it. A strong abstract states the problem in one sentence, the approach in one, the principal quantitative result with its uncertainty in one, and the implication in one. The introduction should end with the specific claim the paper will defend rather than a vague statement of interest. Methods should be written so that a competent stranger could reproduce the study without contacting the authors, which in computational work means version-pinned environments and released code. Limitations belong in the discussion stated plainly and specifically; a generic paragraph admitting that more research is needed conveys nothing and signals that the authors have not thought about failure modes.`,
  },
];

export const FIELDS = [...new Set(KNOWLEDGE.map((k) => k.field))];

export function knowledgeText() {
  return KNOWLEDGE.map((k) => `${k.title}. ${k.text}`).join('\n\n');
}
