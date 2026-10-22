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
