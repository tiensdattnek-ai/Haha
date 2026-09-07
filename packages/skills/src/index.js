/**
 * @atlas/skills — assembled registry.
 */
import { SkillRegistry, CATEGORIES, Skill } from './registry.js';
import research from './skills.research.js';
import stats from './skills.stats.js';
import math from './skills.math.js';
import text from './skills.text.js';
import data from './skills.data.js';
import neural from './skills.neural.js';

export function createRegistry() {
  const reg = new SkillRegistry();
  reg.registerAll([...research, ...stats, ...math, ...text, ...data, ...neural]);
  return reg;
}

export { SkillRegistry, CATEGORIES, Skill };
export * from './registry.js';
export * from './mathcore.js';
export * from './statscore.js';
export * from './textcore.js';
