import { inject, Injectable } from '@angular/core';
import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import { LocalIntent, TimeInterval } from '../time/class-time';

export interface SessionParticipant { userId: number; name: string; status: string; acceptedVersion: number | null; attendance: string; purchaseId?: number }
export interface SessionProposal extends TimeInterval { version: number; status: string; kind: string; expiresAt: string; timeZone: string; localStart: string; utcOffset: string; minutes: number; charge?: string; leadTimeException: boolean }
export interface ClassSession extends TimeInterval {
  id: number; teacherId: number; teacher: { id: number; name: string; timeZone: string }; kind: string; cohortId: number | null; liveClassId?: number | null; whiteboardJoinCode?: string | null;
  status: string; version: number; minutes: number; timeZone: string; localStart: string; utcOffset: string;
  participants: SessionParticipant[]; proposal: SessionProposal | null; proposals: SessionProposal[];
  rules: { freeCancelHours: number; arrivalToleranceMinutes: number } | null; groupResolutionRequired: boolean; timeZoneRulesChanged: boolean;
  sync: { provider: string; status: string; syncedVersion: number; lastError?: string | null }[]; serverNow: string; replacementSessionId: number | null;
  purchases?: { id: number; expiresAt: string; unitsAvailable: number; unitsReserved: number; unitsConsumed: number; extensionEligible?: boolean }[];
  extensionRequests?: { userId: number; purchaseId: number; unavailableMinutes: number }[];
}
export interface ScheduleOptions {
  studentId: number | null; students: { id: number; name: string }[];
  purchases: { id: number; cohortId: number | null; minutesPerSession: number; seatsCovered: number; status: string; expiresAt: string; available: number; beneficiaryIds: number[] }[];
  cohorts: { id: number; groupSize: number; minutesPerSession: number; formingDeadlineAt: string; memberIds: number[] }[];
  whiteboards?: { id: number; title: string }[];
}
export interface SessionRequest { intent: LocalIntent; participants?: { userId: number; purchaseId: number | null }[]; cohortId?: number; liveClassId?: number; version?: number; leadTimeException?: boolean; reason?: string; requestedByStudentId?: number; chargeWaivedReason?: string }
@Injectable({ providedIn: 'root' })
export class ClassSessionsService {
  private http = inject(HttpClient);
  private api = `${environment.apiUrl}/class-sessions`;
  list(from?: string, to?: string) { let params = new HttpParams(); if (from) params = params.set('from', from); if (to) params = params.set('to', to); return this.http.get<{ items: ClassSession[]; truncated: boolean }>(this.api, { params }); }
  get(id: number) { return this.http.get<ClassSession>(`${this.api}/${id}`); }
  options(conversationId?: number) { return this.http.get<ScheduleOptions>(`${this.api}/options`, { params: conversationId ? { conversationId } : {} }); }
  reminders() { return this.http.get<{ items: { id: string; sessionId: number; startsAt: string; timeZone: string; minutes: number }[] }>(`${this.api}/reminders`); }
  create(body: SessionRequest, key: string) { return this.http.post<ClassSession>(this.api, body, { headers: new HttpHeaders({ 'Idempotency-Key': key }) }); }
  reschedule(id: number, body: SessionRequest) { return this.http.post<ClassSession>(`${this.api}/${id}/proposals`, body); }
  respond(id: number, version: number, action: 'accept' | 'decline', acknowledgeCharge = false) { return this.http.post<ClassSession>(`${this.api}/${id}/proposals/${version}/${action}`, { acknowledgeCharge }); }
  cancel(id: number, body: { version: number; reason: string; keepGroup?: boolean; requestedByStudentId?: number; chargeWaivedReason?: string; acknowledgeCharge?: boolean }) { return this.http.post<ClassSession>(`${this.api}/${id}/cancel`, body); }
  attendance(id: number, body: { version: number; userId: number; attendance: string; reason: string }) { return this.http.post<ClassSession>(`${this.api}/${id}/attendance`, body); }
  adjustment(id: number, body: { version: number; purchaseId: number; kind: string; reason: string; unavailableMinutes?: number }) { return this.http.post<ClassSession>(`${this.api}/${id}/adjustment`, body); }
  requestExtension(id: number, body: { version: number; purchaseId: number; reason: string; unavailableMinutes: number }) { return this.http.post<ClassSession>(`${this.api}/${id}/requestExtension`, body); }
  join(id: number) { return this.http.get<{ joinUrl?: string; hostUrl?: string; manual: boolean }>(`${this.api}/${id}/join`); }
  /** ICS de la versión vigente (W07): sirve sin conectar Google. */
  ics(id: number) { return this.http.get(`${this.api}/${id}/calendar.ics`, { responseType: 'blob' }); }
  retrySync(id: number) { return this.http.post<ClassSession>(`${this.api}/${id}/sync/retry`, {}); }
}
