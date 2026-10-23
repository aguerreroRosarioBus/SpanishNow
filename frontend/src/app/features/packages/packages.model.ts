import { Expectations } from '../legal/legal.model';
export interface PackageVersion {
  id: number; templateId: number; version: number;
  nameEn: string; nameEs: string; descriptionEn: string | null; descriptionEs: string | null;
  modality: 'individual' | 'group'; groupSize: number; billing: 'per_buyer' | 'per_group' | 'per_seat';
  sessionsCount: number; minutesPerSession: number; seatsCovered: number;
  priceAmount: number; currency: string; validityHours: number; policyVersionId: number;
  hotmartProductId: string | null; hotmartOfferCode: string | null; hotmartCheckoutUrl: string | null;
  expectations: Expectations | null;
}
export interface PackageTemplate {
  id: number; teacherId: number; templateKey: string; status: 'draft' | 'active' | 'paused' | 'archived';
  /** `null` cuando la plantilla quedó sin versión vigente (ver backend `classCatalog.present`): hay que completarla o reimportar. */
  current: PackageVersion | null; versions?: PackageVersion[]; policy?:{version:number;rules:{refundWindowHours:number;refundMode?:string}};
}
/** Plantilla con versión vigente: la única que se puede ofrecer, activar o agrupar. */
export type CompleteTemplate = PackageTemplate & { current: PackageVersion };
export const hasVersion = (t: PackageTemplate): t is CompleteTemplate => t.current != null;
export interface ClassSettings { classesEnabledAt: string | null; salesPausedAt: string | null; acceptsInquiries: boolean }
export interface ClassOffer {
  canCheckout?:boolean;canManage?:boolean;
  id: number; conversationId: number; teacherId: number; buyerId: number; cohortId: number | null;
  templateVersionId: number; status: 'draft'|'sent'|'checkout_pending'|'paid'|'expired'|'cancelled'|'replaced';
  amount: number; currency: string; sessionsCount: number; minutesPerSession: number; seatsCovered: number;
  sentAt: string; expiresAt: string; replacesOfferId: number | null;
  snapshot: Omit<PackageVersion,'id'|'templateId'|'version'|'hotmartCheckoutUrl'> & {
    teacherName: string; templateVersion: number; policyVersion: number; beneficiaryIds: number[];
    policy: {freeCancelHours:number;maxPauseHours:number;maxPauses:number;refundWindowHours:number;refundMode?:string};
    legalDocuments: import('../legal/legal.model').SnapshotLegalDocument[];
  };
}
export interface ClassCohort {
  id:number; teacherId:number; templateVersionId:number; groupSize:number; acceptedCount:number;
  status:'forming'|'ready'|'cancelled'|'completed'; formingDeadlineAt:string; tentativeStartsAt:string;
  members?:{userId:number;status:string;name?:string;conversationId?:number}[]; invitation?:{status:string};
}
export interface ClassOrder { id:number;offerId:number;provider:'fake'|'hotmart';status:'pending'|'paid'|'failed'|'paid_needs_review'|'partially_refunded'|'refunded';amount:number;currency:string;reviewReason:string|null;reportedAmount?:number|null;reportedCurrency?:string|null;providerTransactionId?:string|null;providerProductId?:string|null;providerOfferCode?:string|null }
export interface CheckoutState {offer:ClassOffer;order:ClassOrder|null;purchaseId:number|null}
export interface ClassPurchase {
  id:number;offerId:number;buyerId:number;teacherId:number;version:number;status:'active'|'paused'|'exhausted'|'expired'|'cancelled';
  expiresAt:string;paidAt:string;pausedAt:string|null;pauseCount:number;minutesPerSession:number;seatsCovered:number;
  balance:{granted:number;available:number;reserved:number;consumed:number;expired:number;refunded:number};
  snapshot:ClassOffer['snapshot'];ledger?:{id:number;operation:string;units:number;createdAt:string;reason:string|null}[];
}

export interface RefundPreview {
  purchaseId:number;orderId:number;provider:'fake'|'hotmart';version:number;amount:number;currency:string;orderStatus:string;refundedAmount:number;deadline:string;deadlineVerified:boolean;
  classification:'standard_full_unused'|'individual_review';reservationsPending:boolean;consumed:number;available:number;reserved:number;type:string;quote:string;
  buyerId?:number;teacherId?:number;
  requests:{id:number;type:string;classification:string;reason:string;createdAt:string;amount:number;currency:string;status:string;updates:{reason:string;status:string;createdAt:string}[]}[];
}
export interface PaymentJob{id:number;topic:string;aggregateId:number;purchaseIds:number[];status:string;attempts:number;lastError:string|null;runAt:string}
