import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DOCUMENT } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { GoogleCalendarService, GoogleCalendarStatus } from '../../core/services/google-calendar.service';
import { FeaturesService } from '../../core/services/features.service';
import { I18nService } from '../../core/i18n/i18n.service';
import { TranslatePipe } from '../../core/i18n/translate.pipe';

const OUTCOMES = ['connected', 'denied', 'scopes', 'error', 'mismatch'];
/** Tarjeta de Google Calendar de la pantalla común de integraciones (W07). W08 agrega la suya aparte. */
@Component({
  selector: 'app-calendar-card', standalone: true, imports: [FormsModule, TranslatePipe],
  styleUrl: './integration-card.scss',
  template: `
<section class="int-card" aria-labelledby="calendarCardTitle">
  <header class="int-head">
    <h3 id="calendarCardTitle">{{ 'calendar.card' | t }}</h3>
    @if (state(); as s) { <span class="badge-status badge-status--dot status-{{ tone(s.status) }}" data-testid="calendar-status">{{ ('calendar.status.' + s.status) | t }}</span> }
  </header>
  @if (!features.enabled('google_calendar')) { <p class="notice">{{ 'calendar.unavailable' | t }}</p> }
  @else if (loading()) { <p class="notice" role="status">{{ 'calendar.loading' | t }}</p> }
  @else {
    @if (state(); as s) { @if (s.accountEmail) { <p class="int-meta">{{ 'calendar.accountLine' | t:{ email: s.accountEmail } }}</p> } }
    @if (outcome(); as o) { <p class="alert" [class.alert-success]="o === 'connected'" [class.alert-warning]="o !== 'connected' && o !== 'confirming'" [class.alert-info]="o === 'confirming'" role="status">{{ ('calendar.outcome.' + o) | t }}</p> }
    @if (error()) { <p class="alert alert-danger" role="alert">{{ error() }}</p> }
    @if (saved()) { <p class="alert alert-success" role="status">{{ 'calendar.saved' | t }}</p> }
    @if (state(); as s) {
      @if (s.status === 'disconnected' || s.status === 'pending') {
        <div class="int-body">
          <p>{{ 'calendar.intro' | t }}</p>
          <p class="notice">{{ 'calendar.permissions' | t }}</p>
          <p class="notice">{{ 'calendar.privacy' | t }}</p>
        </div>
        <div class="int-actions"><button class="btn btn-primary" (click)="connect()" [disabled]="busy()">{{ 'calendar.connect' | t }}</button></div>
      } @else {
        @if (s.status !== 'connected') {
          <p class="alert alert-warning" role="alert">{{ 'calendar.attention' | t }}</p>
        } @else {
          <div class="int-body">
          @if (s.calendarsError) { <p class="alert alert-warning" role="alert">{{ 'calendar.calendarsError' | t }}</p> }
          <label for="calendarTarget">{{ 'calendar.target' | t }}
            <select id="calendarTarget" class="form-select" [ngModel]="target()" (ngModelChange)="target.set($event)">
              @for (c of writable(); track c.id) { <option [value]="c.id">{{ c.summary }}</option> }
            </select></label>
          <p class="notice">{{ 'calendar.targetHint' | t }}</p>
          <fieldset><legend>{{ 'calendar.busy' | t }}</legend>
            @for (c of s.calendars; track c.id) {
              <label class="cal"><input type="checkbox" [checked]="busyIds().includes(c.id)" [disabled]="c.id === target()" (change)="toggle(c.id)" />
                {{ c.summary }}@if (c.accessRole !== 'owner') { <span class="notice">({{ 'calendar.readOnly' | t }})</span> }</label>
            }
            <p class="notice">{{ 'calendar.busyHint' | t }}</p>
          </fieldset>
          </div>
        }
        @if (!confirming()) {
          <div class="int-actions">
            @if (s.status !== 'connected') { <button class="btn btn-primary" (click)="connect()" [disabled]="busy()">{{ 'calendar.reconnect' | t }}</button> }
            @else { <button class="btn btn-primary" (click)="save()" [disabled]="busy() || !target()">{{ 'calendar.save' | t }}</button> }
            <button class="btn btn-ghost int-actions-end" (click)="confirming.set(true)" [disabled]="busy()">{{ 'calendar.disconnect' | t }}</button>
          </div>
        } @else {
          <div role="alertdialog" aria-labelledby="calendarDisconnectTitle" class="int-body">
            <p id="calendarDisconnectTitle"><strong>{{ 'calendar.disconnectConfirm' | t }}</strong></p>
            <p class="notice">{{ 'calendar.disconnectNote' | t }}</p>
            <div class="int-actions"><button class="btn btn-danger" (click)="disconnect()" [disabled]="busy()">{{ 'calendar.confirmDisconnect' | t }}</button>
              <button class="btn btn-ghost" (click)="confirming.set(false)">{{ 'calendar.keep' | t }}</button></div>
          </div>
        }
      }
    }
  }
</section>`
})
export class CalendarCardComponent implements OnInit {
  private api = inject(GoogleCalendarService);
  private route = inject(ActivatedRoute); private router = inject(Router); private destroyRef = inject(DestroyRef);
  private document = inject(DOCUMENT);
  readonly features = inject(FeaturesService);
  /** Tono de la etiqueta de estado. */
  tone(status: string): string { return status === 'connected' ? 'success' : status === 'revoked' ? 'danger' : status === 'needs_attention' || status === 'pending' ? 'warning' : 'neutral'; }
  readonly i18n = inject(I18nService);
  state = signal<GoogleCalendarStatus | null>(null);
  loading = signal(true); busy = signal(false); saved = signal(false); confirming = signal(false);
  failure = signal<unknown>(null); outcome = signal<string | null>(null);
  target = signal(''); busyIds = signal<string[]>([]);
  error = computed(() => this.failure() ? this.i18n.errorMessage(this.failure()) : '');
  writable = computed(() => (this.state()?.calendars ?? []).filter(c => c.accessRole === 'owner'));

  ngOnInit(): void {
    const params = this.route.snapshot.queryParamMap;
    const result = params.get('calendar'), token = params.get('token');
    if (result) {
      // El token es de un solo uso: sale de la URL antes de usarlo.
      void this.router.navigate([], { queryParams: { calendar: null, token: null }, queryParamsHandling: 'merge', replaceUrl: true });
    }
    if (result === 'confirm' && token) { this.complete(token); return; }
    if (result && OUTCOMES.includes(result)) this.outcome.set(result);
    this.load();
  }

  /** El callback solo deja la conexión pendiente: la confirma esta sesión autenticada, y solo si la inició esta cuenta. */
  private complete(token: string): void {
    this.outcome.set('confirming');
    this.api.complete(token).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: s => { this.apply(s); this.outcome.set('connected'); this.loading.set(false); },
      error: e => {
        this.loading.set(false);
        if (e?.status === 403) this.outcome.set('mismatch'); else { this.outcome.set(null); this.failure.set(e); }
        this.load();
      }
    });
  }

  private load(): void {
    this.api.status().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: s => { this.apply(s); this.loading.set(false); },
      error: e => { this.failure.set(e); this.loading.set(false); }
    });
  }
  private apply(s: GoogleCalendarStatus): void {
    // El servidor guarda el alias «primary» de Google; la lista trae el id real (el email): se resuelve para que el select lo muestre.
    const real = (id: string) => id === 'primary' ? (s.calendars ?? []).find(c => c.primary)?.id ?? id : id;
    this.state.set(s); this.target.set(real(s.targetCalendarId ?? '')); this.busyIds.set([...new Set((s.busyCalendarIds ?? []).map(real))]);
  }
  private run<T>(call: import('rxjs').Observable<T>, ok: (value: T) => void): void {
    if (this.busy()) return;
    this.busy.set(true); this.failure.set(null); this.saved.set(false); this.outcome.set(null);
    call.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({ next: v => { this.busy.set(false); ok(v); }, error: e => { this.busy.set(false); this.failure.set(e); } });
  }

  toggle(id: string): void { this.busyIds.update(ids => ids.includes(id) ? ids.filter(i => i !== id) : [...ids, id]); }
  connect(): void {
    // El navegador sale a Google (o al fake en desarrollo) y vuelve al callback del servidor, que redirige aquí.
    this.run(this.api.connect(), r => this.go(r.url));
  }
  go(url: string): void { this.document.location.assign(url); }
  save(): void {
    const s = this.state(); if (!s) return;
    this.run(this.api.update({ targetCalendarId: this.target(), busyCalendarIds: [...new Set([this.target(), ...this.busyIds()])], version: s.version }), r => { this.apply(r); this.saved.set(true); });
  }
  disconnect(): void {
    this.run(this.api.disconnect(), () => { this.confirming.set(false); this.loading.set(true); this.load(); });
  }
}
