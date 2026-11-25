import { Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { PermissionNoticeComponent } from '../../shared/components/permission-notice/permission-notice.component';
import { ZoomApi, ZoomStatus } from './zoom-api.service';

/** Resumen de Zoom para la pantalla común de integraciones: estado y enlace a la página completa (ZoomCardComponent), sin duplicar su lógica. */
@Component({
  selector: 'app-zoom-summary', standalone: true, imports: [TranslatePipe, RouterLink, PermissionNoticeComponent],
  styleUrl: '../integrations/integration-card.scss',
  template: `@if (denied()) { <app-permission-notice /> } @else {
<section class="int-card" data-testid="zoom-summary" aria-labelledby="zoomSummaryTitle">
  <header class="int-head">
    <h3 id="zoomSummaryTitle">Zoom</h3>
    @if (status(); as s) { <span class="badge-status badge-status--dot status-{{ tone(s.status) }}" data-testid="zoom-status">{{ ('zoom.status.' + s.status) | t }}</span> }
  </header>
  @if (status(); as s) {
    @if (s.accountEmail) { <p class="int-meta">{{ 'zoom.accountLine' | t:{ email: s.accountEmail } }}</p> }
    @if (s.capabilities; as c) { <p class="int-meta">{{ 'zoom.capacity' | t:{ minutes: c.maxMinutes, participants: c.maxParticipants } }}</p> }
  }
  <div class="int-actions"><a class="btn btn-primary" routerLink="/teacher/integrations/zoom">{{ 'zoom.manage' | t }}</a></div>
</section>}`
})
export class ZoomSummaryComponent {
  private api = inject(ZoomApi);
  readonly status = signal<ZoomStatus | null>(null);
  /** 403 al leer el estado: la cuenta no tiene Zoom habilitado. Sin tarjeta ni enlace «Administrar Zoom», solo el aviso (D-01). */
  readonly denied = signal(false);
  /** Tono de la etiqueta de estado. */
  tone(status: string): string { return status === 'connected' ? 'success' : status === 'revoked' ? 'danger' : status === 'needs_attention' || status === 'pending' ? 'warning' : 'neutral'; }
  constructor() { this.api.status().pipe(takeUntilDestroyed(inject(DestroyRef))).subscribe({ next: s => this.status.set(s), error: e => { this.status.set(null); this.denied.set((e as { status?: number })?.status === 403); } }); }
}
