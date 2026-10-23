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
  current: PackageVersion; versions?: PackageVersion[];
}
export interface ClassSettings { classesEnabledAt: string | null; salesPausedAt: string | null; acceptsInquiries: boolean }
export interface ClassOffer {
  canCheckout?:boolean;canManage?:boolean;
  id: number; conversationId: number; teacherId: number; buyerId: number; cohortId: number | null;
  templateVersionId: number; status: 'draft'|'sent'|'checkout_pending'|'paid'|'expired'|'cancelled'|'replaced';
  amount: number; currency: string; sessionsCount: number; minutesPerSession: number; seatsCovered: number;
  sentAt: string; expiresAt: string; replacesOfferId: number | null;
  snapshot: Omit<PackageVersion,'id'|'templateId'|'version'|'hotmartCheckoutUrl'> & {
    teacherName: string; templateVersion: number; policyVersion: number; beneficiaryIds: number[];
    policy: {freeCancelHours:number;maxPauseHours:number;maxPauses:number;refundWindowHours:number};
    legalDocuments: import('../legal/legal.model').SnapshotLegalDocument[];
  };
}
export interface ClassCohort {
  id:number; teacherId:number; templateVersionId:number; groupSize:number; acceptedCount:number;
  status:'forming'|'ready'|'cancelled'|'completed'; formingDeadlineAt:string; tentativeStartsAt:string;
  members?:{userId:number;status:string}[]; invitation?:{status:string};
}
export interface ClassOrder { id:number;offerId:number;provider:'fake'|'hotmart';status:'pending'|'paid'|'failed'|'paid_needs_review'|'partially_refunded'|'refunded';amount:number;currency:string;reviewReason:string|null }
export interface CheckoutState {offer:ClassOffer;order:ClassOrder|null;purchaseId:number|null}
export interface ClassPurchase {
  id:number;offerId:number;buyerId:number;teacherId:number;version:number;status:'active'|'paused'|'exhausted'|'expired'|'cancelled';
  expiresAt:string;paidAt:string;pausedAt:string|null;pauseCount:number;minutesPerSession:number;seatsCovered:number;
  balance:{granted:number;available:number;reserved:number;consumed:number;expired:number;refunded:number};
  snapshot:ClassOffer['snapshot'];ledger?:{id:number;operation:string;units:number;createdAt:string;reason:string|null}[];
}
