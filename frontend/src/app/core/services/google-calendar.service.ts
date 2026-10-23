import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';

export interface CalendarChoice { id: string; summary: string; primary: boolean; accessRole: string }
export interface GoogleCalendarStatus {
  provider: 'google_calendar'; enabled: boolean; fake: boolean;
  status: 'pending' | 'connected' | 'needs_attention' | 'revoked' | 'disconnected'; connected: boolean;
  accountEmail?: string | null; targetCalendarId?: string | null; busyCalendarIds?: string[]; lastError?: string | null; version?: number;
  calendars: CalendarChoice[]; calendarsError?: string;
}

/** Google Calendar del docente (W07, CONTRATO §9.8). Las credenciales nunca llegan al navegador. */
@Injectable({ providedIn: 'root' })
export class GoogleCalendarService {
  private http = inject(HttpClient);
  private api = `${environment.apiUrl}/integrations/google-calendar`;
  status() { return this.http.get<GoogleCalendarStatus>(this.api); }
  connect() { return this.http.post<{ url: string }>(`${this.api}/connect`, {}); }
  /** Confirma la conexión pendiente que dejó el callback; solo vale para quien la inició (token de un solo uso). */
  complete(token: string) { return this.http.post<GoogleCalendarStatus>(`${this.api}/complete`, { token }); }
  update(body: { targetCalendarId?: string; busyCalendarIds?: string[]; version?: number }) { return this.http.patch<GoogleCalendarStatus>(this.api, body); }
  disconnect() { return this.http.delete<{ status: string }>(this.api); }
}
