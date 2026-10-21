import { QuizQuestionDraft, UnitQuiz, UnitQuizPayload } from '../../../core/models/content.model';

/** Límites del contrato (Fase 2): iguales a las validaciones del servidor. */
export const QUIZ_LIMITS = { minQuestions: 1, maxQuestions: 50, minOptions: 2, maxOptions: 6, minScore: 1, maxScore: 100, defaultScore: 70 } as const;

export function emptyQuestion(): QuizQuestionDraft {
  return { prompt: '', options: ['', ''], correctIndex: 0, explanation: '' };
}

export function emptyQuiz(): UnitQuiz {
  return { title: '', passingScore: QUIZ_LIMITS.defaultScore, isPublished: false, questions: [emptyQuestion()] };
}

/** Errores por pregunta (clave: índice) y generales. Vacío = válido. */
export interface QuizValidation {
  general: string[];
  questions: Record<number, string[]>;
  valid: boolean;
}

export function validateQuiz(quiz: UnitQuizPayload): QuizValidation {
  const general: string[] = [];
  const questions: Record<number, string[]> = {};

  if (!quiz.title?.trim()) general.push('El quiz necesita un título.');
  const score = Number(quiz.passingScore);
  if (!Number.isInteger(score) || score < QUIZ_LIMITS.minScore || score > QUIZ_LIMITS.maxScore) {
    general.push('El puntaje para aprobar debe ser un entero entre 1 y 100.');
  }
  const count = quiz.questions?.length ?? 0;
  if (count < QUIZ_LIMITS.minQuestions) general.push('Agrega al menos una pregunta.');
  if (count > QUIZ_LIMITS.maxQuestions) general.push(`Máximo ${QUIZ_LIMITS.maxQuestions} preguntas.`);

  (quiz.questions ?? []).forEach((q, index) => {
    const errors: string[] = [];
    if (!q.prompt?.trim()) errors.push('Escribe el enunciado.');
    const options = q.options ?? [];
    if (options.length < QUIZ_LIMITS.minOptions || options.length > QUIZ_LIMITS.maxOptions) {
      errors.push('Debe tener entre 2 y 6 opciones.');
    }
    if (options.some(o => !o?.trim())) errors.push('Ninguna opción puede quedar vacía.');
    if (!Number.isInteger(q.correctIndex) || q.correctIndex < 0 || q.correctIndex >= options.length) {
      errors.push('Marca cuál es la opción correcta.');
    }
    if (errors.length) questions[index] = errors;
  });

  return { general, questions, valid: general.length === 0 && Object.keys(questions).length === 0 };
}

/** Cuerpo del PUT: recorta textos y manda la explicación solo si tiene contenido (null para borrarla). */
export function toPayload(quiz: UnitQuizPayload): UnitQuizPayload {
  return {
    title: quiz.title.trim(),
    passingScore: Math.round(Number(quiz.passingScore)),
    isPublished: !!quiz.isPublished,
    questions: quiz.questions.map(q => ({
      ...(q.id !== undefined ? { id: q.id } : {}),
      prompt: q.prompt.trim(),
      options: q.options.map(o => o.trim()),
      correctIndex: q.correctIndex,
      explanation: q.explanation?.trim() ? q.explanation.trim() : null
    }))
  };
}

export function moveItem<T>(list: T[], from: number, to: number): T[] {
  if (from === to || from < 0 || to < 0 || from >= list.length || to >= list.length) return list;
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

/** Mueve una pregunta; el id se conserva, así que el servidor sincroniza igual. */
export function moveQuestion(questions: QuizQuestionDraft[], from: number, to: number): QuizQuestionDraft[] {
  return moveItem(questions, from, to);
}

export function addOption(question: QuizQuestionDraft): QuizQuestionDraft {
  if (question.options.length >= QUIZ_LIMITS.maxOptions) return question;
  return { ...question, options: [...question.options, ''] };
}

/** Quita una opción y mantiene apuntando a la correcta (si se quita la correcta, vuelve a la primera). */
export function removeOption(question: QuizQuestionDraft, index: number): QuizQuestionDraft {
  if (question.options.length <= QUIZ_LIMITS.minOptions) return question;
  const options = question.options.filter((_, i) => i !== index);
  let correctIndex = question.correctIndex;
  if (index === correctIndex) correctIndex = 0;
  else if (index < correctIndex) correctIndex -= 1;
  return { ...question, options, correctIndex };
}
