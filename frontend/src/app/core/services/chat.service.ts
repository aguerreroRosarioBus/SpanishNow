import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import {
  AvailableTeacher, ChatMessage, Conversation, ConversationPage, MessagePage, UnreadSummary
} from '../models/chat.model';
import { environment } from '../../../environments/environment';

/** API del chat privado (CONTRATO.md §9.2). */
@Injectable({ providedIn: 'root' })
export class ChatService {
  private http = inject(HttpClient);
  private apiUrl = `${environment.apiUrl}/conversations`;

  availableTeachers(): Observable<AvailableTeacher[]> {
    return this.http.get<AvailableTeacher[]>(`${environment.apiUrl}/teachers/available`);
  }

  list(cursor: string | null = null): Observable<ConversationPage> {
    const params = cursor ? new HttpParams().set('cursor', cursor) : undefined;
    return this.http.get<ConversationPage>(this.apiUrl, { params });
  }

  unread(): Observable<UnreadSummary> { return this.http.get<UnreadSummary>(`${this.apiUrl}/unread`); }

  start(teacherId: number): Observable<Conversation> { return this.http.post<Conversation>(this.apiUrl, { teacherId }); }

  get(id: number): Observable<Conversation> { return this.http.get<Conversation>(`${this.apiUrl}/${id}`); }

  /** Sin cursor: los últimos; `beforeSeq`: página anterior; `afterSeq`: nuevos (polling). Siempre ascendente. */
  messages(id: number, cursor: { beforeSeq?: number; afterSeq?: number } = {}, limit = 30): Observable<MessagePage> {
    let params = new HttpParams().set('limit', String(limit));
    if (cursor.beforeSeq !== undefined) params = params.set('beforeSeq', String(cursor.beforeSeq));
    if (cursor.afterSeq !== undefined) params = params.set('afterSeq', String(cursor.afterSeq));
    return this.http.get<MessagePage>(`${this.apiUrl}/${id}/messages`, { params });
  }

  /** Reintentar con el mismo clientMessageId nunca duplica el mensaje (CHAT-03). */
  send(id: number, clientMessageId: string, body: string): Observable<ChatMessage> {
    return this.http.post<ChatMessage>(`${this.apiUrl}/${id}/messages`, { clientMessageId, body });
  }

  markRead(id: number, seq: number): Observable<{ lastReadSeq: number }> {
    return this.http.post<{ lastReadSeq: number }>(`${this.apiUrl}/${id}/read`, { seq });
  }

  block(id: number): Observable<Conversation> { return this.http.post<Conversation>(`${this.apiUrl}/${id}/block`, {}); }
  unblock(id: number): Observable<Conversation> { return this.http.delete<Conversation>(`${this.apiUrl}/${id}/block`); }
  report(id: number, reason: string): Observable<Conversation> { return this.http.post<Conversation>(`${this.apiUrl}/${id}/report`, { reason }); }
}
