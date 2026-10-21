/** Modelos de la venta de cursos (Fase 1): catálogo público, checkout y alumnos del curso. */

export interface PublicCourse {
  id: number;
  slug: string;
  title: string;
  description?: string;
  level: string;
  imageUrl?: string;
  price: number;
  currency: string;
  teacher?: { name: string };
}

export interface PublicCourseDetail extends PublicCourse {
  salesDescription?: string | null;
  units: Array<{
    id: number;
    title: string;
    order: number;
    stories: Array<{ id: number; title: string; order: number }>;
  }>;
}

export interface CheckoutResponse {
  url: string;
}

export interface CheckoutSession {
  status: 'pending' | 'paid';
  course: { title: string; slug: string };
  email: string;
  needsPassword: boolean;
}

export type EnrollmentSource = 'free' | 'purchase' | 'manual' | 'hotmart_import';

export interface CourseStudent {
  enrollmentId: number;
  user: { id: number; name: string; email: string };
  source: EnrollmentSource;
  enrolledAt: string;
  progress: { completedStories: number; totalStories: number };
}

export type ImportRowStatus = 'new' | 'existing_user' | 'already_enrolled' | 'invalid';

export interface ImportRow {
  line: number;
  name: string;
  email: string;
  status: ImportRowStatus;
  reason?: string;
}

export interface ImportSummary {
  total: number;
  new: number;
  existingUser: number;
  alreadyEnrolled: number;
  invalid: number;
}

export interface ImportResult {
  rows: ImportRow[];
  summary: ImportSummary;
}
