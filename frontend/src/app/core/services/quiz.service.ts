import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { QuizAttemptResult, StudentQuiz, UnitQuiz, UnitQuizPayload } from '../models/content.model';
import { environment } from '../../../environments/environment';

/** Quiz de unidad: edición del docente y resolución del alumno. */
@Injectable({ providedIn: 'root' })
export class QuizService {
  private http = inject(HttpClient);
  private apiUrl = `${environment.apiUrl}/units`;

  /** Quiz completo con respuestas correctas (404 si la unidad no tiene). */
  getForTeacher(unitId: number): Observable<UnitQuiz> {
    return this.http.get<UnitQuiz>(`${this.apiUrl}/${unitId}/quiz`);
  }

  save(unitId: number, payload: UnitQuizPayload): Observable<UnitQuiz> {
    return this.http.put<UnitQuiz>(`${this.apiUrl}/${unitId}/quiz`, payload);
  }

  remove(unitId: number): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/${unitId}/quiz`);
  }

  getForStudent(unitId: number): Observable<StudentQuiz> {
    return this.http.get<StudentQuiz>(`${this.apiUrl}/${unitId}/quiz/student`);
  }

  submitAttempt(unitId: number, answers: number[]): Observable<QuizAttemptResult> {
    return this.http.post<QuizAttemptResult>(`${this.apiUrl}/${unitId}/quiz/attempts`, { answers });
  }
}
