import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { Question } from '../models/course.model';
import { environment } from '../../../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class QuestionService {
  private apiUrl = `${environment.apiUrl}/questions`;

  constructor(private http: HttpClient) {}

  getQuestionsByStory(storyId: number): Observable<Question[]> {
    return this.http.get<Question[]>(`${this.apiUrl}/story/${storyId}`);
  }

  createQuestion(data: Partial<Question>): Observable<Question> {
    return this.http.post<Question>(this.apiUrl, data);
  }

  updateQuestion(id: number, data: Partial<Question>): Observable<Question> {
    return this.http.put<Question>(`${this.apiUrl}/${id}`, data);
  }

  deleteQuestion(id: number): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/${id}`);
  }
}
