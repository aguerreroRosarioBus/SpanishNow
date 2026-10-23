import { Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { ZoomApi, ZoomStatus } from './zoom-api.service';

/** Resumen de Zoom para la pantalla común de integraciones: estado y enlace a la página completa (ZoomCardComponent), sin duplicar su lógica. */
@Component({
  selector: 'app-zoom-summary', standalone: true, imports: [TranslatePipe, RouterLink],
  styles: [`:host{display:block}.card-box{padding:1rem;border:1px solid var(--color-border,#ddd);border-radius:var(--radius-md,10px);background:var(--color-surface,#fff);margin-bottom:1rem}`],
  template: `<section class="card-box" data-testid="zoom-summary" aria-labelledby="zoomSummaryTitle">
  <h2 id="zoomSummaryTitle" class="h5">Zoom</h2>
  @if (status(); as s) { <p><strong>{{ ('zoom.status.' + s.status) | t }}</strong>@if (s.accountEmail) { · {{ s.accountEmail }} }</p> }
  <a class="btn btn-secondary" routerLink="/teacher/integrations/zoom">{{ 'zoom.manage' | t }}</a>
</section>`
})
export class ZoomSummaryComponent {
  private api = inject(ZoomApi);
  readonly status = signal<ZoomStatus | null>(null);
  constructor() { this.api.status().pipe(takeUntilDestroyed(inject(DestroyRef))).subscribe({ next: s => this.status.set(s), error: () => this.status.set(null) }); }
}
