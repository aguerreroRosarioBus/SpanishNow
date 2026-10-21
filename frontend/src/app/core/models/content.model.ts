/** Modelos de la Fase 2: quizzes de unidad, descargas y certificados. */

// ===== Quiz (docente) =====

export interface QuizQuestionDraft {
  /** Presente solo en preguntas ya guardadas (el servidor sincroniza por id). */
  id?: number;
  prompt: string;
  options: string[];
  correctIndex: number;
  explanation?: string | null;
}

/** Quiz completo con respuestas correctas (GET /units/:id/quiz, solo docente dueño). */
export interface UnitQuiz {
  id?: number;
  unitId?: number;
  title: string;
  passingScore: number;
  isPublished: boolean;
  questions: QuizQuestionDraft[];
}

export type UnitQuizPayload = Pick<UnitQuiz, 'title' | 'passingScore' | 'isPublished' | 'questions'>;

// ===== Quiz (alumno) =====

export interface StudentQuizQuestion {
  id: number;
  prompt: string;
  options: string[];
}

export interface StudentQuiz {
  id: number;
  title: string;
  passingScore: number;
  questions: StudentQuizQuestion[];
  bestAttempt: { score: number; passed: boolean } | null;
}

export interface QuizQuestionResult {
  questionId: number;
  correct: boolean;
  correctIndex: number;
  explanation?: string | null;
}

export interface QuizAttemptResult {
  score: number;
  passed: boolean;
  bestScore: number;
  results: QuizQuestionResult[];
}

// ===== Descargas y certificados =====

export interface DownloadUrl {
  url: string;
  filename: string;
}

export interface PublicCertificate {
  code: string;
  studentName: string;
  courseTitle: string;
  teacherName: string;
  issuedAt: string;
}

export interface IssuedCertificate extends Partial<PublicCertificate> {
  code: string;
}

/** Cuerpo del 409 al pedir un certificado sin ser elegible. */
export interface CertificateMissing {
  stories: number;
  quizzes: number;
}
