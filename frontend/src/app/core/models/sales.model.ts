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
  /** Dónde se cobra: Hotmart (checkout externo) o el propio sitio. */
  checkoutProvider?: 'hotmart' | 'site';
  salesDescription?: string | null;
  /** Video de bienvenida (URL de embed normalizada). */
  introVideoUrl?: string | null;
  /** Cantidad de PDFs descargables del curso (nunca sus URLs). */
  materialsCount?: number;
  /** Serie de cursos: anterior y siguiente (solo cursos publicados). */
  series?: CourseSeries;
  units: Array<{
    id: number;
    title: string;
    order: number;
    hasQuiz?: boolean;
    /** Fase 4: «Unlocks on day N» (días desde la inscripción). */
    releaseAfterDays?: number | null;
    stories: Array<{ id: number; title: string; order: number; hasVideo?: boolean }>;
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

// ===== Fase 3: cupones, ventas, órdenes y serie de cursos =====

export interface SeriesLink { slug: string; title: string; }
export interface CourseSeries { previous: SeriesLink | null; next: SeriesLink | null; }

/** Códigos de error 400 de POST /checkout y POST /checkout/quote. */
export type CouponErrorCode = 'coupon_invalid' | 'coupon_expired' | 'coupon_exhausted' | 'coupon_not_applicable';

export interface CheckoutQuote {
  originalAmount: number;
  discountAmount: number;
  amount: number;
  currency: string;
  coupon: { code: string; percentOff: number | null; amountOff: number | null };
}

export interface Coupon {
  id: number;
  code: string;
  percentOff: number | null;
  /** Centavos. */
  amountOff: number | null;
  currency: string | null;
  courseId: number | null;
  maxRedemptions: number | null;
  redemptions: number;
  expiresAt: string | null;
  active: boolean;
  course?: { id: number; title: string } | null;
}

export interface CouponInput {
  code: string;
  percentOff: number | null;
  amountOff: number | null;
  currency: string | null;
  courseId: number | null;
  maxRedemptions: number | null;
  expiresAt: string | null;
  active: boolean;
}

export interface SalesTotal { currency: string; gross: number; refunds: number; net: number; orders: number; refundsCount: number; }
export interface SalesByMonth { month: string; currency: string; net: number; orders: number; }
export interface SalesByCourse { courseId: number; title: string; currency: string; net: number; orders: number; }
export interface SalesSummary { totals: SalesTotal[]; byMonth: SalesByMonth[]; byCourse: SalesByCourse[]; }

export type OrderStatus = 'paid' | 'refunded' | 'pending' | 'failed';
export type OrderProvider = 'stripe' | 'fake' | 'coupon' | 'hotmart' | string;

export interface TeacherOrder {
  id: number;
  createdAt: string;
  paidAt: string | null;
  course: { id: number; title: string };
  buyer: { id: number; name: string; email: string };
  amount: number;
  originalAmount: number | null;
  discountAmount: number;
  currency: string;
  status: OrderStatus;
  refundedAmount: number;
  coupon: { code: string } | null;
  provider: OrderProvider;
  receiptUrl: string | null;
  /** Fase 4: afiliado al que se atribuyó la venta y su comisión (centavos, misma moneda). */
  affiliate?: { id: number; name: string; code: string } | null;
  commissionAmount?: number;
}

export interface OrdersPage { rows: TeacherOrder[]; total: number; }

export interface OrderFilters {
  status?: string;
  courseId?: number | null;
  q?: string;
  page?: number;
  pageSize?: number;
}

export interface MyOrder {
  id: number;
  paidAt: string | null;
  course: { title: string; slug: string };
  amount: number;
  currency: string;
  status: OrderStatus;
  refundedAmount: number;
  receiptUrl: string | null;
}

/** Curso siguiente que se ofrece al terminar (GET /enrollments/:id/progress → next). */
export interface NextCourseOffer {
  course: { slug: string; title: string; price: number; currency: string };
  couponCode: string | null;
  alreadyEnrolled: boolean;
}
