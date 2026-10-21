import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { Enrollment, ResetProgressResult, StoryProgress } from '../models/course.model';
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
    return this.http.get<StoryProgress[]>(`${this.apiUrl}/${enrollmentId}/progress`);
  }

  resetCourseProgress(enrollmentId: number): Observable<ResetProgressResult> {
    return this.http.delete<ResetProgressResult>(`${this.apiUrl}/${enrollmentId}/reset-progress`);
  }
}
