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
import { DialogModule } from 'primeng/dialog';
import { PilotTheme } from '../../shared/styles/primeng-theme';
import { RestoreFocusDirective } from '../../shared/directives/restore-focus.directive';

@Component({ selector: 'app-class-session-card', standalone: true, imports: [FormsModule, RouterLink, TranslatePipe, SessionTimeComponent, DialogModule, RestoreFocusDirective],
  templateUrl: './class-session-card.component.html',
  styleUrl: './class-session-card.component.scss'
})
export class ClassSessionCardComponent {
  private readonly pilotTheme = inject(PilotTheme);
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
  /**
   * Propuesta inicial de clase individual vista por la alumna: rechazarla ya anula la clase sin ningún cargo
   * (no hay créditos reservados todavía), así que «Cancelar clase» no agrega nada y se oculta.
   * En cambio, ante un cambio de horario de una clase confirmada o una clase en grupo no son equivalentes.
   */
  rejectIsEnough = computed(() => {
    const s = this.session(), p = this.selectedProposal();
    return this.canRespond() && !!s && p?.kind === 'initial' && s.kind === 'individual';
  });
  /** Texto que explica qué diferencia a «Cancelar clase» de «Rechazar» cuando ambas están disponibles para la alumna. */
  cancelHint = computed(() => {
    const s = this.session(), p = this.selectedProposal();
    if (!s || !p || !this.canRespond()) return '';
    return p.kind === 'reschedule' ? 'schedule.cancelHintReschedule' : s.kind === 'group' ? 'schedule.cancelHintGroup' : '';
  });
  proposalView = computed(() => {
    const p = this.selectedProposal(), s = this.session();
    return p?.status === 'pending' ? p : s;
  });
  /** Clase que ya no se va a dictar: se muestra atenuada. */
  inactive = computed(() => ['cancelled', 'declined', 'expired'].includes(this.session()?.status || ''));
  statusTone = computed(() => {
    switch (this.session()?.status) {
      case 'confirmed': return 'success';
      case 'draft': case 'forming': case 'proposed': return 'warning';
      case 'declined': case 'teacher_no_show': case 'student_no_show': return 'danger';
      case 'completed': return 'info';
      default: return 'neutral';
    }
  });
  /** Quién da la clase para la alumna; con quién la dicta, para la docente. */
  title = computed(() => {
    const s = this.session(); if (!s) return '';
    return this.teacher() ? (s.participants.map(p => p.name).join(', ') || s.teacher.name) : s.teacher.name;
  });
  hasPendingSync = computed(() => (this.session()?.sync || []).some(r => r.status !== 'ready'));
  /** El botón principal de la reunión: solo en una clase confirmada que todavía no terminó. */
  canJoin(): boolean {
    const s = this.session(); if (!s || s.status !== 'confirmed') return false;
    return Date.parse(s.endsAt) > Date.now() + this.clockOffset;
  }
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
  closeDecision(): void { if (!this.busy()) this.decision.set(null); }
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
