import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { RepetitionActivity } from '../models/course.model';
import { environment } from '../../../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class RepetitionActivityService {
  private apiUrl = `${environment.apiUrl}/repetition-activities`;

  constructor(private http: HttpClient) {}

  getActivitiesByStory(storyId: number): Observable<RepetitionActivity[]> {
    return this.http.get<RepetitionActivity[]>(`${this.apiUrl}/story/${storyId}`);
  }

  createActivity(formData: FormData): Observable<RepetitionActivity> {
    return this.http.post<RepetitionActivity>(this.apiUrl, formData);
  }

  updateActivity(id: number, data: FormData | Partial<RepetitionActivity>): Observable<RepetitionActivity> {
    return this.http.put<RepetitionActivity>(`${this.apiUrl}/${id}`, data);
  }

  deleteActivity(id: number): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/${id}`);
  }
}
