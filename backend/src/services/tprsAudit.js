// TPRS coherence audit: pure logic, no database and no files (see src/db/auditTprs.js for the CLI).
//
// Input model (the same for the content files and for the database, built by `fromContent` / `fromBlocks`):
//   { vocabulary: [{ word }],
//     stories: [{ id, title, unit: { id, order, title }, order, text,
//                 questions: [{ text, type, options, correct }],
//                 plan: { before:    [{ expression, role }],
//                         keyframes: [{ text, questions: [questionText] }],      questions asked right after the keyframe
//                         after:     [{ type: 'full_story'|'flashcards'|'matching'|'listen_repeat'|'question', question? }],
//                         later:     [{ expression, role, storyId?, storyTitle? }] } }] }
// Rules (error = ✗ breaks the lesson design, warning = ⚠ worth a look): see RULES and docs/database.md ("Auditoría TPRS").
const { MOJIBAKE, normalizeKey } = require('../../seeds/curated/lib/content');

const RULES = [
  { id: 1, key: 'targets', label: 'Estructuras objetivo' },
  { id: 2, key: 'keyframes', label: 'Keyframes comprensibles' },
  { id: 3, key: 'during', label: 'Preguntas durante la narración' },
  { id: 4, key: 'after', label: 'Sin cuestionario final' },
  { id: 5, key: 'revisit', label: 'Reaparición' },
  { id: 6, key: 'vocabulary', label: 'Vocabulario y codificación' },
  { id: 7, key: 'reinforcements', label: 'Lectura y refuerzos' }
];
const SYMBOLS = { ok: '✓', warning: '⚠', error: '✗' };
const REINFORCEMENTS = ['flashcards', 'matching', 'listen_repeat'];
const MAX_KEYFRAME_WORDS = 45;
const MIN_KEYFRAME_WORDS = 3;

// ---------------------------------------------------------------- text helpers

/** Lower-case, accent-free words of a text ("¿Cómo te llamas?" -> ["como", "te", "llamas"]). */
function tokens(text) {
  return normalizeKey(text || '').replace(/[^a-z0-9ñ\s]/g, ' ').split(/\s+/).filter(Boolean);
}

/** Crude stem that tolerates simple inflection: number, gender and person endings (gato/gatos/gata, cuesta/cuestan, tiene/tienen). */
function stem(token) {
  return token.length > 3 ? token.replace(/(es|en|as|an|os|a|e|o|s|n)$/, '') : token;
}

/** True when the words of `expression` appear consecutively in `text`, ignoring accents, case and simple inflection. */
function containsExpression(text, expression) {
  const wanted = tokens(expression).map(stem);
  if (!wanted.length) return false;
  const have = tokens(text).map(stem);
  for (let i = 0; i + wanted.length <= have.length; i++) {
    if (wanted.every((w, j) => have[i + j] === w)) return true;
  }
  return false;
}

const wordCount = text => (String(text || '').match(/\S+/g) || []).length;
const squash = text => String(text || '').replace(/\s+/g, '');
const key = normalizeKey;

const STOPWORDS = new Set(('el la los las un una unos unas de del al a en con por para y o e u que qué quien quién quienes cual cuál cuales ' +
  'como cómo donde dónde cuando cuándo cuanto cuánto cuantos cuántos cuantas cuántas es son esta está estan están ser estar hay ' +
  'se me te le lo les su sus mi tu yo tú él ella ellos ellas si sí no ni pero mas más muy ahora').split(' ').map(w => tokens(w)[0]));

/** Stems of the words that carry meaning (names, nouns, verbs); used to locate an answer inside the narration. */
function contentStems(text) {
  return [...new Set(tokens(text).filter(t => !STOPWORDS.has(t) && t.length >= 3).map(stem))];
}

// ---------------------------------------------------------------- rule helpers

const level = (lvl, message) => ({ level: lvl, message });
const error = message => level('error', message);
const warning = message => level('warning', message);

function result(rule, findings, info) {
  const status = findings.some(f => f.level === 'error') ? 'error' : findings.length ? 'warning' : 'ok';
  return { id: rule.id, key: rule.key, label: rule.label, status, info: info || '', findings };
}

const quoted = list => list.map(x => `«${x}»`).join(', ');

function ruleTargets(story) {
  const rule = RULES[0];
  const findings = [];
  const targets = [...new Map((story.plan.before || []).filter(b => (b.role || 'target') === 'target').map(b => [key(b.expression), b.expression])).values()];
  if (targets.length === 0) findings.push(error('no hay expresiones objetivo en «antes» (se esperan 2 o 3)'));
  else if (targets.length > 4) findings.push(error(`${targets.length} expresiones objetivo (se esperan 2 o 3)`));
  else if (targets.length === 1) findings.push(warning('solo 1 expresión objetivo (se esperan 2 o 3)'));
  else if (targets.length === 4) findings.push(warning('4 expresiones objetivo (se esperan 2 o 3)'));
  for (const t of targets) if (!containsExpression(story.text, t)) findings.push(error(`la expresión objetivo «${t}» no aparece en el texto de la historia`));
  return result(rule, findings, `${targets.length} objetivo${targets.length === 1 ? '' : 's'}${targets.length ? `: ${targets.join(', ')}` : ''}`);
}

function ruleKeyframes(story) {
  const rule = RULES[1];
  const findings = [];
  const keyframes = story.plan.keyframes || [];
  if (keyframes.length === 0) findings.push(error('la historia no tiene keyframes'));
  else if (keyframes.length === 1) findings.push(warning('un solo keyframe (se esperan 2 o más; el texto va entero)'));
  keyframes.forEach((kf, i) => {
    const n = wordCount(kf.text);
    if (n > MAX_KEYFRAME_WORDS) findings.push(warning(`keyframe ${i + 1}: ${n} palabras (máximo ${MAX_KEYFRAME_WORDS})`));
    if (n < MIN_KEYFRAME_WORDS) findings.push(warning(`keyframe ${i + 1}: ${n} palabras (mínimo ${MIN_KEYFRAME_WORDS})`));
  });
  if (keyframes.length && squash(keyframes.map(k => k.text).join('')) !== squash(story.text)) {
    findings.push(error('la unión de los keyframes no coincide con el texto de la historia (salvo espacios)'));
  }
  const counts = keyframes.map(k => wordCount(k.text));
  return result(rule, findings, `${keyframes.length} keyframe(s)${counts.length ? ` de ${counts.join(', ')} palabras` : ''}`);
}

function checkQuestionFormat(q) {
  const findings = [];
  const label = `«${q.text}»`;
  const options = Array.isArray(q.options) ? q.options : [];
  if (q.type === 'yes_no') {
    if (!['si', 'no'].includes(key(q.correct || ''))) findings.push(error(`${label}: pregunta sí/no con respuesta correcta «${q.correct}» (debe ser Sí o No)`));
    if (options.length && !(options.length === 2 && ['si', 'no'].every(o => options.some(x => key(x) === o)))) {
      findings.push(warning(`${label}: las opciones de una pregunta sí/no deberían ser ["Sí","No"]`));
    }
  } else if (q.type === 'choice') {
    if (!options.some(o => key(o) === key(q.correct || ''))) findings.push(error(`${label}: la respuesta correcta «${q.correct}» no está entre las opciones`));
    else if (options.length > 2) findings.push(warning(`${label}: elección entre ${options.length} opciones (mejor sí/no o dos opciones)`));
    else if (options.length < 2) findings.push(warning(`${label}: elección con ${options.length} opción (se esperan dos)`));
  } else {
    findings.push(warning(`${label}: tipo «${q.type}» (mejor sí/no o elección entre dos opciones)`));
  }
  return findings;
}

function ruleDuring(story) {
  const rule = RULES[2];
  const findings = [];
  const keyframes = story.plan.keyframes || [];
  const byText = new Map(story.questions.map(q => [key(q.text), q]));
  const stems = keyframes.map(k => new Set(tokens(k.text).map(stem)));
  let asked = 0;
  keyframes.forEach((kf, k) => {
    for (const text of kf.questions || []) {
      asked++;
      const q = byText.get(key(text));
      if (!q) { findings.push(error(`«${text}»: la pregunta no existe en la historia`)); continue; }
      findings.push(...checkQuestionFormat(q));
      // Does the keyframe it follows contain what it asks about? yes/no: the question's own words; choice: the correct answer.
      const probe = q.type === 'yes_no' ? q.text : (q.correct || q.text);
      const words = contentStems(probe);
      const found = stems.map((set, i) => words.some(w => set.has(w)) ? i : -1).filter(i => i >= 0);
      if (found.includes(k)) continue;
      if (found.length && found.every(i => i > k)) {
        findings.push(error(`«${q.text}» va tras el keyframe ${k + 1} pero lo que pregunta aparece solo después (keyframe ${found[0] + 1})`));
      } else {
        findings.push(warning(`«${q.text}»: no se pudo verificar que el keyframe ${k + 1} contenga la respuesta`));
      }
    }
  });
  if (asked === 0) findings.push(keyframes.length >= 2 ? error('no hay preguntas de comprensión durante la narración') : warning('no hay preguntas durante la narración'));
  return result(rule, findings, `${asked} pregunta(s) durante`);
}

function ruleAfter(story) {
  const rule = RULES[3];
  const asked = (story.plan.after || []).filter(a => a.type === 'question').length;
  const findings = asked > 1 ? [warning(`${asked} preguntas al final (el cuestionario final no debería ser obligatorio; máximo 1)`)] : [];
  return result(rule, findings, `${asked} pregunta(s) al final`);
}

function ruleRevisit(story, ctx) {
  const rule = RULES[4];
  const findings = [];
  const later = story.plan.later || [];
  const index = ctx.indexById.get(story.id);
  if (index === ctx.stories.length - 1) return result(rule, [], 'última historia del curso: no necesita reaparición');
  let forward = 0;
  for (const item of later) {
    const dest = item.storyId != null ? ctx.stories[ctx.indexById.get(item.storyId)] : ctx.stories[ctx.indexByTitle.get(key(item.storyTitle || ''))];
    if (!dest) { findings.push(error(`«${item.expression}»: la historia destino «${item.storyTitle || item.storyId}» no existe`)); continue; }
    const destIndex = ctx.indexById.get(dest.id);
    if (dest.id === story.id) { findings.push(error(`«${item.expression}»: reaparece en la misma historia`)); continue; }
    if (destIndex < index) { findings.push(error(`«${item.expression}»: reaparece en una historia anterior («${dest.title}»)`)); continue; }
    forward++;
    if (!containsExpression(dest.text, item.expression)) findings.push(error(`«${item.expression}»: no aparece en el texto de «${dest.title}»`));
    const declared = (dest.plan.before || []).some(b => key(b.expression) === key(item.expression) && b.role === 'revisit');
    if (!declared) findings.push(warning(`«${item.expression}»: «${dest.title}» no la incluye en «antes» con rol revisit`));
  }
  if (!later.length) findings.push(warning('no programa ninguna reaparición en una historia posterior'));
  return result(rule, findings, `${forward} reaparición(es) hacia historias posteriores`);
}

function ruleVocabulary(story, ctx) {
  const rule = RULES[5];
  const findings = [];
  const used = [...(story.plan.before || []), ...(story.plan.later || [])].map(b => b.expression);
  for (const word of [...new Set(used)]) if (!ctx.vocabulary.has(key(word))) findings.push(error(`«${word}» no está en el vocabulario del curso`));
  const texts = [['título', story.title], ['texto', story.text], ...(story.plan.keyframes || []).map((k, i) => [`keyframe ${i + 1}`, k.text]),
    ...story.questions.flatMap(q => [['pregunta', q.text], ['respuesta', q.correct], ...(q.options || []).map(o => ['opción', o])]),
    ...used.map(w => ['expresión', w])];
  const broken = [...new Set(texts.filter(([, t]) => typeof t === 'string' && MOJIBAKE.test(t)).map(([where, t]) => `${where} «${t.slice(0, 40)}»`))];
  for (const item of broken) findings.push(error(`codificación rota (mojibake) en ${item}`));
  return result(rule, findings, `${new Set(used.map(key)).size} expresión(es) usada(s)`);
}

function ruleReinforcements(story) {
  const rule = RULES[6];
  const findings = [];
  const after = story.plan.after || [];
  const full = after.filter(a => a.type === 'full_story').length;
  if (full !== 1) findings.push(error(`${full} lecturas completas al final (debe haber exactamente una)`));
  const reinforcements = after.filter(a => REINFORCEMENTS.includes(a.type)).map(a => a.type);
  if (!reinforcements.length) findings.push(warning('sin refuerzos (flashcards, matching o listen_repeat)'));
  return result(rule, findings, `lectura completa: ${full}; refuerzos: ${reinforcements.join(', ') || 'ninguno'}`);
}

// ---------------------------------------------------------------- audit

/** Orders the stories of a course (unit order, story order, id) and audits each one. */
function auditCourse(model) {
  const stories = [...model.stories].sort((a, b) =>
    (a.unit.order - b.unit.order) || (a.unit.id - b.unit.id) || (a.order - b.order) || (a.id - b.id));
  const ctx = {
    stories,
    vocabulary: new Set(model.vocabulary.map(v => key(v.word))),
    indexById: new Map(stories.map((s, i) => [s.id, i])),
    indexByTitle: new Map(stories.map((s, i) => [key(s.title), i]))
  };
  const audited = stories.map(story => {
    const rules = [ruleTargets(story), ruleKeyframes(story), ruleDuring(story), ruleAfter(story),
      ruleRevisit(story, ctx), ruleVocabulary(story, ctx), ruleReinforcements(story)];
    return { id: story.id, title: story.title, unit: { id: story.unit.id, order: story.unit.order, title: story.unit.title }, order: story.order, rules };
  });
  return { stories: audited, summary: summarize(audited) };
}

function summarize(stories) {
  const count = lvl => stories.reduce((n, s) => n + s.rules.reduce((m, r) => m + r.findings.filter(f => f.level === lvl).length, 0), 0);
  const byRule = {};
  for (const r of RULES) byRule[r.key] = { error: 0, warning: 0, ok: 0 };
  for (const s of stories) for (const r of s.rules) byRule[r.key][r.status]++;
  return {
    stories: stories.length,
    errors: count('error'),
    warnings: count('warning'),
    storiesWithErrors: stories.filter(s => s.rules.some(r => r.status === 'error')).length,
    storiesWithWarnings: stories.filter(s => !s.rules.some(r => r.status === 'error') && s.rules.some(r => r.status === 'warning')).length,
    storiesClean: stories.filter(s => s.rules.every(r => r.status === 'ok')).length,
    byRule
  };
}

// ---------------------------------------------------------------- model builders

const DEFAULT_AFTER_REINFORCEMENTS = ['flashcards', 'matching'];

/**
 * Same reading of the story JSON `plan` as seeds/curated/lib/plan.js buildBlocks: every section is optional; without
 * `keyframes` the whole text is one keyframe; without `after`: full_story, every question, flashcards, matching.
 */
function planFromContent(story) {
  const plan = story.plan || {};
  const keyframes = plan.keyframes || [{ text: story.text }];
  const after = plan.after || ['full_story', ...story.questions.map(q => ({ question: q.text })), ...DEFAULT_AFTER_REINFORCEMENTS];
  return {
    before: (plan.before || []).map(b => ({ expression: b.expression, role: b.role || 'target' })),
    keyframes: keyframes.map(k => ({ text: k.text, questions: [...(k.questionsAfter || [])] })),
    after: after.map(item => (item && item.question ? { type: 'question', question: item.question } : { type: item })),
    later: (plan.later || []).map(l => ({ expression: l.expression, role: l.role || 'revisit', storyTitle: l.story }))
  };
}

/** `content` = loadContent() result: { course, units, stories }. */
function fromContent(content) {
  const unitById = new Map(content.units.map(u => [u.id, u]));
  return {
    course: content.course,
    vocabulary: content.units.flatMap(u => u.vocabulary.map(v => ({ word: v.word }))),
    stories: content.stories.map(s => {
      const unit = unitById.get(s.unitId);
      return {
        id: s.id, title: s.title, unit: { id: unit.id, order: unit.order, title: unit.title }, order: s.order, text: s.text,
        questions: s.questions.map(q => ({ text: q.text, type: q.type, options: q.options, correct: q.correct })),
        plan: planFromContent(s)
      };
    })
  };
}

/**
 * Plan of a stored revision. `blocks` are lesson_blocks rows (any order; `position` is used), `lookups` =
 * { questionsById: Map(id -> {questionText}), vocabularyById: Map(id -> {word}) } for blocks without a snapshot.
 * Inactive blocks are ignored.
 */
function planFromBlocks(blocks, { questionsById = new Map(), vocabularyById = new Map() } = {}) {
  const active = blocks.filter(b => b.active !== false).sort((a, b) => a.position - b.position);
  const wordOf = b => (b.vocabularySnapshot && b.vocabularySnapshot.word) || (vocabularyById.get(b.vocabularyId) || {}).word || `#${b.vocabularyId}`;
  const questionOf = b => (b.questionSnapshot && b.questionSnapshot.questionText) || (questionsById.get(b.questionId) || {}).questionText || `#${b.questionId}`;
  const plan = { before: [], keyframes: [], after: [], later: [] };
  const byKey = new Map();
  for (const b of active) {
    if (b.type === 'keyframe') {
      const kf = { text: b.text || '', questions: [] };
      plan.keyframes.push(kf);
      byKey.set(b.blockKey, kf);
    } else if (b.type === 'expression' && b.phase === 'before') plan.before.push({ expression: wordOf(b), role: b.vocabularyRole || 'target' });
    else if (b.type === 'expression' && b.phase === 'later') plan.later.push({ expression: wordOf(b), role: b.vocabularyRole || 'revisit', storyId: b.revisitStoryId });
    else if (b.type === 'question' && b.phase === 'during') {
      const kf = byKey.get(b.contextBlockKey) || plan.keyframes[plan.keyframes.length - 1];
      if (kf) kf.questions.push(questionOf(b));
    } else if (b.phase === 'after') plan.after.push(b.type === 'question' ? { type: 'question', question: questionOf(b) } : { type: b.type });
  }
  return plan;
}

module.exports = {
  RULES, SYMBOLS, auditCourse, summarize, fromContent, planFromContent, planFromBlocks,
  containsExpression, tokens, stem, contentStems, wordCount
};
