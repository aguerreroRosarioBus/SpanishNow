import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { Enrollment, Progress } from '../models/course.model';
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

  getProgress(enrollmentId: number): Observable<Progress[]> {
    return this.http.get<Progress[]>(`${this.apiUrl}/${enrollmentId}/progress`);
  }

  markStoryCompleted(enrollmentId: number, storyId: number): Observable<Progress> {
    return this.http.post<Progress>(`${this.apiUrl}/progress`, {
      enrollmentId,
      storyId
    });
  }
}
