import { TeacherOrder } from './sales.model';

/** Modelos de la Fase 4: afiliados y comentarios por lección. Los montos van en centavos y siempre por moneda. */

export interface AffiliateStat {
  currency: string;
  orders: number;
  sales: number;
  commission: number;
  paid: number;
  /** Comisión pendiente menos lo pagado. */
  owed: number;
}

export interface Affiliate {
  id: number;
  name: string;
  email: string;
  code: string;
  commissionPercent: number;
  active: boolean;
  notes: string | null;
  stats: AffiliateStat[];
  /** El contrato de la lista no lo incluye; si el servidor lo manda se usa para armar el link del panel. */
  dashboardToken?: string;
}

export interface AffiliateInput {
  name: string;
  email: string;
  commissionPercent: number;
  active?: boolean;
  notes?: string | null;
}

export type CommissionStatus = 'none' | 'pending' | 'void';

export interface AffiliateOrder extends TeacherOrder {
  commissionAmount: number;
  commissionStatus: CommissionStatus;
}

export interface AffiliatePayout {
  id: number;
  amount: number;
  currency: string;
  paidAt: string;
  note: string | null;
}

export interface AffiliatePayoutInput {
  amount: number;
  currency: string;
  paidAt: string;
  note: string | null;
}

/** GET /public/affiliate-dashboard/:token (sin datos de compradores). */
export interface AffiliateDashboard {
  affiliate: { name: string; code: string; commissionPercent: number };
  links: Array<{ courseTitle: string; url: string }>;
  stats: AffiliateStat[];
  orders: Array<{ paidAt: string | null; courseTitle: string; amount: number; currency: string; commissionAmount: number; commissionStatus: CommissionStatus }>;
  payouts: Array<{ amount: number; currency: string; paidAt: string; note?: string | null }>;
}

// ===== Comentarios =====

export interface CommentAuthor { id: number; name: string; isTeacher: boolean; }

export interface LessonComment {
  id: number;
  body: string;
  author: CommentAuthor;
  createdAt: string;
  editedAt: string | null;
  hidden: boolean;
  canEdit: boolean;
  canDelete: boolean;
  replies?: LessonComment[];
}

export interface CommentsPage { rows: LessonComment[]; total: number; }

export interface InboxComment {
  id: number;
  body: string;
  author: { id: number; name: string };
  createdAt: string;
  hidden?: boolean;
  story: { id: number; title: string };
  course: { id: number; title: string };
  unit: { id: number; title: string };
  replies: number;
  answeredByTeacher: boolean;
}

export interface InboxPage { rows: InboxComment[]; total: number; }
