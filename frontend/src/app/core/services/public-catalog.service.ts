import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { CheckoutQuote, CheckoutResponse, CheckoutSession, PublicCourse, PublicCourseDetail } from '../models/sales.model';
import { environment } from '../../../environments/environment';
import type { CheckoutEvidence } from '../../features/legal/legal.model';

/** Catálogo público y checkout (el interceptor agrega el token si hay sesión). */
@Injectable({ providedIn: 'root' })
export class PublicCatalogService {
  private apiUrl = environment.apiUrl;

  constructor(private http: HttpClient) {}

  getCourses(): Observable<PublicCourse[]> {
    return this.http.get<PublicCourse[]>(`${this.apiUrl}/public/courses`);
  }

  getCourse(slug: string): Observable<PublicCourseDetail> {
    return this.http.get<PublicCourseDetail>(`${this.apiUrl}/public/courses/${encodeURIComponent(slug)}`);
  }

  /** `email` solo hace falta sin sesión cuando el cupón deja el curso gratis (no pasa por Stripe, que es quien lo pide). */
  /** `evidence` (W02): instantánea vista y aceptación de las versiones legales mostradas. */
  checkout(courseId: number, couponCode?: string | null, email?: string | null, affiliateCode?: string | null, evidence?: CheckoutEvidence | null): Observable<CheckoutResponse> {
    return this.http.post<CheckoutResponse>(`${this.apiUrl}/checkout`, {
      courseId,
      ...(evidence ?? {}),
      ...(couponCode ? { couponCode } : {}),
      ...(email ? { email } : {}),
      ...(affiliateCode ? { affiliateCode } : {})
    });
  }

  /** Precio final con cupón antes de pagar. Errores 400 con `code` de cupón. */
  quote(courseId: number, couponCode: string, affiliateCode?: string | null): Observable<CheckoutQuote> {
    return this.http.post<CheckoutQuote>(`${this.apiUrl}/checkout/quote`, { courseId, couponCode, ...(affiliateCode ? { affiliateCode } : {}) });
  }

  getCheckoutSession(sessionId: string): Observable<CheckoutSession> {
    return this.http.get<CheckoutSession>(`${this.apiUrl}/checkout/session/${encodeURIComponent(sessionId)}`);
  }
}
