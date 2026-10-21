import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, map } from 'rxjs';
import { Enrollment, EnrollmentProgress, ResetProgressResult, StoryProgress } from '../models/course.model';
import { environment } from '../../../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class EnrollmentService {
  private apiUrl = `${environment.apiUrl}/enrollments`;

  constructor(private http: HttpClient) {}

  getMyCourses(): Observable<Enrollment[]> {
    return this.http.get<Enrollment[]>(`${this.apiUrl}/my-courses`);
  }

  enroll(courseId: number): Observable<Enrollment> {
    return this.http.post<Enrollment>(this.apiUrl, { courseId });
  }

  /** Avance por historia (LessonProgress) de una inscripción. */
  getProgress(enrollmentId: number): Observable<StoryProgress[]> {
    return this.getProgressSummary(enrollmentId).pipe(map(summary => summary.stories));
  }

  /**
   * Avance completo: historias, quizzes y certificado. Acepta la forma anterior (arreglo de historias)
   * y la nueva `{ stories, quizzes, certificate }`.
   */
  getProgressSummary(enrollmentId: number): Observable<EnrollmentProgress> {
    return this.http.get<StoryProgress[] | Partial<EnrollmentProgress>>(`${this.apiUrl}/${enrollmentId}/progress`).pipe(
      map(body => normalizeProgress(body))
    );
  }

  resetCourseProgress(enrollmentId: number): Observable<ResetProgressResult> {
    return this.http.delete<ResetProgressResult>(`${this.apiUrl}/${enrollmentId}/reset-progress`);
  }
}

export function normalizeProgress(body: StoryProgress[] | Partial<EnrollmentProgress> | null | undefined): EnrollmentProgress {
  if (Array.isArray(body)) return { stories: body, quizzes: [], certificate: null };
  return { stories: body?.stories ?? [], quizzes: body?.quizzes ?? [], certificate: body?.certificate ?? null };
}
