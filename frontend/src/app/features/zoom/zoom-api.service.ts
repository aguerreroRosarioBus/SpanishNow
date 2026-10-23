import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { I18nService } from '../../core/i18n/i18n.service';
import { environment } from '../../../environments/environment';
export interface ZoomStatus {
  fake: boolean; status: string; accountEmail: string | null; lastError: string | null;
  capabilities: { maxMinutes: number; maxParticipants: number } | null;
}
export interface ZoomSessionStatus { fake?: boolean; status: string; manual: boolean; lastError: string | null }
export interface ZoomSession extends ZoomSessionStatus { id: number; version: number; startsAt: string; minutes: number; upcomingWithoutMeeting: boolean }
@Injectable({ providedIn: 'root' })
export class ZoomApi {
  private http = inject(HttpClient);
  private i18n = inject(I18nService);
  private url = `${environment.apiUrl}/integrations/zoom`;
  status() { return this.http.get<ZoomStatus>(this.url); }
  connect() { return this.http.post<{ url: string; fake: boolean }>(`${this.url}/connect`, {}); }
  complete(token: string) { return this.http.post<ZoomStatus>(`${this.url}/complete`, { token }); }
  disconnect() { return this.http.delete<ZoomStatus>(this.url); }
  sessions() { return this.http.get<{ items: ZoomSession[] }>(`${this.url}/sessions`); }
  session(id: number) { return this.http.get<ZoomSessionStatus>(`${this.url}/sessions/${id}`); }
  retry(id: number) { return this.http.post<{ queued: boolean }>(`${this.url}/sessions/${id}/retry`, {}); }
  manual(id: number, version: number, joinUrl: string | null) { return this.http.put<{ manual: boolean }>(`${this.url}/sessions/${id}/manual-link`, { version, joinUrl }); }
  join(id: number) { return this.http.get<{ hostUrl?: string; joinUrl?: string; manual: boolean }>(`${environment.apiUrl}/class-sessions/${id}/join`); }
  error(failure: unknown): string {
    const code = (failure as { error?: { code?: string } })?.error?.code;
    const key = `zoom.error.${code}`;
    return this.i18n.t(code && this.i18n.has(key) ? key : 'zoom.error.generic');
  }
}
