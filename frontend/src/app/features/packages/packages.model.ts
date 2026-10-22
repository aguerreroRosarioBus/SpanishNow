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
