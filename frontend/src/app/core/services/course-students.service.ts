import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { CourseStudent, ImportResult } from '../models/sales.model';
import { environment } from '../../../environments/environment';

/** Alumnos de un curso (vista del docente) e importación de compradores de Hotmart. */
@Injectable({ providedIn: 'root' })
export class CourseStudentsService {
  private apiUrl = `${environment.apiUrl}/courses`;

  constructor(private http: HttpClient) {}

  list(courseId: number): Observable<CourseStudent[]> {
    return this.http.get<CourseStudent[]>(`${this.apiUrl}/${courseId}/students`);
  }

  add(courseId: number, email: string, name?: string): Observable<unknown> {
    return this.http.post(`${this.apiUrl}/${courseId}/students`, name ? { email, name } : { email });
  }

  remove(courseId: number, enrollmentId: number): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/${courseId}/students/${enrollmentId}`);
  }

  previewImport(courseId: number, file: File): Observable<ImportResult> {
    const body = new FormData();
    body.append('file', file);
    return this.http.post<ImportResult>(`${this.apiUrl}/${courseId}/students/import/preview`, body);
  }

  import(courseId: number, file: File, sendInvites: boolean): Observable<ImportResult> {
    const body = new FormData();
    body.append('file', file);
    body.append('sendInvites', String(sendInvites));
    return this.http.post<ImportResult>(`${this.apiUrl}/${courseId}/students/import`, body);
  }
}
