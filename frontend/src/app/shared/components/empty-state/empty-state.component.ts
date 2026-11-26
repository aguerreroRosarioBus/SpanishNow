import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { IconComponent } from '../icon/icon.component';

/**
 * Estado vacío unificado: tarjeta centrada con ícono en círculo, mensaje en negrita y texto secundario.
 * El contenido proyectado es una acción primaria opcional (p. ej. «Crear paquete»); no se debe
 * poner aquí un botón de recarga, que vive en la barra de herramientas de la sección.
 */
@Component({
  selector: 'app-empty-state',
  standalone: true,
  imports: [IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <span class="empty-state__icon" aria-hidden="true"><app-icon [name]="icon()" [size]="22" /></span>
    <strong class="empty-state__title">{{ title() }}</strong>
    @if (hint()) { <p class="empty-state__hint">{{ hint() }}</p> }
    <div class="empty-state__action"><ng-content /></div>
  `,
  host: { role: 'status' },
  styles: [`
    :host { display: flex; flex-direction: column; align-items: center; gap: var(--spacing-xs); padding: var(--spacing-xl) var(--spacing-md); text-align: center; border: 1px solid var(--color-border); border-radius: var(--radius-lg); background: var(--color-bg); }
    .empty-state__icon { display: grid; place-items: center; width: 44px; height: 44px; margin-bottom: var(--spacing-xs); border-radius: 50%; background: var(--color-bg-dark); color: var(--color-text-light); }
    .empty-state__hint { margin: 0; max-width: 48ch; font-size: .875rem; color: var(--color-text-light); }
    .empty-state__action:empty { display: none; }
    .empty-state__action { margin-top: var(--spacing-sm); display: flex; flex-wrap: wrap; justify-content: center; gap: var(--spacing-sm); }
  `]
})
export class EmptyStateComponent {
  /** Nombre del ícono de `app-icon`. */
  icon = input('layers');
  /** Mensaje principal ya traducido. */
  title = input.required<string>();
  /** Texto secundario ya traducido (opcional). */
  hint = input<string>('');
}
