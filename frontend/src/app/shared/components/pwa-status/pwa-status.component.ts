import { Component, inject } from '@angular/core';
import { PwaService } from '../../../core/services/pwa.service';
import { IconComponent } from '../icon/icon.component';

/** Avisos discretos de la app instalable: sin conexión y versión nueva disponible. */
@Component({
  selector: 'app-pwa-status',
  standalone: true,
  imports: [IconComponent],
  template: `
    @if (pwa.updateAvailable()) {
      <div class="pwa-bar pwa-bar--update" role="status">
        <span>Hay una versión nueva</span>
        <button type="button" class="btn btn-primary btn-sm" (click)="pwa.applyUpdate()">Actualizar</button>
        <button type="button" class="btn btn-ghost btn-sm" (click)="pwa.dismissUpdate()">Después</button>
      </div>
    }
    @if (pwa.offline()) {
      <div class="pwa-bar pwa-bar--offline" role="status"><app-icon name="wifi-off" [size]="15" />Sin conexión</div>
    }
  `,
  styles: [`
    :host { position: fixed; left: 0; right: 0; bottom: 16px; z-index: 1090; display: flex; flex-direction: column; align-items: center; gap: 8px; padding: 0 16px; pointer-events: none; }
    .pwa-bar { pointer-events: auto; display: inline-flex; align-items: center; gap: 10px; max-width: 100%; padding: 8px 14px; background: var(--color-bg); border: 1px solid var(--color-border); border-radius: var(--radius-lg); box-shadow: var(--shadow-lg); font-size: 0.875rem; font-weight: 600; }
    .pwa-bar--offline { background: var(--color-text); border-color: var(--color-text); color: #fff; }
  `]
})
export class PwaStatusComponent {
  pwa = inject(PwaService);
}
