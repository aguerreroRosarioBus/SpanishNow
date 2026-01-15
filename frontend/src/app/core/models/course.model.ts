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
  answerType: 'yes_no' | 'choice';
  options?: string[];
  correctAnswer: string;
}

export interface Enrollment {
  id: number;
  studentId: number;
  courseId: number;
  createdAt: string;
  course?: Course;
  progress?: Progress[];
}

export interface Progress {
  id: number;
  enrollmentId: number;
  storyId: number;
  completed: boolean;
  activitiesCompleted?: boolean;
  // Granular activity tracking (new fields)
  flashcardsViewed?: boolean;
  questionsCompleted?: boolean;
  matchingCompleted?: boolean;
  listenRepeatCompleted?: boolean;
}

export interface QuestionResponse {
  id: number;
  progressId: number;
  questionId: number;
  studentAnswer: string;
  isCorrect: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface QuestionSubmission {
  questionId: number;
  studentAnswer: string;
}

export interface QuestionResult {
  questionId: number;
  isCorrect: boolean;
  correctAnswer?: string;
}

export interface SubmitResponsePayload {
  progressId: number;
  responses: QuestionSubmission[];
}

export interface SubmitResponseResult {
  results: QuestionResult[];
  allCorrect: boolean;
  activitiesCompleted: boolean;
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
