import { LessonBlock } from '../../../core/services/lesson-plan.service';
import { Question, Vocabulary } from '../../../core/models/course.model';

/**
 * Chequeo TPRS en vivo del compositor. Refleja (de forma simplificada y sin bloquear) las reglas de
 * backend/src/services/tprsAudit.js: R1 objetivos, R2 keyframes, R3 preguntas durante, R4 sin cuestionario final,
 * R5 reaparición y R7 lectura completa.
 */
export interface ChecklistItem {
  id: 'targets' | 'keyframes' | 'during' | 'after' | 'revisit' | 'full_story';
  rule: string;
  label: string;
  ok: boolean;
  /** Qué falta cuando no se cumple (vacío si está cumplido). */
  hint: string;
  /** Estado actual en una línea (p. ej. «2 objetivos»). */
  detail: string;
}

export interface ChecklistInput {
  blocks: LessonBlock[];
  vocabulary: Vocabulary[];
  questions: Question[];
  /** Historia que se está componiendo (la reaparición debe apuntar a otra). */
  storyId?: number;
}

const MAX_KEYFRAME_WORDS = 45;
const MIN_KEYFRAME_WORDS = 3;

const normalizeKey = (value: string): string => String(value ?? '').trim().toLocaleLowerCase('es').normalize('NFD').replace(/[̀-ͯ]/g, '');
const tokens = (text: string): string[] => normalizeKey(text).replace(/[^a-z0-9ñ\s]/g, ' ').split(/\s+/).filter(Boolean);
const stem = (token: string): string => (token.length > 3 ? token.replace(/(es|en|as|an|os|a|e|o|s|n)$/, '') : token);
const wordCount = (text: string | null | undefined): number => (String(text ?? '').match(/\S+/g) || []).length;

const STOPWORDS = new Set(('el la los las un una unos unas de del al a en con por para y o e u que qué quien quién quienes cual cuál cuales ' +
  'como cómo donde dónde cuando cuándo cuanto cuánto cuantos cuántos cuantas cuántas es son esta está estan están ser estar hay ' +
  'se me te le lo les su sus mi tu yo tú él ella ellos ellas si sí no ni pero mas más muy ahora').split(' ').map(w => tokens(w)[0]));

const contentStems = (text: string): string[] => [...new Set(tokens(text).filter(t => !STOPWORDS.has(t) && t.length >= 3).map(stem))];

/** True si las palabras de `expression` aparecen seguidas en `text` (sin acentos, mayúsculas ni flexión simple). */
export function containsExpression(text: string, expression: string): boolean {
  const wanted = tokens(expression).map(stem);
  if (!wanted.length) return false;
  const have = tokens(text).map(stem);
  for (let i = 0; i + wanted.length <= have.length; i++) {
    if (wanted.every((w, j) => have[i + j] === w)) return true;
  }
  return false;
}

/** Texto de la historia hasta ahora: keyframes activos con texto, recortados y unidos con «\n\n» (igual que al publicar). */
export function storyTextFromBlocks(blocks: LessonBlock[]): string {
  return blocks.filter(b => b.type === 'keyframe' && b.active).map(b => (b.text ?? '').trim()).filter(Boolean).join('\n\n');
}

const plural = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`;

export function tprsChecklist(input: ChecklistInput): ChecklistItem[] {
  const { blocks, vocabulary, questions } = input;
  const active = blocks.filter(b => b.active);
  const text = storyTextFromBlocks(blocks);
  const wordOf = (b: LessonBlock): string => b.vocabularySnapshot?.word || vocabulary.find(v => v.id === b.vocabularyId)?.word || '';
  const questionOf = (b: LessonBlock) => {
    const found = questions.find(q => q.id === b.questionId);
    return {
      text: found?.questionText ?? b.questionSnapshot?.questionText ?? b.text ?? '',
      type: found?.answerType ?? b.questionSnapshot?.answerType ?? '',
      options: found?.options ?? b.questionSnapshot?.options ?? [],
      correct: found?.correctAnswer ?? ''
    };
  };

  // R1: 2–3 expresiones objetivo en «Antes», todas presentes en el texto.
  const targets = [...new Map(active.filter(b => b.type === 'expression' && b.phase === 'before' && (b.vocabularyRole ?? 'target') === 'target' && wordOf(b))
    .map(b => [normalizeKey(wordOf(b)), wordOf(b)] as const)).values()];
  const missing = targets.filter(t => !containsExpression(text, t));
  let targetsHint = '';
  if (targets.length < 2) targetsHint = 'Añade 2 o 3 expresiones objetivo en «Antes» (o marca una en el texto del fragmento).';
  else if (targets.length > 3) targetsHint = 'Reduce a 2 o 3 expresiones objetivo.';
  else if (missing.length) targetsHint = `Estas expresiones aún no aparecen en la historia: ${missing.map(m => `«${m}»`).join(', ')}.`;

  // R2: keyframes con texto comprensible (2 o más; de 3 a 45 palabras cada uno).
  const keyframes = active.filter(b => b.type === 'keyframe');
  const filled = keyframes.filter(b => (b.text ?? '').trim());
  const sized = filled.map(b => wordCount(b.text));
  let keyframesHint = '';
  if (keyframes.length > filled.length) keyframesHint = 'Hay fragmentos vacíos: escribe su texto o elimínalos.';
  else if (filled.length < 2) keyframesHint = 'Divide la historia en 2 o más fragmentos (usa «＋ Seguir la historia»).';
  else if (sized.some(n => n > MAX_KEYFRAME_WORDS)) keyframesHint = `Algún fragmento supera las ${MAX_KEYFRAME_WORDS} palabras; pártelo.`;
  else if (sized.some(n => n < MIN_KEYFRAME_WORDS)) keyframesHint = `Algún fragmento tiene menos de ${MIN_KEYFRAME_WORDS} palabras.`;

  // R3: preguntas sí/no o de dos opciones, después del keyframe que las responde.
  const during = active.filter(b => b.type === 'question' && b.phase === 'during');
  const problems: string[] = [];
  during.forEach(b => {
    const q = questionOf(b);
    const label = q.text ? `«${q.text}»` : 'Una pregunta sin elegir';
    if (!b.questionId) { problems.push(`${label}: elige o crea la pregunta.`); return; }
    if (q.type !== 'yes_no' && !(q.type === 'choice' && q.options.length === 2)) problems.push(`${label}: usa una pregunta Sí/No o de dos opciones.`);
    const at = blocks.findIndex(x => x.blockKey === b.blockKey);
    const frames = blocks.map((x, i) => ({ x, i })).filter(({ x }) => x.type === 'keyframe' && x.active);
    const context = frames.find(({ x }) => x.blockKey === b.contextBlockKey);
    if (!context || context.i > at) { problems.push(`${label}: colócala después del fragmento al que se refiere.`); return; }
    const words = contentStems(q.type === 'yes_no' ? q.text : q.correct || q.text);
    const found = frames.filter(({ x }) => { const set = new Set(tokens(x.text ?? '').map(stem)); return words.some(w => set.has(w)); }).map(({ x }) => x.blockKey);
    if (found.length && !found.includes(context.x.blockKey) && frames.findIndex(f => f.x.blockKey === found[0]) > frames.findIndex(f => f.x.blockKey === context.x.blockKey)) {
      problems.push(`${label}: lo que pregunta aparece solo en un fragmento posterior.`);
    }
  });
  const duringHint = !during.length ? 'Añade preguntas Sí/No o de dos opciones bajo los fragmentos («＋ Pregunta sobre esto»).' : problems[0] ?? '';

  // R4: sin cuestionario final (como mucho 1 pregunta en «Después»).
  const finalQuestions = active.filter(b => b.type === 'question' && b.phase === 'after').length;

  // R5: al menos una expresión de «Más adelante» con historia futura.
  const revisits = active.filter(b => b.type === 'expression' && b.phase === 'later' && b.revisitStoryId && b.revisitStoryId !== input.storyId).length;

  // R7: una única lectura completa activa.
  const full = active.filter(b => b.type === 'full_story').length;

  return [
    { id: 'targets', rule: 'R1', label: '2–3 expresiones objetivo que aparecen en el texto', ok: !targetsHint, hint: targetsHint, detail: plural(targets.length, 'objetivo', 'objetivos') },
    { id: 'keyframes', rule: 'R2', label: 'Fragmentos con texto comprensible', ok: !keyframesHint, hint: keyframesHint, detail: plural(filled.length, 'fragmento', 'fragmentos') },
    { id: 'during', rule: 'R3', label: 'Preguntas Sí/No o de dos opciones tras su fragmento', ok: !duringHint, hint: duringHint, detail: plural(during.length, 'pregunta', 'preguntas') },
    { id: 'after', rule: 'R4', label: 'Sin cuestionario final', ok: finalQuestions <= 1, hint: finalQuestions > 1 ? 'Deja como máximo 1 pregunta en «Después»; las demás pásalas a «Durante».' : '', detail: plural(finalQuestions, 'pregunta al final', 'preguntas al final') },
    { id: 'revisit', rule: 'R5', label: 'Reaparición en una historia posterior', ok: revisits > 0, hint: revisits > 0 ? '' : 'En «Más adelante», añade una expresión y elige la historia donde volverá (no hace falta en la última historia del curso).', detail: plural(revisits, 'reaparición', 'reapariciones') },
    { id: 'full_story', rule: 'R7', label: 'Una lectura completa', ok: full === 1, hint: full === 1 ? '' : full === 0 ? 'Añade el bloque de lectura/audio completo en «Después».' : 'Deja una sola lectura completa activa.', detail: plural(full, 'lectura', 'lecturas') }
  ];
}
