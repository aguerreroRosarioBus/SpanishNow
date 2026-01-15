import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { Story } from '../models/course.model';
import { environment } from '../../../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class StoryService {
  private apiUrl = `${environment.apiUrl}/stories`;

  constructor(private http: HttpClient) {}

  createStory(data: FormData): Observable<Story> {
    return this.http.post<Story>(this.apiUrl, data);
  }

  updateStory(id: number, data: FormData | Partial<Story>): Observable<Story> {
    return this.http.put<Story>(`${this.apiUrl}/${id}`, data);
  }

  updateStoryOrder(id: number, order: number): Observable<Story> {
    return this.http.patch<Story>(`${this.apiUrl}/${id}/order`, { order });
  }

  deleteStory(id: number): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/${id}`);
  }

  getStory(id: number): Observable<Story> {
    return this.http.get<Story>(`${this.apiUrl}/${id}`);
  }
}
