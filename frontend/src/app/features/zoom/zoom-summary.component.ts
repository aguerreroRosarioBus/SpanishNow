import { Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { ZoomApi, ZoomStatus } from './zoom-api.service';

/** Resumen de Zoom para la pantalla común de integraciones: estado y enlace a la página completa (ZoomCardComponent), sin duplicar su lógica. */
@Component({
  selector: 'app-zoom-summary', standalone: true, imports: [TranslatePipe, RouterLink],
  styleUrl: '../integrations/integration-card.scss',
  template: `<section class="int-card" data-testid="zoom-summary" aria-labelledby="zoomSummaryTitle">
  <header class="int-head">
    <h3 id="zoomSummaryTitle">Zoom</h3>
    @if (status(); as s) { <span class="badge-status badge-status--dot status-{{ tone(s.status) }}" data-testid="zoom-status">{{ ('zoom.status.' + s.status) | t }}</span> }
  </header>
  @if (status(); as s) {
    @if (s.accountEmail) { <p class="int-meta">{{ 'zoom.accountLine' | t:{ email: s.accountEmail } }}</p> }
    @if (s.capabilities; as c) { <p class="int-meta">{{ 'zoom.capacity' | t:{ minutes: c.maxMinutes, participants: c.maxParticipants } }}</p> }
  }
  <div class="int-actions"><a class="btn btn-primary" routerLink="/teacher/integrations/zoom">{{ 'zoom.manage' | t }}</a></div>
</section>`
})
export class ZoomSummaryComponent {
  private api = inject(ZoomApi);
  readonly status = signal<ZoomStatus | null>(null);
  /** Tono de la etiqueta de estado. */
  tone(status: string): string { return status === 'connected' ? 'success' : status === 'revoked' ? 'danger' : status === 'needs_attention' || status === 'pending' ? 'warning' : 'neutral'; }
  constructor() { this.api.status().pipe(takeUntilDestroyed(inject(DestroyRef))).subscribe({ next: s => this.status.set(s), error: () => this.status.set(null) }); }
}
