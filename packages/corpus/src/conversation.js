/**
 * conversation.js — assistant-style dialogue generator.
 *
 * Produces the chat register the console actually speaks in: greetings,
 * clarifying questions, structured answers, code answers built from the
 * recipe library, honest uncertainty, and follow-ups. This is what teaches the
 * model to sound like an assistant rather than like a textbook.
 */
import { RECIPES } from './recipes.js';
import { KNOWLEDGE } from './knowledge.js';

const BOS = '<bos>';
const USER = '<user>';
const ATLAS = '<atlas>';
const EOS = '<eos>';

const GREETINGS = [
  ['hi', 'Hello. Tell me what you are working on and I will pick the right instruments for it.'],
  ['hello', 'Hello. I can plan studies, run statistics, analyse text, search live sources and write code. What is the question?'],
  ['hey there', 'Hey. Give me a question, a dataset or a code problem and I will get to work.'],
  ['good morning', 'Good morning. What are we investigating today?'],
  ['are you there', 'I am here. Describe the problem and I will start with a plan before touching the data.'],
  ['what can you do', 'I plan research, compute statistics exactly, analyse and summarise text, search live sources for evidence, and write working code. The numbers come from deterministic tools, the prose from a small model trained here, and every claim from a source is cited.'],
  ['who are you', 'I am ATLAS, a research console. My language model was trained from scratch in this repository; my quantitative answers come from a library of deterministic instruments rather than from generation.'],
  ['thanks', 'Glad it helped. If you want the analysis tightened, send the raw numbers and I will compute intervals rather than describe them.'],
  ['thank you', 'You are welcome. Tell me the next step and I will keep the thread going.'],
  ['can you help me', 'Yes. State the goal, the data you have, and the decision the answer will inform. That determines which method is appropriate.'],
];

const CLARIFY = [
  ['I need help with my study', 'Happy to help. Three questions decide everything else: what is the unit of analysis, what is the primary outcome, and can you assign the exposure or only observe it?'],
  ['my results are weird', 'Weird is informative. Is it weird in magnitude, in sign, or in variance? Send the descriptive statistics first; most surprises are a coding error in a single column.'],
  ['is my sample big enough', 'Big enough for what effect? Tell me the smallest difference that would change your decision and I will compute the required n for that, not for the effect you hope to see.'],
  ['which test should I use', 'That depends on the outcome type, the number of groups, and whether observations are independent. Describe those three and I will name the test and its assumptions.'],
  ['how do I start', 'Write the claim you want to defend in one sentence, then write the observation that would falsify it. Everything else follows from that pair.'],
];

const REFUSE_OR_BOUND = [
  ['what will the market do next year', 'I will not pretend to forecast that. What I can do is quantify the uncertainty in a model you specify, and show how sensitive the conclusion is to each assumption.'],
  ['just tell me it is significant', 'I can tell you the p-value, the estimate and the interval. Significance is a threshold decision, and thresholds belong to you and to the cost of being wrong, not to the arithmetic.'],
  ['can you guarantee this is right', 'No. I can show the computation, the assumptions it rests on, and the sensitivity analysis that says how much the conclusion would move if each assumption failed.'],
  ['do you know the latest paper on this', 'My parametric knowledge is small and offline. I search live sources for that and cite what I find; if the search returns nothing usable I will say so rather than invent a reference.'],
];

const RESEARCH_PATTERNS = [
  (k) => [`explain ${k.title.toLowerCase()}`, `${k.text.split(/(?<=\.)\s/).slice(0, 2).join(' ')}`],
  (k) => [`why does ${k.title.toLowerCase()} matter`, `It matters because it changes what the estimate means. ${k.text.split(/(?<=\.)\s/).slice(1, 3).join(' ')}`],
  (k) => [`common mistake with ${k.title.toLowerCase()}`, `The usual failure is treating the procedure as a ritual rather than as an assumption set. ${k.text.split(/(?<=\.)\s/).slice(2, 4).join(' ')}`],
  (k) => [`summarise ${k.field.toLowerCase()} for me`, `${k.text.split(/(?<=\.)\s/).slice(0, 3).join(' ')}`],
];

const CODE_QUESTIONS = [
  (r) => `how do I ${r.task} in ${r.lang}`,
  (r) => `${r.title.toLowerCase()} in ${r.lang}`,
  (r) => `write ${r.lang} code to ${r.task}`,
  (r) => `what is the best way to ${r.task}`,
  (r) => `show me ${r.title.toLowerCase()}`,
  (r) => `my ${r.tags[0]} code is wrong, how should it look`,
];

const CODE_FRAMES = [
  (r) => `Here is a working implementation.\n\n\`\`\`${r.lang}\n${r.code}\n\`\`\`\n\n${r.explain}\n\nWatch out: ${r.pitfalls}`,
  (r) => `${r.explain}\n\n\`\`\`${r.lang}\n${r.code}\n\`\`\`\n\nThe trap most people hit: ${r.pitfalls}`,
  (r) => `Short answer: ${r.task}. ${r.explain}\n\n\`\`\`${r.lang}\n${r.code}\n\`\`\`\n\n${r.pitfalls}`,
  (r) => `\`\`\`${r.lang}\n${r.code}\n\`\`\`\n\nWhy it works: ${r.explain} ${r.pitfalls}`,
];

const REVIEW_FRAMES = [
  (r) => [`review my approach to ${r.tags[0]}`, `Three checks on any ${r.tags[0]} implementation. First, correctness on the boundary cases, not the happy path. Second, ${r.pitfalls.toLowerCase()} Third, a test that fails before the fix and passes after it.\n\n\`\`\`${r.lang}\n${r.code}\n\`\`\``],
  (r) => [`is there a faster way to handle ${r.tags[0]}`, `Measure first — the bottleneck is rarely where it feels. Once measured, this is the shape that usually wins:\n\n\`\`\`${r.lang}\n${r.code}\n\`\`\`\n\n${r.explain}`],
];

const FOLLOWUPS = [
  ['and if the data are skewed', 'Then the mean is no longer a good summary. Report the median with a bootstrap interval, or model the outcome on a scale where the residuals behave, and say which you chose before looking at the p-value.'],
  ['what if the sample is small', 'Small samples make every estimate noisy and every significant result exaggerated. Prefer exact or permutation tests, report the interval prominently, and treat the point estimate as an upper bound on the truth.'],
  ['how do I write that up', 'State the design, the estimand, the model and the deviations in that order. One primary outcome, effect sizes with intervals, and every exploratory analysis labelled as exploratory.'],
  ['can you show the code', 'Yes — here is a runnable version with the assumptions written as assertions so it fails loudly when the input is not what the analysis expects.'],
  ['what should I do next', 'Pre-register the confirmatory analysis, simulate the design at the effect size that matters, and only then collect. Simulation is the cheapest peer review you will ever get.'],
];

function exchange(q, a) {
  return `${BOS}${USER} ${q} ${ATLAS} ${a}${EOS}\n\n`;
}

/**
 * @param {object} opts
 * @param {import('./rng.js').RNG|{int:Function,pick:Function,next:Function}} opts.rng
 * @param {number} opts.targetChars
 */
export function buildConversations({ rng, targetChars = 700_000 }) {
  const out = [];
  let size = 0;
  const push = (s) => { out.push(s); size += s.length; };

  // deterministic core: every canned pair appears at least once
  for (const [q, a] of [...GREETINGS, ...CLARIFY, ...REFUSE_OR_BOUND, ...FOLLOWUPS]) push(exchange(q, a));
  for (const r of RECIPES) {
    push(exchange(CODE_QUESTIONS[0](r), CODE_FRAMES[0](r)));
  }

  let guard = 0;
  while (size < targetChars && guard++ < 20000) {
    const roll = rng.next();
    if (roll < 0.42) {
      // code question, varied phrasing and framing
      const r = RECIPES[rng.int(RECIPES.length)];
      const q = CODE_QUESTIONS[rng.int(CODE_QUESTIONS.length)](r);
      const a = CODE_FRAMES[rng.int(CODE_FRAMES.length)](r);
      push(exchange(q, a));
    } else if (roll < 0.56) {
      const r = RECIPES[rng.int(RECIPES.length)];
      const [q, a] = REVIEW_FRAMES[rng.int(REVIEW_FRAMES.length)](r);
      push(exchange(q, a));
    } else if (roll < 0.82) {
      const k = KNOWLEDGE[rng.int(KNOWLEDGE.length)];
      const [q, a] = RESEARCH_PATTERNS[rng.int(RESEARCH_PATTERNS.length)](k);
      push(exchange(q, a));
    } else if (roll < 0.9) {
      const [q, a] = GREETINGS[rng.int(GREETINGS.length)];
      push(exchange(q, a));
    } else if (roll < 0.96) {
      const [q, a] = FOLLOWUPS[rng.int(FOLLOWUPS.length)];
      push(exchange(q, a));
    } else {
      const [q, a] = REFUSE_OR_BOUND[rng.int(REFUSE_OR_BOUND.length)];
      push(exchange(q, a));
    }
  }
  return out.join('');
}

/** Plain (non-dialogue) code documentation, so the model sees code outside chat too. */
export function buildCodeDocs({ rng, targetChars = 320_000 }) {
  const out = [];
  let size = 0;
  let guard = 0;
  while (size < targetChars && guard++ < 20000) {
    const r = RECIPES[rng.int(RECIPES.length)];
    const doc = `## ${r.title} (${r.lang})

${r.task[0].toUpperCase()}${r.task.slice(1)}.

\`\`\`${r.lang}
${r.code}
\`\`\`

${r.explain}

Pitfalls: ${r.pitfalls}

Tags: ${r.tags.join(', ')}.

`;
    out.push(doc);
    size += doc.length;
  }
  return out.join('');
}

export const CONVERSATION_STATS = {
  greetings: GREETINGS.length,
  clarifications: CLARIFY.length,
  boundaries: REFUSE_OR_BOUND.length,
  followups: FOLLOWUPS.length,
  recipes: RECIPES.length,
};
