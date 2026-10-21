import { describe, expect, it } from 'vitest';
import { correctCount, emptyAnswers, resultFor, setAnswer, toSubmission, unansweredCount } from './quiz-attempt.logic';

const questions = [{ id: 1, prompt: 'a', options: ['x', 'y'] }, { id: 2, prompt: 'b', options: ['x', 'y'] }];

describe('quiz-attempt.logic', () => {
  it('no permite enviar con preguntas sin responder', () => {
    let answers = emptyAnswers(questions);
    expect(unansweredCount(answers)).toBe(2);
    expect(toSubmission(answers)).toBeNull();
    answers = setAnswer(answers, 0, 1);
    expect(toSubmission(answers)).toBeNull();
    answers = setAnswer(answers, 1, 0);
    expect(toSubmission(answers)).toEqual([1, 0]);
  });

  it('acepta el índice 0 como respuesta válida', () => {
    expect(toSubmission([0, 0])).toEqual([0, 0]);
  });

  it('cuenta aciertos y busca por id de pregunta', () => {
    const results = [
      { questionId: 2, correct: true, correctIndex: 0, explanation: null },
      { questionId: 1, correct: false, correctIndex: 1, explanation: 'Porque sí' }
    ];
    expect(correctCount(results)).toBe(1);
    expect(resultFor(results, 1)?.explanation).toBe('Porque sí');
    expect(resultFor(results, 9)).toBeUndefined();
  });
});
