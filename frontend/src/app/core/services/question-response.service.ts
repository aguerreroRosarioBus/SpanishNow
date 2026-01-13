import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { QuestionResponse, SubmitResponsePayload, SubmitResponseResult } from '../models/course.model';
import { environment } from '../../../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class QuestionResponseService {
  private apiUrl = `${environment.apiUrl}/question-responses`;

  constructor(private http: HttpClient) {}

  submitResponses(payload: SubmitResponsePayload): Observable<SubmitResponseResult> {
    return this.http.post<SubmitResponseResult>(`${this.apiUrl}/submit`, payload);
  }

  getResponsesForProgress(progressId: number): Observable<QuestionResponse[]> {
    return this.http.get<QuestionResponse[]>(`${this.apiUrl}/progress/${progressId}`);
  }
}
