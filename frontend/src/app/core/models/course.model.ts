export interface Course {
  id: number;
  title: string;
  description?: string;
  level: 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2';
  teacherId: number;
  imageUrl?: string;
  createdAt: string;
  updatedAt: string;
  teacher?: {
    id: number;
    name: string;
  };
  units?: Unit[];
  /** URL amigable de la página de venta (puede faltar en cursos viejos). */
  slug?: string | null;
  /** Precio en centavos; 0 = gratis. */
  price?: number;
  /** Código ISO en minúsculas (usd, eur, gbp). */
  currency?: string;
  isPublished?: boolean;
  /** Texto largo de la página de venta (en inglés). */
  salesDescription?: string | null;
  /** Solo en el detalle del curso (GET /courses/:id) */
  enrollmentCount?: number;
  /** Video de bienvenida (URL de embed normalizada por el servidor) o null. */
  introVideoUrl?: string | null;
  /** Materiales generales del curso (sin unidad ni historia). Del alumno: sin fileUrl. */
  materials?: Material[];
}

export interface Unit {
  id: number;
  courseId: number;
  title: string;
  description?: string;
  order: number;
  stories?: Story[];
  vocabulary?: Vocabulary[];
  /** Materiales de la unidad. */
  materials?: Material[];
  /** Quiz publicado de la unidad (en el detalle del curso del alumno; el docente lo edita con QuizService). */
  quiz?: UnitQuizSummary | null;
}

/** PDF descargable. El link real nunca viaja: la descarga pasa por GET /materials/:id/download-url. */
export interface Material {
  id: number;
  courseId?: number;
  unitId?: number | null;
  storyId?: number | null;
  title: string;
  sizeBytes: number;
  order?: number;
}

export interface UnitQuizSummary {
  id: number;
  title: string;
  questionCount: number;
  passingScore: number;
}

export interface Story {
  id: number;
  unitId: number;
  title: string;
  text: string;
  audioSlowUrl?: string;
  audioNormalUrl?: string;
  /** La historia ya tiene lección (borrador o publicada): su texto se genera desde el compositor. */
  hasLessonPlan?: boolean;
  /** Publicada si alguna revisión de su lección está publicada; Borrador en otro caso (solo en el detalle del curso). */
  lessonStatus?: 'draft' | 'published';
  order: number;
  questions?: Question[];
  repetitionActivities?: RepetitionActivity[];
  /** Video de la lección (URL de embed normalizada) o null. */
  videoUrl?: string | null;
  /** Materiales de la historia. */
  materials?: Material[];
}

export interface Vocabulary {
  id: number;
  unitId: number;
  word: string;
  translation: string;
  example?: string;
  partOfSpeech?: string;
  audioUrl?: string;
  imageUrl?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface Question {
  id: number;
  storyId: number;
  questionText: string;
  answerType: 'yes_no' | 'choice' | 'open_ended';
  options?: string[];
  correctAnswer: string;  // Required for all types, used for self-correction in open_ended
  audioUrl?: string;
}

export interface Enrollment {
  id: number;
  studentId: number;
  courseId: number;
  createdAt: string;
  course?: Course;
  lessonProgress?: Array<{ storyId: number; planId: number; narrativeCompleted: boolean }>;
}

/** Resumen de avance por historia (GET /enrollments/:id/progress). */
export interface StoryProgress {
  storyId: number;
  storyTitle: string;
  unitId: number;
  unitTitle: string;
  revision: number | null;
  lastBlockKey: string | null;
  narrativeCompleted: boolean;
  completedAt: string | null;
  answers: { total: number; correct: number; attempts: number };
  reinforcements: { total: number; completed: number };
}

/** Avance de quizzes y certificado de una inscripción (GET /enrollments/:id/progress). */
export interface QuizProgress {
  unitId: number;
  quizId: number;
  bestScore: number | null;
  passed: boolean;
}

export interface CertificateStatus {
  eligible: boolean;
  code: string | null;
  missing: { stories: number; quizzes: number };
}

export interface EnrollmentProgress {
  stories: StoryProgress[];
  quizzes: QuizProgress[];
  certificate: CertificateStatus | null;
}

export interface ResetProgressResult {
  message: string;
  deleted: { progress: number; answers: number; reinforcements: number };
}

export interface RepetitionActivity {
  id: number;
  storyId: number;
  phrase: string;
  audioUrl?: string;
  order: number;
  createdAt?: string;
  updatedAt?: string;
}
