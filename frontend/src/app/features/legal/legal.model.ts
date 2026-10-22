import { Locale } from '../../core/i18n/i18n.types';

/** W02 · contratos de `backend/src/services/legalDocuments.js` y `salesExpectations.js`. */
export const LEGAL_KEYS = ['terms', 'privacy', 'refunds', 'package_terms'] as const;
export type LegalKey = typeof LEGAL_KEYS[number];
/** Páginas públicas enlazadas en footer, registro y compra (LEGAL-01). */
export const PUBLIC_LEGAL_KEYS: readonly LegalKey[] = ['terms', 'privacy', 'refunds'];

export const BUSINESS_FIELDS = ['responsibleName', 'address', 'contactEmail', 'privacyEmail', 'commercialRetention'] as const;
export type BusinessField = typeof BUSINESS_FIELDS[number];
export type LegalBusiness = Record<BusinessField, string>;
export interface LegalText { title: string; body: string; }

/** `GET /api/public/legal/:key?locale=`: una versión publicada y vigente en un idioma. */
export interface PublicLegalDocument extends LegalText {
  id: number;
  documentKey: LegalKey;
  documentVersion: string;
  locale: Locale;
  effectiveAt: string;
  publishedAt: string;
  business: LegalBusiness;
}

/** `GET /api/admin/legal-documents`: borradores y publicadas, con ambas traducciones. */
export interface AdminLegalDocument {
  id: number;
  documentKey: LegalKey;
  documentVersion: string;
  effectiveAt: string;
  publishedAt: string | null;
  content: Record<Locale, LegalText>;
  business: LegalBusiness;
}

export interface LegalDraftInput {
  documentKey: LegalKey;
  effectiveAt: string;
  content: Record<Locale, LegalText>;
  business: LegalBusiness;
}

/** Referencia exacta a lo que se acepta; el servidor la compara contra las versiones que entregó. */
export interface LegalReference { documentKey: LegalKey; documentVersion: string; }
export interface LegalConsent { accepted: true; documents: LegalReference[]; }

export const EXPECTATION_FIELDS = ['audience', 'prerequisites', 'objective', 'contents', 'selfStudy', 'outcomes', 'supportIncluded', 'supportExcluded'] as const;
export type ExpectationField = typeof EXPECTATION_FIELDS[number];
export type Expectations = Record<Locale, Record<ExpectationField, string>>;
export interface ExpectationsState { version: number; expectations: Expectations | null; }

/** Documento legal congelado dentro de una instantánea comercial (SALES-04). */
export interface SnapshotLegalDocument {
  documentKey: LegalKey;
  version: string;
  content: Record<Locale, LegalText>;
  business: LegalBusiness;
  effectiveAt: string;
}

/** Instantánea que ven página, checkout e historial; `hash` detecta cambios entre pantalla y compra. */
export interface CommercialSnapshot extends ExpectationsState {
  courseId: number;
  title: string;
  teacherId: number;
  price: number;
  currency: string;
  legalDocuments: SnapshotLegalDocument[];
  hash: string;
}

/** Datos extra del checkout de cursos (W02). */
export interface CheckoutEvidence {
  locale: Locale;
  commercialHash: string;
  legalConsent?: LegalConsent;
}
