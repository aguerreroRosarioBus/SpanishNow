import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { Vocabulary } from '../models/course.model';
import { environment } from '../../../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class VocabularyService {
  private apiUrl = `${environment.apiUrl}/vocabulary`;

  constructor(private http: HttpClient) {}

  getVocabularyByUnit(unitId: number): Observable<Vocabulary[]> {
    return this.http.get<Vocabulary[]>(`${this.apiUrl}/unit/${unitId}`);
  }

  createVocabulary(formData: FormData): Observable<Vocabulary> {
    return this.http.post<Vocabulary>(this.apiUrl, formData);
  }

  updateVocabulary(id: number, formData: FormData): Observable<Vocabulary> {
    return this.http.put<Vocabulary>(`${this.apiUrl}/${id}`, formData);
  }

  deleteVocabulary(id: number): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/${id}`);
  }
}
