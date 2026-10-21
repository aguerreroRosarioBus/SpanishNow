import { LessonBlock } from '../../../core/services/lesson-plan.service';
import { Question, Vocabulary } from '../../../core/models/course.model';
import { containsExpression, storyTextFromBlocks, tprsChecklist } from './tprs-checklist';

const b = (blockKey: string, type: LessonBlock['type'], phase: LessonBlock['phase'], extra: Partial<LessonBlock> = {}): LessonBlock =>
  ({ blockKey, type, phase, active: true, required: false, ...extra });
const vocab = (id: number, word: string): Vocabulary => ({ id, unitId: 1, word, translation: 'x' });
const question = (id: number, questionText: string, answerType: Question['answerType'], correctAnswer: string, options?: string[]): Question =>
  ({ id, storyId: 1, questionText, answerType, correctAnswer, options });
const item = (blocks: LessonBlock[], id: string, vocabulary: Vocabulary[] = [], questions: Question[] = [], storyId = 1) =>
  tprsChecklist({ blocks, vocabulary, questions, storyId }).find(i => i.id === id)!;

describe('storyTextFromBlocks', () => {
  it('une los keyframes activos con texto, recortados, con una línea en blanco', () => {
    const blocks = [b('k1', 'keyframe', 'during', { text: ' Uno. ' }), b('k2', 'keyframe', 'during', { text: 'Dos', active: false }),
      b('k3', 'keyframe', 'during', { text: '   ' }), b('q', 'question', 'during', { text: 'no' }), b('k4', 'keyframe', 'during', { text: 'Tres.' })];
    expect(storyTextFromBlocks(blocks)).toBe('Uno.\n\nTres.');
  });
});

describe('containsExpression', () => {
  it('ignora acentos, mayúsculas y flexión simple', () => {
    expect(containsExpression('Ella Tiene un gato.', 'tiene')).toBe(true);
    expect(containsExpression('Los gatos corren', 'gato')).toBe(true);
    expect(containsExpression('Él se llama Luis', 'me llamo')).toBe(false);
  });
});

describe('tprsChecklist', () => {
  const v = [vocab(1, 'me llamo'), vocab(2, 'tiene'), vocab(3, 'mucho gusto'), vocab(4, 'perro')];
  const expr = (key: string, id: number, extra: Partial<LessonBlock> = {}) => b(key, 'expression', 'before', { vocabularyId: id, vocabularyRole: 'target', ...extra });

  it('R1 pide 2 o 3 objetivos que aparezcan en el texto', () => {
    const k = b('k1', 'keyframe', 'during', { text: 'Hola, me llamo Luis y tiene un gato.' });
    expect(item([k], 'targets', v).ok).toBe(false);
    expect(item([k, expr('e1', 1)], 'targets', v).ok).toBe(false);
    expect(item([k, expr('e1', 1), expr('e2', 2)], 'targets', v).ok).toBe(true);
    const missing = item([k, expr('e1', 1), expr('e3', 3)], 'targets', v);
    expect(missing.ok).toBe(false);
    expect(missing.hint).toContain('mucho gusto');
    expect(item([k, expr('e1', 1), expr('e2', 2), expr('e3', 3), expr('e4', 4)], 'targets', v).ok).toBe(false);
    expect(item([k, expr('e1', 1), expr('e2', 2, { active: false })], 'targets', v).ok).toBe(false);
    expect(item([k, expr('e1', 1), expr('e2', 2, { vocabularyRole: 'support' })], 'targets', v).ok).toBe(false);
  });

  it('R2 requiere 2 keyframes con texto de 3 a 45 palabras', () => {
    const k = (key: string, text: string) => b(key, 'keyframe', 'during', { text });
    expect(item([k('a', 'Luis llega a casa')], 'keyframes').ok).toBe(false);
    expect(item([k('a', 'Luis llega a casa'), k('b', 'Luis come pan hoy')], 'keyframes').ok).toBe(true);
    expect(item([k('a', 'Luis llega a casa'), k('b', '')], 'keyframes').hint).toContain('vacíos');
    expect(item([k('a', 'Luis llega a casa'), k('b', 'Hola Luis')], 'keyframes').ok).toBe(false);
    expect(item([k('a', 'Luis llega a casa'), k('b', Array(46).fill('palabra').join(' '))], 'keyframes').ok).toBe(false);
  });

  it('R3 acepta Sí/No o dos opciones tras su keyframe y rechaza otros casos', () => {
    const q = [question(1, '¿Luis tiene un gato?', 'yes_no', 'Sí'), question(2, '¿Quién llega?', 'choice', 'Luis', ['Luis', 'Ana']),
      question(3, '¿Dónde?', 'open_ended', 'casa'), question(4, '¿Cuál?', 'choice', 'a', ['a', 'b', 'c']), question(5, '¿Quién tiene un gato?', 'yes_no', 'Sí')];
    const k1 = b('k1', 'keyframe', 'during', { text: 'Luis llega a la casa.' });
    const k2 = b('k2', 'keyframe', 'during', { text: 'Luis tiene un gato negro.' });
    expect(item([k1, k2], 'during', v, q).ok).toBe(false);
    expect(item([k1, k2, b('q', 'question', 'during', { questionId: 1, contextBlockKey: 'k2' })], 'during', v, q).ok).toBe(true);
    expect(item([k1, b('q', 'question', 'during', { questionId: 2, contextBlockKey: 'k1' }), k2], 'during', v, q).ok).toBe(true);
    expect(item([k1, b('q', 'question', 'during', { questionId: 3, contextBlockKey: 'k1' })], 'during', v, q).ok).toBe(false);
    expect(item([k1, b('q', 'question', 'during', { questionId: 4, contextBlockKey: 'k1' })], 'during', v, q).ok).toBe(false);
    expect(item([k1, b('q', 'question', 'during', { questionId: null, contextBlockKey: 'k1' })], 'during', v, q).ok).toBe(false);
    // pregunta antes de su keyframe de contexto
    expect(item([b('q', 'question', 'during', { questionId: 1, contextBlockKey: 'k2' }), k1, k2], 'during', v, q).ok).toBe(false);
    // lo que pregunta solo aparece en un keyframe posterior
    const late = item([k1, b('q', 'question', 'during', { questionId: 5, contextBlockKey: 'k1' }), k2], 'during', v, q);
    expect(late.ok).toBe(false);
    expect(late.hint).toContain('posterior');
  });

  it('R4 permite como mucho una pregunta final', () => {
    expect(item([b('q1', 'question', 'after')], 'after').ok).toBe(true);
    expect(item([b('q1', 'question', 'after'), b('q2', 'question', 'after')], 'after').ok).toBe(false);
    expect(item([b('q1', 'question', 'after'), b('q2', 'question', 'after', { active: false })], 'after').ok).toBe(true);
  });

  it('R5 necesita una expresión de «Más adelante» con otra historia', () => {
    const later = (extra: Partial<LessonBlock>) => b('l', 'expression', 'later', { vocabularyId: 1, vocabularyRole: 'revisit', ...extra });
    expect(item([], 'revisit').ok).toBe(false);
    expect(item([later({})], 'revisit').ok).toBe(false);
    expect(item([later({ revisitStoryId: 1 })], 'revisit').ok).toBe(false);
    expect(item([later({ revisitStoryId: 2 })], 'revisit').ok).toBe(true);
  });

  it('R7 exige exactamente una lectura completa activa', () => {
    expect(item([], 'full_story').ok).toBe(false);
    expect(item([b('f', 'full_story', 'after')], 'full_story').ok).toBe(true);
    expect(item([b('f', 'full_story', 'after'), b('g', 'full_story', 'after')], 'full_story').ok).toBe(false);
    expect(item([b('f', 'full_story', 'after', { active: false })], 'full_story').ok).toBe(false);
  });

  it('cada regla incumplida trae una pista y las cumplidas no', () => {
    for (const i of tprsChecklist({ blocks: [], vocabulary: [], questions: [] })) {
      expect(i.ok).toBe(!i.hint);
    }
  });
});
