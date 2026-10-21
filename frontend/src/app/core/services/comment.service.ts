import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { CommentsPage, InboxPage, LessonComment } from '../models/community.model';
import { environment } from '../../../environments/environment';

/** Comentarios por lección (alumno y docente) y bandeja del docente. */
@Injectable({ providedIn: 'root' })
export class CommentService {
  private http = inject(HttpClient);
  private apiUrl = environment.apiUrl;

  list(storyId: number, page = 1): Observable<CommentsPage> {
    return this.http.get<CommentsPage>(`${this.apiUrl}/stories/${storyId}/comments`, { params: new HttpParams().set('page', String(page)) });
  }
  create(storyId: number, body: string, parentId?: number): Observable<LessonComment> {
    return this.http.post<LessonComment>(`${this.apiUrl}/stories/${storyId}/comments`, { body, ...(parentId ? { parentId } : {}) });
  }
  update(id: number, body: string): Observable<LessonComment> { return this.http.put<LessonComment>(`${this.apiUrl}/comments/${id}`, { body }); }
  remove(id: number): Observable<void> { return this.http.delete<void>(`${this.apiUrl}/comments/${id}`); }
  setHidden(id: number, hidden: boolean): Observable<unknown> { return this.http.put(`${this.apiUrl}/comments/${id}/hidden`, { hidden }); }

  inbox(status: 'unanswered' | 'all', courseId: number | null, page = 1): Observable<InboxPage> {
    let params = new HttpParams().set('status', status).set('page', String(page));
    if (courseId) params = params.set('courseId', String(courseId));
    return this.http.get<InboxPage>(`${this.apiUrl}/teacher/comments`, { params });
  }
}
