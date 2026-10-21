import { describe, expect, it } from 'vitest';
import { addOption, emptyQuestion, moveQuestion, removeOption, toPayload, validateQuiz } from './quiz-editor.logic';

const valid = () => ({
  title: 'Quiz 1', passingScore: 70, isPublished: true,
  questions: [{ prompt: '¿Qué?', options: ['a', 'b'], correctIndex: 1, explanation: '' }]
});

describe('quiz-editor.logic', () => {
  it('acepta un quiz válido', () => {
    expect(validateQuiz(valid()).valid).toBe(true);
  });

  it('exige título, puntaje 1-100 y al menos una pregunta', () => {
    expect(validateQuiz({ ...valid(), title: ' ' }).general.length).toBe(1);
    expect(validateQuiz({ ...valid(), passingScore: 0 }).valid).toBe(false);
    expect(validateQuiz({ ...valid(), passingScore: 101 }).valid).toBe(false);
    expect(validateQuiz({ ...valid(), passingScore: 70.5 }).valid).toBe(false);
    expect(validateQuiz({ ...valid(), questions: [] }).valid).toBe(false);
  });

  it('rechaza más de 50 preguntas', () => {
    const q = valid().questions[0];
    expect(validateQuiz({ ...valid(), questions: Array(51).fill(q) }).valid).toBe(false);
    expect(validateQuiz({ ...valid(), questions: Array(50).fill(q) }).valid).toBe(true);
  });

  it('valida enunciado, 2 a 6 opciones no vacías y correctIndex en rango', () => {
    const v = (q: any) => validateQuiz({ ...valid(), questions: [q] });
    expect(v({ prompt: '', options: ['a', 'b'], correctIndex: 0 }).questions[0]).toBeTruthy();
    expect(v({ prompt: 'x', options: ['a'], correctIndex: 0 }).valid).toBe(false);
    expect(v({ prompt: 'x', options: ['a', 'b', 'c', 'd', 'e', 'f', 'g'], correctIndex: 0 }).valid).toBe(false);
    expect(v({ prompt: 'x', options: ['a', ' '], correctIndex: 0 }).valid).toBe(false);
    expect(v({ prompt: 'x', options: ['a', 'b'], correctIndex: 2 }).valid).toBe(false);
    expect(v({ prompt: 'x', options: ['a', 'b'], correctIndex: -1 }).valid).toBe(false);
    expect(v({ prompt: 'x', options: ['a', 'b', 'c', 'd', 'e', 'f'], correctIndex: 5 }).valid).toBe(true);
  });

  it('agrega opciones hasta 6 y quita hasta 2 ajustando la correcta', () => {
    let q = emptyQuestion();
    for (let i = 0; i < 10; i++) q = addOption(q);
    expect(q.options.length).toBe(6);
    q = { ...q, options: ['a', 'b', 'c', 'd', 'e', 'f'], correctIndex: 3 };
    expect(removeOption(q, 0).correctIndex).toBe(2);
    expect(removeOption(q, 5).correctIndex).toBe(3);
    expect(removeOption(q, 3).correctIndex).toBe(0);
    expect(removeOption({ ...q, options: ['a', 'b'], correctIndex: 0 }, 1).options.length).toBe(2);
  });

  it('reordena preguntas conservando sus ids', () => {
    const qs = [{ ...emptyQuestion(), id: 1 }, { ...emptyQuestion(), id: 2 }, { ...emptyQuestion(), id: 3 }];
    expect(moveQuestion(qs, 0, 2).map(q => q.id)).toEqual([2, 3, 1]);
    expect(moveQuestion(qs, 1, 5)).toBe(qs);
  });

  it('arma el payload sin id en preguntas nuevas y con explicación nula si está vacía', () => {
    const payload = toPayload({
      title: ' Quiz ', passingScore: 80, isPublished: false,
      questions: [{ id: 4, prompt: ' p ', options: [' a ', 'b'], correctIndex: 0, explanation: ' ' }, { prompt: 'q', options: ['a', 'b'], correctIndex: 1, explanation: 'Porque' }]
    });
    expect(payload.title).toBe('Quiz');
    expect(payload.questions[0]).toEqual({ id: 4, prompt: 'p', options: ['a', 'b'], correctIndex: 0, explanation: null });
    expect('id' in payload.questions[1]).toBe(false);
    expect(payload.questions[1].explanation).toBe('Porque');
  });
});
