import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DOCUMENT } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { GoogleCalendarService, GoogleCalendarStatus } from '../../core/services/google-calendar.service';
import { FeaturesService } from '../../core/services/features.service';
import { I18nService } from '../../core/i18n/i18n.service';
import { TranslatePipe } from '../../core/i18n/translate.pipe';

const OUTCOMES = ['connected', 'denied', 'scopes', 'error'];
/** Tarjeta de Google Calendar de la pantalla común de integraciones (W07). W08 agrega la suya aparte. */
@Component({
  selector: 'app-calendar-card', standalone: true, imports: [FormsModule, TranslatePipe],
  styles: [`:host{display:block}.card-box{padding:1rem;border:1px solid var(--color-border,#ddd);border-radius:var(--radius-md,10px);background:var(--color-surface,#fff);margin-bottom:1rem}.notice{font-size:.9em;color:var(--color-text-muted,#625e59)}label{display:block;margin:.5rem 0}.cal{display:flex;gap:.5rem;align-items:center}.actions{display:flex;gap:.5rem;flex-wrap:wrap;margin-top:.75rem}`],
  template: `
<section class="card-box" aria-labelledby="calendarCardTitle">
  <h2 id="calendarCardTitle" class="h5">{{ 'calendar.card' | t }}</h2>
  @if (!features.enabled('google_calendar')) { <p class="notice">{{ 'calendar.unavailable' | t }}</p> }
  @else if (loading()) { <p>{{ 'calendar.loading' | t }}</p> }
  @else {
    @if (outcome(); as o) { <p class="alert" [class.alert-success]="o === 'connected'" [class.alert-warning]="o !== 'connected'" role="status">{{ ('calendar.outcome.' + o) | t }}</p> }
    @if (error()) { <p class="alert alert-danger" role="alert">{{ error() }}</p> }
    @if (saved()) { <p class="alert alert-success" role="status">{{ 'calendar.saved' | t }}</p> }
    @if (state(); as s) {
      <p><strong>{{ ('calendar.status.' + s.status) | t }}</strong>@if (s.accountEmail) { · {{ s.accountEmail }} }</p>
      @if (s.status === 'disconnected' || s.status === 'pending') {
        <p>{{ 'calendar.intro' | t }}</p>
        <p class="notice">{{ 'calendar.permissions' | t }}</p>
        <p class="notice">{{ 'calendar.privacy' | t }}</p>
        <div class="actions"><button class="btn btn-primary" (click)="connect()" [disabled]="busy()">{{ 'calendar.connect' | t }}</button></div>
      } @else {
        @if (s.status !== 'connected') {
          <p class="alert alert-warning" role="alert">{{ 'calendar.attention' | t }}</p>
          <div class="actions"><button class="btn btn-primary" (click)="connect()" [disabled]="busy()">{{ 'calendar.reconnect' | t }}</button></div>
        } @else {
          @if (s.calendarsError) { <p class="alert alert-warning" role="alert">{{ 'calendar.calendarsError' | t }}</p> }
          <label for="calendarTarget">{{ 'calendar.target' | t }}
            <select id="calendarTarget" class="form-select" [ngModel]="target()" (ngModelChange)="target.set($event)">
              @for (c of writable(); track c.id) { <option [value]="c.id">{{ c.summary }}</option> }
            </select></label>
          <p class="notice">{{ 'calendar.targetHint' | t }}</p>
          <fieldset><legend class="h6">{{ 'calendar.busy' | t }}</legend>
            @for (c of s.calendars; track c.id) {
              <label class="cal"><input type="checkbox" [checked]="busyIds().includes(c.id)" [disabled]="c.id === target()" (change)="toggle(c.id)" />
                {{ c.summary }}@if (c.accessRole !== 'owner') { <span class="notice">({{ 'calendar.readOnly' | t }})</span> }</label>
            }
            <p class="notice">{{ 'calendar.busyHint' | t }}</p>
          </fieldset>
          <div class="actions"><button class="btn btn-primary" (click)="save()" [disabled]="busy() || !target()">{{ 'calendar.save' | t }}</button></div>
        }
        @if (!confirming()) { <div class="actions"><button class="btn btn-ghost" (click)="confirming.set(true)" [disabled]="busy()">{{ 'calendar.disconnect' | t }}</button></div> }
        @else {
          <div role="alertdialog" aria-labelledby="calendarDisconnectTitle" class="mt-3">
            <p id="calendarDisconnectTitle"><strong>{{ 'calendar.disconnectConfirm' | t }}</strong></p>
            <p class="notice">{{ 'calendar.disconnectNote' | t }}</p>
            <div class="actions"><button class="btn btn-danger" (click)="disconnect()" [disabled]="busy()">{{ 'calendar.confirmDisconnect' | t }}</button>
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
  readonly i18n = inject(I18nService);
  state = signal<GoogleCalendarStatus | null>(null);
  loading = signal(true); busy = signal(false); saved = signal(false); confirming = signal(false);
  failure = signal<unknown>(null); outcome = signal<string | null>(null);
  target = signal(''); busyIds = signal<string[]>([]);
  error = computed(() => this.failure() ? this.i18n.errorMessage(this.failure()) : '');
  writable = computed(() => (this.state()?.calendars ?? []).filter(c => c.accessRole === 'owner'));

  ngOnInit(): void {
    const result = this.route.snapshot.queryParamMap.get('calendar');
    if (result && OUTCOMES.includes(result)) {
      this.outcome.set(result);
      void this.router.navigate([], { queryParams: { calendar: null }, queryParamsHandling: 'merge', replaceUrl: true });
    }
    this.load();
  }

  private load(): void {
    this.api.status().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: s => { this.apply(s); this.loading.set(false); },
      error: e => { this.failure.set(e); this.loading.set(false); }
    });
  }
  private apply(s: GoogleCalendarStatus): void {
    this.state.set(s); this.target.set(s.targetCalendarId ?? ''); this.busyIds.set(s.busyCalendarIds ?? []);
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
