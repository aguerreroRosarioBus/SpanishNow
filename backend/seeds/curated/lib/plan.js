// Turns the `plan` of a story JSON (seeds/content/stories/*.json) into lesson blocks and compares plans.
//
// plan = {
//   before:    [{ expression, role? }]                      expressions shown before the story (role: target|support|revisit, default target)
//   keyframes: [{ text, questionsAfter?: [questionText] }]  default: ONE keyframe with the whole story text
//   after:     ["full_story", "flashcards", "matching", "listen_repeat", { question }]   ordered; default: full_story, every question, flashcards, matching
//   later:     [{ expression, role: "revisit", story }]     reappearance of an expression in ANOTHER story (title)
// }
// Every section is optional. Questions are referenced by their text, expressions by their word and stories
// by their title, so the file never contains database ids.
const { randomUUID } = require('crypto');
const { normalizeKey } = require('./content');

const REINFORCEMENTS = ['flashcards', 'matching', 'listen_repeat'];
const DEFAULT_AFTER_REINFORCEMENTS = ['flashcards', 'matching'];

function lookup(map, value, what, story) {
  const found = map.get(normalizeKey(value));
  if (!found) throw new Error(`Story "${story.title}": unknown ${what} "${value}"`);
  return found;
}

/**
 * @param story   DB story row ({ id, title, text })
 * @param plan    plan from the JSON, or undefined for the default initial plan
 * @param refs    { questions: Map(normalised text -> {id, key, questionText}) in id order, vocabulary: Map(word -> {id}), stories: Map(title -> {id}) }
 */
function buildBlocks(story, plan, refs) {
  const isDefault = !plan;
  plan = plan || {};
  const keyframes = plan.keyframes || [{ text: story.text, required: true }];
  const after = plan.after || ['full_story', ...[...refs.questions.values()].map(q => ({ question: q.key })), ...DEFAULT_AFTER_REINFORCEMENTS];
  if (after.filter(item => item === 'full_story').length !== 1) throw new Error(`Story "${story.title}": plan.after needs exactly one "full_story"`);
  if (!keyframes.length) throw new Error(`Story "${story.title}": plan.keyframes cannot be empty`);

  const blocks = [];
  for (const item of plan.before || []) {
    const vocab = lookup(refs.vocabulary, item.expression, 'expression', story);
    blocks.push({ blockKey: randomUUID(), type: 'expression', phase: 'before', vocabularyId: vocab.id, vocabularyRole: item.role || 'target' });
  }
  let lastKeyframe = null;
  for (const kf of keyframes) {
    if (typeof kf.text !== 'string' || !kf.text.trim()) throw new Error(`Story "${story.title}": every keyframe needs text`);
    lastKeyframe = { blockKey: randomUUID(), type: 'keyframe', phase: 'during', text: kf.text, required: kf.required === true };
    blocks.push(lastKeyframe);
    for (const text of kf.questionsAfter || []) {
      blocks.push({ blockKey: randomUUID(), type: 'question', phase: 'during', questionId: lookup(refs.questions, text, 'question', story).id,
        contextBlockKey: lastKeyframe.blockKey });
    }
  }
  for (const item of after) {
    if (item === 'full_story' || REINFORCEMENTS.includes(item)) blocks.push({ blockKey: randomUUID(), type: item, phase: 'after' });
    else if (item && item.question) {
      blocks.push({ blockKey: randomUUID(), type: 'question', phase: 'after', questionId: lookup(refs.questions, item.question, 'question', story).id,
        contextBlockKey: lastKeyframe.blockKey });
    } else throw new Error(`Story "${story.title}": invalid plan.after item ${JSON.stringify(item)}`);
  }
  for (const item of plan.later || []) {
    const vocab = lookup(refs.vocabulary, item.expression, 'expression', story);
    const target = lookup(refs.stories, item.story, 'story', story);
    if (target.id === story.id) throw new Error(`Story "${story.title}": cannot schedule a reappearance in itself`);
    blocks.push({ blockKey: randomUUID(), type: 'expression', phase: 'later', vocabularyId: vocab.id,
      vocabularyRole: item.role || 'revisit', revisitStoryId: target.id });
  }
  return { blocks, isDefault };
}

/**
 * Order-sensitive, id-free description of the ACTIVE blocks of a plan; two plans with the same signature
 * teach the same lesson. `blocks` may be desired blocks (built above) or rows of a stored plan.

 */
function signature(blocks, { questionsById, vocabularyById, storiesById }) {
  const keyIndex = new Map();
  const active = blocks.filter(b => b.active !== false);
  active.filter(b => b.type === 'keyframe').forEach((b, i) => keyIndex.set(b.blockKey, i));
  return active.map(b => {
    switch (b.type) {
      case 'keyframe': return ['keyframe', (b.text || '').trim()];
      case 'question': {
        const question = (b.questionSnapshot && b.questionSnapshot.questionText) || (questionsById.get(b.questionId) || {}).questionText;
        return ['question', b.phase, question, keyIndex.get(b.contextBlockKey)];
      }
      case 'expression': {
        const word = (b.vocabularySnapshot && b.vocabularySnapshot.word) || (vocabularyById.get(b.vocabularyId) || {}).word;
        const target = b.revisitStoryId ? (storiesById.get(b.revisitStoryId) || {}).title : null;
        return ['expression', b.phase, word, b.vocabularyRole || 'target', target];
      }
      default: return [b.type, b.phase];
    }
  });
}

const sameSignature = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/**
 * True for a revision nobody has curated: one active keyframe, no expressions, no questions inside the narrative.
 * (The reinforcements are not compared: the original backfill took them from the legacy activity settings.)
 */
function isUncurated(blocks) {
  const active = blocks.filter(b => b.active !== false);
  return active.filter(b => b.type === 'keyframe').length === 1 &&
    !active.some(b => b.type === 'expression' || (b.type === 'question' && b.phase !== 'after'));
}

module.exports = { buildBlocks, signature, sameSignature, isUncurated };
