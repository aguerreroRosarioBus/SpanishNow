import { Component, DestroyRef, computed, effect, inject, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Subscription } from 'rxjs';
import { AuthService } from '../../core/services/auth.service';
import { ClassSession, ClassSessionsService, ScheduleOptions, SessionRequest } from '../../core/services/class-sessions.service';
import { FeaturesService } from '../../core/services/features.service';
import { UserPreferencesService } from '../../core/services/user-preferences.service';
import { I18nService } from '../../core/i18n/i18n.service';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { Disambiguation, LocalIntent, TimeError, isTimeZone, resolveLocalIntent } from '../../core/time/class-time';
import { ClassSessionCardComponent } from './class-session-card.component';
import { TimeZoneSelectComponent } from '../../shared/components/time-zone-select/time-zone-select.component';
import { IconComponent } from '../../shared/components/icon/icon.component';
import { SessionTimeComponent } from './session-time.component';
import { DialogModule } from 'primeng/dialog';
import { RestoreFocusDirective } from '../../shared/directives/restore-focus.directive';

interface Draft { localStart: string; timeZone: string; offset: string; disambiguation: Disambiguation; minutes: number }
@Component({ selector: 'app-schedule', standalone: true, imports: [FormsModule, RouterLink, TranslatePipe, ClassSessionCardComponent, SessionTimeComponent, TimeZoneSelectComponent, IconComponent, DialogModule, RestoreFocusDirective],
  templateUrl: './schedule.component.html',
  styleUrl: './schedule.component.scss'
})
export class ScheduleComponent {
  private api = inject(ClassSessionsService);
  readonly auth = inject(AuthService);
  readonly features = inject(FeaturesService);
  readonly preferences = inject(UserPreferencesService);
  readonly i18n = inject(I18nService);
  private route = inject(ActivatedRoute); private router = inject(Router); private destroyRef = inject(DestroyRef);
  sessions = signal<ClassSession[]>([]); options = signal<ScheduleOptions | null>(null);
  notices = signal<{ id: string; sessionId: number; startsAt: string; minutes: number }[]>([]);
  loading = signal(false); busy = signal(false); failure = signal<unknown>(null); truncated = signal(false);
  formOpen = signal(false);
  zoneEditorOpen = signal(false);
  zoneConfirmed = computed(() => !!this.preferences.preferences()?.timeZoneConfirmedAt && this.zoneInput() === this.preferences.preferences()?.timeZone);
  selected = signal<ClassSession | null>(null); editing = signal<ClassSession | null>(null);
  zoneInput = signal(''); private suggested = Intl.DateTimeFormat().resolvedOptions().timeZone;
  readonly deviceZone = this.suggested;
  studentId = signal(0); purchaseId = signal(0); cohortId = signal(0);
  exception = false; reason = ''; requestedBy = 0; waiver = ''; whiteboardId = 0;
  fromDate = ''; toDate = ''; conversationId = 0;
  private selectedId = 0; private editingId = 0;
  draft = signal<Draft>({ localStart: '', timeZone: '', offset: '', disambiguation: 'none', minutes: 50 });
  private key = crypto.randomUUID(); private submittedHash = '';
  private lastSavedZone: string | null | undefined;
  private zoneWasSaving = false;
  private generation = 0; private reads = new Subscription(); private write?: Subscription;
  error = computed(() => this.failure() ? this.i18n.errorMessage(this.failure()) : '');
  teacher = computed(() => this.auth.currentUser()?.role === 'teacher');
  zone = computed(() => this.preferences.preferences()?.timeZone || this.zoneInput() || this.deviceZone || 'UTC');
  zoneReady = computed(() => !!this.preferences.preferences()?.timeZoneConfirmedAt && !this.preferences.saving());
  choices = computed(() => {
    const d = this.draft(); if (!d.localStart || !d.timeZone) return { value: null, intent: null, failure: null, options: [] as { offset: string; startsAt: string }[], alternatives: [] as { localStart: string; timeZone: string; offset: string; startsAt: string }[] };
    let intent: LocalIntent = { ...d, offset: d.offset || '+00:00' };
    try { return { value: resolveLocalIntent(intent), intent, failure: null, options: [], alternatives: [] }; }
    catch (error) {
      const err = error as TimeError;
      // En una hora única, el offset se deriva con la misma regla compartida; el
      // servidor lo recalculará. Una hora repetida nunca entra por este atajo.
      if (err.code === 'offset_mismatch' && !d.offset && typeof err.params['expectedOffset'] === 'string') {
        intent = { ...intent, offset: err.params['expectedOffset'] };
        try { return { value: resolveLocalIntent(intent), intent, failure: null, options: [], alternatives: [] }; } catch { /* mostrar error original */ }
      }
      return { value: null, intent: null, failure: err,
        options: (err.params?.['options'] || []) as { offset: string; startsAt: string }[],
        alternatives: (err.params?.['alternatives'] || []) as { localStart: string; timeZone: string; offset: string; startsAt: string }[] };
    }
  });
  timeError = computed(() => this.choices().failure ? this.i18n.errorMessage({ error: this.choices().failure }) : '');

  constructor() {
    this.features.load();
    effect(() => {
      const saving = this.preferences.saving();
      if (this.zoneWasSaving && !saving && !this.preferences.errorMessage() && this.zoneConfirmed()) this.zoneEditorOpen.set(false);
      this.zoneWasSaving = saving;
    });
    effect(() => { const account = this.auth.currentUser()?.id; untracked(() => {
      this.generation++; this.reads.unsubscribe(); this.reads = new Subscription(); this.write?.unsubscribe();
      this.sessions.set([]); this.selected.set(null); this.editing.set(null); this.options.set(null); this.busy.set(false);
      this.studentId.set(0); this.purchaseId.set(0); this.cohortId.set(0); this.reason = ''; this.waiver = ''; this.exception = false;
      this.whiteboardId = 0;
      this.draft.set({ localStart: '', timeZone: '', offset: '', disambiguation: 'none', minutes: 50 });
      if (account) { this.reload(); this.loadSelection(); }
    }); });
    effect(() => { const zone = this.preferences.preferences()?.timeZone; untracked(() => {
      if (zone && zone !== this.lastSavedZone) { this.zoneInput.set(zone); this.lastSavedZone = zone; }
      if (zone && !this.draft().timeZone) this.patch({ timeZone: zone });
    }); });
    this.zoneInput.set(this.preferences.preferences()?.timeZone || this.suggested || 'UTC');
    this.route.queryParamMap.pipe(takeUntilDestroyed()).subscribe(query => {
      this.generation++; this.reads.unsubscribe(); this.reads = new Subscription(); this.write?.unsubscribe(); this.busy.set(false);
      this.selected.set(null); this.editing.set(null);
      if (this.conversationId !== (Number(query.get('conversationId')) || 0)) { this.studentId.set(0); this.purchaseId.set(0); this.cohortId.set(0); }
      this.conversationId = Number(query.get('conversationId')) || 0;
      // Llegar desde una conversación para proponer una clase abre el formulario directamente.
      this.formOpen.set(this.conversationId > 0);
      this.selectedId = Number(query.get('sessionId')); this.editingId = Number(query.get('reschedule'));
      this.loadSelection();
      this.reload();
    });
    this.destroyRef.onDestroy(() => { this.reads.unsubscribe(); this.write?.unsubscribe(); });
  }
  private loadSelection(): void {
    const selected = this.selectedId, editing = this.editingId;
    if (selected || editing) this.read(this.api.get(selected || editing), s => {
      if (editing && s.teacherId === this.auth.currentUser()?.id) {
        this.editing.set(s); this.requestedBy = 0; this.waiver = '';
        this.draft.set({ localStart: s.localStart, timeZone: s.timeZone, offset: s.utcOffset, disambiguation: 'none', minutes: s.minutes });
      } else this.selected.set(s);
    });
  }
  private read<T>(source: import('rxjs').Observable<T>, next: (v: T) => void): void {
    const generation = this.generation;
    this.reads.add(source.subscribe({ next: v => { if (generation === this.generation) next(v); }, error: e => { if (generation === this.generation) { this.failure.set(e); this.loading.set(false); } } }));
  }
  reload(): void {
    this.failure.set(null); this.loading.set(true);
    let from: string | undefined, to: string | undefined;
    // Filtros expresan límites UTC explícitos, no una hora local reinterpretada.
    if (this.fromDate) from = `${this.fromDate}T00:00:00Z`;
    if (this.toDate) to = `${this.toDate}T00:00:00Z`;
    this.read(this.api.list(from, to), page => { this.sessions.set(page.items); this.truncated.set(page.truncated); this.loading.set(false); });
    this.read(this.api.reminders(), page => this.notices.set(page.items));
    if (this.teacher()) this.loadOptions();
  }
  private loadOptions(): void { this.read(this.api.options(this.conversationId || undefined), value => { this.options.set(value); if (value.studentId) this.studentId.set(value.studentId); }); }
  clearDates(): void { this.fromDate = ''; this.toDate = ''; this.reload(); }
  cancelZoneEdit(): void { this.zoneInput.set(this.preferences.preferences()?.timeZone || this.deviceZone); this.zoneEditorOpen.set(false); }
  confirmZone(): void { if (isTimeZone(this.zoneInput())) { this.preferences.saveTimeZone(this.zoneInput()); } else this.failure.set({ error: { code: 'time_zone_invalid' } }); }
  patch(value: Partial<Draft>): void { this.draft.update(d => ({ ...d, ...value, offset: '', disambiguation: 'none' })); }
  choose(offset: string, index: number): void { this.draft.update(d => ({ ...d, offset, disambiguation: index ? 'later' : 'earlier' })); }
  useAlternative(localStart: string, timeZone: string, offset: string): void { this.draft.update(d => ({ ...d, localStart, timeZone, offset, disambiguation: 'none' })); }
  purchasesForStudent() { return this.options()?.purchases.filter(p => p.beneficiaryIds.includes(this.studentId()) && !p.cohortId) || []; }
  selectPurchase(id: number): void { this.purchaseId.set(Number(id)); const p = this.options()?.purchases.find(p => p.id === Number(id)); if (p) this.patch({ minutes: p.minutesPerSession }); }
  selectedCohort() { return this.options()?.cohorts.find(c => c.id === this.cohortId()); }
  cohortNames(ids: number[]): string { return ids.map(id => this.options()?.students.find(s => s.id === id)?.name || '').filter(Boolean).join(', '); }
  selectCohort(id: number): void { this.cohortId.set(Number(id)); const c = this.selectedCohort(); if (c) this.patch({ minutes: c.minutesPerSession }); }
  submit(): void {
    if (this.busy() || !this.zoneReady()) return;
    const choice = this.choices(); if (!choice.value || !choice.intent) return;
    const edited = this.editing();
    const body: SessionRequest = { intent: choice.intent, ...(this.exception ? { leadTimeException: true, reason: this.reason } : {}) };
    if (!edited && this.whiteboardId) body.liveClassId = Number(this.whiteboardId);
    if (edited) {
      body.version = edited.version;
      if (['expired', 'declined'].includes(edited.status)) body.reason = this.reason;
      if (this.requestedBy) body.requestedByStudentId = Number(this.requestedBy);
      if (this.waiver.trim()) body.chargeWaivedReason = this.waiver;
    } else if (this.cohortId()) {
      const c = this.selectedCohort(); if (!c) return;
      body.cohortId = c.id;
      body.participants = c.memberIds.map(userId => ({ userId, purchaseId: this.options()?.purchases.find(p => p.cohortId === c.id && p.beneficiaryIds.includes(userId) && p.status === 'active')?.id || null }));
    } else {
      if (!this.studentId() || !this.purchaseId()) return;
      body.participants = [{ userId: this.studentId(), purchaseId: this.purchaseId() }];
    }
    const hash = JSON.stringify(body); if (hash !== this.submittedHash) { this.key = crypto.randomUUID(); this.submittedHash = hash; }
    this.failure.set(null); this.busy.set(true); const generation = this.generation;
    this.write = (edited ? this.api.reschedule(edited.id, body) : this.api.create(body, this.key)).subscribe({ next: session => {
      // La clave identifica un intento, no unos datos: con la clave anterior, volver a proponer lo mismo (p. ej. tras cancelar)
      // devolvería la clase vieja por idempotencia en vez de crear una nueva. Un reintento por corte de red sí la conserva.
      this.endAttempt();
      if (generation !== this.generation) return; this.busy.set(false); this.selected.set(session); this.editing.set(null); this.formOpen.set(false); this.reload();
    }, error: error => {
      // Una respuesta definitiva 4xx no crea nada: el siguiente intento no debe arrastrar la clave (un 409 operation_key_conflict
      // la dejaría bloqueada). Con corte de red o 5xx se conserva para que el reintento sea idempotente.
      if (error.status >= 400 && error.status < 500) this.endAttempt();
      if (generation === this.generation) { this.busy.set(false); this.failure.set(error); if (error.status === 409 && edited) this.read(this.api.get(edited.id), s => this.editing.set(s)); } } });
  }
  private endAttempt(): void { this.key = crypto.randomUUID(); this.submittedHash = ''; }
  updated(session: ClassSession): void { if (this.selected()?.id === session.id) this.selected.set(session); this.reload(); }
  openForm(): void { this.formOpen.set(true); }
  closeForm(): void { this.formOpen.set(false); }
  closeScheduleEditor(): void { if (!this.busy()) { if (this.editing()) this.stopEditing(); else this.closeForm(); } }
  stopEditing(): void { this.editing.set(null); void this.router.navigate(['/schedule']); }
}
