import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { IssuedCertificate, PublicCertificate } from '../models/content.model';
import { environment } from '../../../environments/environment';
import { I18nService } from '../i18n/i18n.service';

/** Emisión (alumno) y verificación pública de certificados. */
@Injectable({ providedIn: 'root' })
export class CertificateService {
  private http = inject(HttpClient);
  private i18n = inject(I18nService);
  private apiUrl = environment.apiUrl;

  /** Idempotente: si ya existe devuelve el mismo código. 409 { error, missing } si no es elegible. */
  issue(enrollmentId: number, name?: string): Observable<IssuedCertificate> {
    return this.http.post<IssuedCertificate>(`${this.apiUrl}/enrollments/${enrollmentId}/certificate`, name ? { name } : {});
  }

  verify(code: string): Observable<PublicCertificate> {
    return this.http.get<PublicCertificate>(`${this.apiUrl}/public/certificates/${encodeURIComponent(code)}`);
  }

  /** Link directo al PDF (endpoint público, sin token), en el idioma que el usuario ve ahora. */
  pdfUrl(code: string): string {
    return `${this.apiUrl}/public/certificates/${encodeURIComponent(code)}/pdf?lang=${this.i18n.locale()}`;
  }

  /** Link de verificación para compartir. */
  verificationUrl(code: string): string {
    return `${window.location.origin}/certificates/${encodeURIComponent(code)}`;
  }
}
