import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { CheckoutResponse, CheckoutSession, PublicCourse, PublicCourseDetail } from '../models/sales.model';
import { environment } from '../../../environments/environment';

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

  checkout(courseId: number): Observable<CheckoutResponse> {
    return this.http.post<CheckoutResponse>(`${this.apiUrl}/checkout`, { courseId });
  }

  getCheckoutSession(sessionId: string): Observable<CheckoutSession> {
    return this.http.get<CheckoutSession>(`${this.apiUrl}/checkout/session/${encodeURIComponent(sessionId)}`);
  }
}
