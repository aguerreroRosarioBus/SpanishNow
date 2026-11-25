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
import { isLapsed } from './session-lapse';
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
  listedSession = input<ClassSession | null>(null);
  /** La agenda muestra una sola vez los avisos de zona de toda la página; la tarjeta no los repite (D-04). */
  pageNotices = input(false);
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
  private meetingFailure = signal<unknown>(null);
  readonly meetingError = computed(() => {
    const error = this.meetingFailure();
    if (!error) return '';
    const code = this.errorCode(error);
    if (code === 'zoom_meeting_pending' || (!this.teacher() && code === 'integration_not_connected')) {
      return this.i18n.t(this.teacher() ? 'schedule.meetingMissingTeacher' : 'schedule.meetingNotReady');
    }
    return this.i18n.errorMessage(error);
  });
  private syncFailure = signal<unknown>(null);
  readonly syncQueued = signal(false);
  readonly syncError = computed(() => {
    const error = this.syncFailure();
    if (!error) return '';
    return this.errorCode(error) === 'integration_not_connected'
      ? this.i18n.t('schedule.syncConnectFirst') : this.i18n.errorMessage(error);
  });
  private errorCode(error: unknown): unknown {
    return (error as { error?: { code?: unknown } } | null)?.error?.code;
  }
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
  /** Sin confirmar y con el plazo de respuesta o la propia clase ya pasados: se muestra «Venció» aunque el worker no lo haya marcado. */
  lapsed = computed(() => { const s = this.session(); return !!s && isLapsed(s, Date.now() + this.clockOffset); });
  /** Propuesta pendiente cuyo plazo de respuesta ya pasó. */
  proposalExpired = computed(() => { const p = this.selectedProposal(); return p?.status === 'pending' && Date.parse(p.expiresAt) <= Date.now() + this.clockOffset; });
  displayStatus = computed(() => this.lapsed() ? 'expired' : (this.session()?.status || ''));
  canRespond = computed(() => {
    const s = this.session(), p = this.selectedProposal();
    return !!s && !!p && p.status === 'pending' && p.version === s.version && !this.lapsed()
      && Date.parse(p.expiresAt) > Date.now() + this.clockOffset && !this.teacher()
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
  inactive = computed(() => this.lapsed() || ['cancelled', 'declined', 'expired'].includes(this.session()?.status || ''));
  statusTone = computed(() => {
    switch (this.displayStatus()) {
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
  /** Reprogramar: no en clases que ya pasaron; una propuesta vencida se trata como «vencida» (solo las de grupo se reprograman). */
  canReschedule = computed(() => {
    const s = this.session(); if (!s || !this.teacher() || !this.features.enabled('class_scheduling')) return false;
    if (this.lapsed()) return s.kind === 'group' && Date.parse(s.endsAt) > Date.now() + this.clockOffset;
    return ['forming', 'proposed', 'confirmed'].includes(s.status) || (s.kind === 'group' && ['expired', 'declined'].includes(s.status));
  });
  canCancel = computed(() => { const s = this.session(); return !!s && !this.lapsed() && ['forming', 'proposed', 'confirmed'].includes(s.status) && !this.rejectIsEnough(); });
  hasPendingSync = computed(() => {
    const refs = this.session()?.sync ?? [];
    return refs.some(ref => ref.status !== 'ready')
      || (['zoom', 'google_calendar'] as const).some(provider => this.features.enabled(provider) && !refs.some(ref => ref.provider === provider));
  });
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
      this.session.set(null); this.decision.set(null); this.meeting.set(null); this.meetingFailure.set(null); this.syncFailure.set(null); this.syncQueued.set(false); if (id && account && !this.listedSession()) this.refresh();
    }); });
    effect(() => {
      const listed = this.listedSession();
      if (!listed || listed.id !== this.sessionId() || !this.auth.currentUser()) return;
      untracked(() => this.setSession(listed));
    });
    const timer = setInterval(() => {
      if (!this.listedSession() && this.document.visibilityState === 'visible' && !this.busy() && !this.decision()) this.refresh(false);
    }, 15000);
    this.destroyRef.onDestroy(() => { clearInterval(timer); this.request?.unsubscribe(); this.actionRequest?.unsubscribe(); });
  }
  refresh(showLoading = true): void {
    const generation = this.generation;
    this.request?.unsubscribe(); if (showLoading) { this.loading.set(true); this.failure.set(null); }
    this.request = this.api.get(this.sessionId()).subscribe({ next: s => {
      if (generation !== this.generation) return; this.setSession(s); this.loading.set(false);
    }, error: err => { if (generation === this.generation) { this.failure.set(err); this.loading.set(false); } } });
  }
  private setSession(value: ClassSession): void {
    this.clockOffset = Date.parse(value.serverNow) - Date.now();
    this.session.set(value);
  }
  startDecision(action: 'accept' | 'decline' | 'cancel'): void { this.decision.set(action); this.acknowledge = false; this.failure.set(null); }
  closeDecision(): void { if (!this.busy()) this.decision.set(null); }
  private act(request: Observable<ClassSession>, sync = false): void {
    if (this.busy()) return;
    const generation = this.generation; this.request?.unsubscribe(); this.busy.set(true); this.failure.set(null);
    this.actionRequest = request.subscribe({ next: s => {
      if (generation !== this.generation) return; this.busy.set(false); this.setSession(s); this.decision.set(null);
      if (sync) this.syncQueued.set(s.sync.some(ref => ref.status === 'pending'));
      this.changed.emit(s);
    }, error: err => { if (generation !== this.generation) return; this.busy.set(false);
      if (sync) { this.syncFailure.set(err); return; }
      this.failure.set(err);
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
  retrySync(): void {
    const s = this.session();
    if (!s || this.busy()) return;
    this.syncFailure.set(null);
    this.syncQueued.set(false);
    this.act(this.api.retrySync(s.id), true);
  }
  join(): void {
    const generation = this.generation; const s = this.session(); if (!s) return;
    if (this.busy()) return;
    this.busy.set(true);
    this.meetingFailure.set(null);
    this.actionRequest = this.api.join(s.id).subscribe({ next: result => {
      if (generation !== this.generation) return;
      this.busy.set(false);
      try { const u = new URL((this.teacher() && result.hostUrl) || result.joinUrl || ''); if (u.protocol === 'https:' && (u.hostname === 'zoom.us' || u.hostname.endsWith('.zoom.us'))) this.meeting.set(u.href); } catch { /* no se muestra una URL inválida */ }
    }, error: error => {
      if (generation !== this.generation) return;
      this.busy.set(false);
      this.meetingFailure.set(error);
    } });
  }
  displayProposal(p: SessionProposal): string { return this.i18n.formatInstant(p.expiresAt, isTimeZone(this.zone()) ? this.zone() : 'UTC'); }
}
