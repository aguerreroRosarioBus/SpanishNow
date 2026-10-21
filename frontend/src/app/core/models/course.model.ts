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
}

export interface Unit {
  id: number;
  courseId: number;
  title: string;
  description?: string;
  order: number;
  stories?: Story[];
  vocabulary?: Vocabulary[];
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
  order: number;
  questions?: Question[];
  repetitionActivities?: RepetitionActivity[];
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
