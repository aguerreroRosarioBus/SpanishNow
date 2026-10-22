import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { I18nService } from '../../core/i18n/i18n.service';
import { Locale } from '../../core/i18n/i18n.types';
import {
  AdminLegalDocument, ExpectationsState, Expectations, LegalConsent, LegalDraftInput, LegalKey,
  PublicLegalDocument, SnapshotLegalDocument
} from './legal.model';

const W02_CODES = new Set(['legal_acceptance_required', 'legal_version_changed', 'sales_snapshot_changed', 'legal_publication_incomplete', 'version_conflict']);

/** API de W02: documentos legales, aceptaciones y expectativas comerciales. */
@Injectable({ providedIn: 'root' })
export class LegalService {
  private http = inject(HttpClient);
  private i18n = inject(I18nService);
  private apiUrl = environment.apiUrl;

  /** Versiones vigentes (sin borradores) para mostrar exactamente lo que se aceptará. */
  current(locale: Locale): Observable<PublicLegalDocument[]> {
    return this.http.get<PublicLegalDocument[]>(`${this.apiUrl}/public/legal`, { params: { locale } });
  }

  document(key: LegalKey, locale: Locale, version?: string | null): Observable<PublicLegalDocument> {
    return this.http.get<PublicLegalDocument>(`${this.apiUrl}/public/legal/${key}`, { params: { locale, ...(version ? { version } : {}) } });
  }

  adminList(): Observable<AdminLegalDocument[]> {
    return this.http.get<AdminLegalDocument[]>(`${this.apiUrl}/admin/legal-documents`);
  }

  createDraft(input: LegalDraftInput): Observable<AdminLegalDocument> {
    return this.http.post<AdminLegalDocument>(`${this.apiUrl}/admin/legal-documents`, input);
  }

  publish(id: number, documentVersion: string): Observable<AdminLegalDocument> {
    return this.http.post<AdminLegalDocument>(`${this.apiUrl}/admin/legal-documents/${id}/publish`, { documentVersion });
  }

  expectations(courseId: number): Observable<ExpectationsState> {
    return this.http.get<ExpectationsState>(`${this.apiUrl}/courses/${courseId}/expectations`);
  }

  saveExpectations(courseId: number, version: number, expectations: Expectations): Observable<ExpectationsState> {
    return this.http.put<ExpectationsState>(`${this.apiUrl}/courses/${courseId}/expectations`, { version, expectations });
  }

  /** Mensaje de un error de W02 por `code`; los demás los interpreta W01. */
  errorMessage(error: unknown, fallbackKey?: string): string {
    const code = (error as { error?: { code?: unknown } } | null)?.error?.code;
    return typeof code === 'string' && W02_CODES.has(code) ? this.i18n.t(`legal.errors.${code}`) : this.i18n.errorMessage(error, fallbackKey);
  }
}

/** Documentos que requieren casilla: privacidad informa tratamiento y no se "acepta" (LEGAL-02). */
export function contractual<T extends { documentKey: LegalKey }>(docs: readonly T[]): T[] {
  return docs.filter(d => d.documentKey !== 'privacy');
}

export function consentFor(docs: ReadonlyArray<{ documentKey: LegalKey; documentVersion?: string; version?: string }>): LegalConsent {
  return { accepted: true, documents: contractual(docs).map(d => ({ documentKey: d.documentKey, documentVersion: String(d.documentVersion ?? d.version) })) };
}

/** Enlace estable a la versión exacta de una instantánea (las anteriores siguen públicas). */
export function snapshotLink(doc: SnapshotLegalDocument): { path: string[]; query: { version: string } } {
  return { path: ['/legal', doc.documentKey], query: { version: doc.version } };
}

