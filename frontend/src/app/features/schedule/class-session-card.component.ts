import { Component, DestroyRef, computed, effect, inject, input, output, signal, untracked } from '@angular/core';
import { DOCUMENT } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Observable, Subscription } from 'rxjs';
import { ClassSession, ClassSessionsService, SessionProposal } from '../../core/services/class-sessions.service';
import { AuthService } from '../../core/services/auth.service';
import { UserPreferencesService } from '../../core/services/user-preferences.service';
import { FeaturesService } from '../../core/services/features.service';
import { I18nService } from '../../core/i18n/i18n.service';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { isAtLeastHoursBefore, isTimeZone } from '../../core/time/class-time';
import { SessionTimeComponent } from './session-time.component';

@Component({ selector: 'app-class-session-card', standalone: true, imports: [FormsModule, RouterLink, TranslatePipe, SessionTimeComponent],
  templateUrl: './class-session-card.component.html',
  styles: [`:host{display:block}.schedule-card{padding:1rem;border:1px solid var(--color-border,#ddd);border-radius:var(--radius-md,10px);background:var(--color-surface,#fff);margin:.75rem 0}.actions{display:flex;gap:.5rem;flex-wrap:wrap}.participants{list-style:none;padding:0;font-size:.9em}fieldset{margin-top:1rem;padding:.75rem;border:1px solid var(--color-border,#ddd);border-radius:8px}label{display:block;margin:.5rem 0}.notice{font-size:.9em;color:var(--color-text-muted,#625e59)}.sync{font-size:.85em}legend{font-size:1rem}h2{font-size:1.1rem}`]
})
export class ClassSessionCardComponent {
  sessionId = input.required<number>();
  proposalVersion = input<number | null>(null);
  changed = output<ClassSession>();
  private api = inject(ClassSessionsService);
  readonly auth = inject(AuthService);
  readonly preferences = inject(UserPreferencesService);
  readonly features = inject(FeaturesService);
  readonly i18n = inject(I18nService);
  private document = inject(DOCUMENT);
  private destroyRef = inject(DestroyRef);
  session = signal<ClassSession | null>(null);
  failure = signal<unknown>(null);
  loading = signal(false); busy = signal(false);
  decision = signal<'accept' | 'decline' | 'cancel' | null>(null);
  reason = ''; waiver = ''; requestedBy = 0; acknowledge = false;
  attendanceUser = 0; attendanceStatus = 'attended'; attendanceReason = '';
  adjustmentPurchase = 0; adjustmentKind = 'waive_charge'; adjustmentReason = ''; unavailableMinutes = 50;
  meeting = signal<string | null>(null);
  /** La alumna pidió el enlace y la reunión de Zoom aún no existe (no es un problema de conexión suyo). */
  meetingNotReady = signal(false);
  private generation = 0;
  private clockOffset = 0;
  private request?: Subscription;
  private actionRequest?: Subscription;
  error = computed(() => this.failure() ? this.i18n.errorMessage(this.failure()) : '');
  teacher = computed(() => this.session()?.teacherId === this.auth.currentUser()?.id);
  canAdjust = computed(() => this.teacher() && this.auth.hasPermission('class_credits.adjust'));
  zone = computed(() => this.preferences.preferences()?.timeZone || this.session()?.timeZone || 'UTC');
  zoneReady = computed(() => Boolean(this.preferences.preferences()?.timeZoneConfirmedAt));
  selectedProposal = computed(() => {
    const s = this.session(); if (!s) return null;
    return this.proposalVersion() ? s.proposals.find(p => p.version === this.proposalVersion()) || null : s.proposal;
  });
  canRespond = computed(() => {
    const s = this.session(), p = this.selectedProposal();
    return !!s && !!p && p.status === 'pending' && p.version === s.version
      && Date.parse(p.expiresAt) > Date.now() && !this.teacher()
      && s.participants.some(a => a.userId === this.auth.currentUser()?.id && a.status !== 'cancelled')
      && this.features.enabled('class_scheduling');
  });
  proposalView = computed(() => {
    const p = this.selectedProposal(), s = this.session();
    return p?.status === 'pending' ? p : s;
  });
  hasPendingSync = computed(() => (this.session()?.sync || []).some(r => r.status !== 'ready'));
  lateCancel(): boolean {
    const s = this.session(); if (!s || (this.teacher() && (!this.requestedBy || this.waiver.trim())) || s.status !== 'confirmed') return false;
    return !isAtLeastHoursBefore(s.startsAt, new Date(Date.now() + this.clockOffset).toISOString(), s.rules?.freeCancelHours ?? 24);
  }

  constructor() {
    this.features.load();
    effect(() => { const id = this.sessionId(); const account = this.auth.currentUser()?.id; untracked(() => {
      this.generation++; this.request?.unsubscribe(); this.actionRequest?.unsubscribe(); this.busy.set(false);
      this.session.set(null); this.decision.set(null); this.meeting.set(null); this.meetingNotReady.set(false); if (id && account) this.refresh();
    }); });
    const timer = setInterval(() => { if (this.document.visibilityState === 'visible' && !this.busy() && !this.decision()) this.refresh(false); }, 15000);
    this.destroyRef.onDestroy(() => { clearInterval(timer); this.request?.unsubscribe(); this.actionRequest?.unsubscribe(); });
  }
  refresh(showLoading = true): void {
    const generation = this.generation;
    this.request?.unsubscribe(); if (showLoading) { this.loading.set(true); this.failure.set(null); }
    this.request = this.api.get(this.sessionId()).subscribe({ next: s => {
      if (generation !== this.generation) return; this.clockOffset = Date.parse(s.serverNow) - Date.now(); this.session.set(s); this.loading.set(false);
    }, error: err => { if (generation === this.generation) { this.failure.set(err); this.loading.set(false); } } });
  }
  startDecision(action: 'accept' | 'decline' | 'cancel'): void { this.decision.set(action); this.acknowledge = false; this.failure.set(null); }
  private act(request: Observable<ClassSession>): void {
    if (this.busy()) return;
    const generation = this.generation; this.request?.unsubscribe(); this.busy.set(true); this.failure.set(null);
    this.actionRequest = request.subscribe({ next: s => {
      if (generation !== this.generation) return; this.busy.set(false); this.session.set(s); this.decision.set(null); this.changed.emit(s);
    }, error: err => { if (generation !== this.generation) return; this.busy.set(false); this.failure.set(err);
      if (err.status === 409) { this.decision.set(null); this.refresh(false); }
    } });
  }
  respond(): void {
    const s = this.session(), p = this.selectedProposal(), action = this.decision(); if (!s || !p || (action !== 'accept' && action !== 'decline') || !this.canRespond()) return;
    if (action === 'accept' && (!this.zoneReady() || !this.acknowledge)) return;
    this.act(this.api.respond(s.id, p.version, action, this.acknowledge));
  }
  cancel(): void {
    const s = this.session(); if (!s || this.reason.trim().length < 3 || (this.lateCancel() && !this.acknowledge)) return;
    this.act(this.api.cancel(s.id, { version: s.version, reason: this.reason, ...(this.teacher() && this.requestedBy ? { requestedByStudentId: Number(this.requestedBy) } : {}),
      ...(this.teacher() && this.waiver.trim() ? { chargeWaivedReason: this.waiver } : {}), acknowledgeCharge: this.acknowledge }));
  }
  keepGroup(): void {
    const s = this.session(); if (s && this.reason.trim().length >= 3) this.act(this.api.cancel(s.id, { version: s.version, reason: this.reason, keepGroup: true }));
  }
  markAttendance(): void {
    const s = this.session(); if (!s || !this.attendanceUser || this.attendanceReason.trim().length < 3) return;
    this.act(this.api.attendance(s.id, { version: s.version, userId: Number(this.attendanceUser), attendance: this.attendanceStatus, reason: this.attendanceReason }));
  }
  adjust(): void {
    const s = this.session(); if (!s || !this.canAdjust() || !this.adjustmentPurchase || this.adjustmentReason.trim().length < 3) return;
    this.act(this.api.adjustment(s.id, { version: s.version, purchaseId: Number(this.adjustmentPurchase), kind: this.adjustmentKind,
      reason: this.adjustmentReason, ...(this.adjustmentKind === 'extend_validity' ? { unavailableMinutes: Number(this.unavailableMinutes) } : {}) }));
  }
  requestExtension(purchaseId: number): void {
    const s = this.session(); if (!s || this.adjustmentReason.trim().length < 3) return;
    this.act(this.api.requestExtension(s.id, { version: s.version, purchaseId, reason: this.adjustmentReason, unavailableMinutes: Number(this.unavailableMinutes) }));
  }
  participantName(userId: number): string { return this.session()?.participants.find(p => p.userId === userId)?.name || ''; }
  private static readonly syncCodes = ['external_changed', 'external_deleted', 'integration_not_connected', 'authorization_lost', 'sync_failed'];
  syncMessage(code?: string | null): string { return `calendar.syncError.${code && ClassSessionCardComponent.syncCodes.includes(code) ? code : 'generic'}`; }
  downloadIcs(): void {
    const s = this.session(); if (!s) return;
    this.api.ics(s.id).subscribe({ next: blob => {
      const url = URL.createObjectURL(blob); const link = this.document.createElement('a');
      link.href = url; link.download = `clase-${s.id}.ics`; link.click(); URL.revokeObjectURL(url);
    }, error: error => this.failure.set(error) });
  }
  retrySync(): void { const s = this.session(); if (s) this.act(this.api.retrySync(s.id)); }
  join(): void {
    const generation = this.generation; const s = this.session(); if (!s) return;
    this.meetingNotReady.set(false);
    this.actionRequest = this.api.join(s.id).subscribe({ next: result => {
      if (generation !== this.generation) return;
      try { const u = new URL((this.teacher() && result.hostUrl) || result.joinUrl || ''); if (u.protocol === 'https:' && (u.hostname === 'zoom.us' || u.hostname.endsWith('.zoom.us'))) this.meeting.set(u.href); } catch { /* no se muestra una URL inválida */ }
    }, error: error => {
      if (generation !== this.generation) return;
      // «Conecta el servicio» es un mensaje para la docente: la alumna solo necesita saber que la reunión no está lista.
      if (!this.teacher() && (error as { error?: { code?: unknown } } | null)?.error?.code === 'integration_not_connected') this.meetingNotReady.set(true);
      else this.failure.set(error);
    } });
  }
  displayProposal(p: SessionProposal): string { return this.i18n.formatInstant(p.expiresAt, isTimeZone(this.zone()) ? this.zone() : 'UTC'); }
}
