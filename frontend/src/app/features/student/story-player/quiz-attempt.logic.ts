import { QuizQuestionResult, StudentQuizQuestion } from '../../../core/models/content.model';

/** Respuestas del alumno: una por pregunta, en orden; null = sin responder. */
export type DraftAnswers = Array<number | null>;

export function emptyAnswers(questions: StudentQuizQuestion[]): DraftAnswers {
  return questions.map(() => null);
}

export function setAnswer(answers: DraftAnswers, questionIndex: number, optionIndex: number): DraftAnswers {
  return answers.map((a, i) => i === questionIndex ? optionIndex : a);
}

export function unansweredCount(answers: DraftAnswers): number {
  return answers.filter(a => a === null).length;
}

/** Solo se envía si todas las preguntas tienen respuesta (el contrato manda un índice por pregunta). */
export function toSubmission(answers: DraftAnswers): number[] | null {
  return answers.every((a): a is number => a !== null) ? answers : null;
}

export function correctCount(results: QuizQuestionResult[]): number {
  return results.filter(r => r.correct).length;
}

/** Busca el resultado de una pregunta por id (el servidor no garantiza el orden). */
export function resultFor(results: QuizQuestionResult[], questionId: number): QuizQuestionResult | undefined {
  return results.find(r => r.questionId === questionId);
}
