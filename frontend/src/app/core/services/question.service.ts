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

  createQuestionWithAudio(data: Partial<Question>, audioFile: File): Observable<Question> {
    const formData = new FormData();
    formData.append('storyId', data.storyId!.toString());
    formData.append('questionText', data.questionText!);
    formData.append('answerType', data.answerType!);

    if (data.correctAnswer) {
      formData.append('correctAnswer', data.correctAnswer);
    }

    if (data.options && Array.isArray(data.options)) {
      formData.append('options', JSON.stringify(data.options));
    }

    formData.append('audio', audioFile);

    return this.http.post<Question>(this.apiUrl, formData);
  }

  updateQuestion(id: number, data: Partial<Question>): Observable<Question> {
    return this.http.put<Question>(`${this.apiUrl}/${id}`, data);
  }

  updateQuestionWithAudio(id: number, data: Partial<Question>, audioFile: File): Observable<Question> {
    const formData = new FormData();

    if (data.questionText) {
      formData.append('questionText', data.questionText);
    }

    if (data.answerType) {
      formData.append('answerType', data.answerType);
    }

    if (data.correctAnswer) {
      formData.append('correctAnswer', data.correctAnswer);
    }

    if (data.options && Array.isArray(data.options)) {
      formData.append('options', JSON.stringify(data.options));
    }

    formData.append('audio', audioFile);

    return this.http.put<Question>(`${this.apiUrl}/${id}`, formData);
  }

  deleteQuestion(id: number): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/${id}`);
  }
}
