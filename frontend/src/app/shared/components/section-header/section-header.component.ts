import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/**
 * Encabezado de sección: un solo título (h2 por defecto) con descripción breve en gris y, a la
 * derecha, un espacio para acciones (contenido proyectado). Evita apilar subtítulos redundantes.
 */
@Component({
  selector: 'app-section-header',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="section-header__main">
      @switch (level()) {
        @case (3) { <h3 class="section-header__title" [attr.id]="titleId() || null">{{ title() }}</h3> }
        @default { <h2 class="section-header__title" [attr.id]="titleId() || null">{{ title() }}</h2> }
      }
      @if (description()) { <p class="section-header__desc">{{ description() }}</p> }
    </div>
    <div class="section-header__actions"><ng-content /></div>
  `,
  styles: [`
    :host { display: flex; flex-wrap: wrap; align-items: flex-end; justify-content: space-between; gap: var(--spacing-sm) var(--spacing-md); margin-bottom: var(--spacing-md); }
    .section-header__main { min-width: 0; flex: 1 1 16rem; }
    .section-header__title { margin: 0; font-size: 1.125rem; }
    .section-header__desc { margin: var(--spacing-xs) 0 0; font-size: .875rem; color: var(--color-text-light); }
    .section-header__actions:empty { display: none; }
    .section-header__actions { display: flex; flex-wrap: wrap; gap: var(--spacing-sm); }
  `]
})
export class SectionHeaderComponent {
  title = input.required<string>();
  description = input<string>('');
  /** Nivel de encabezado: 2 (por defecto) o 3. */
  level = input<2 | 3>(2);
  /** `id` del encabezado, para `aria-labelledby` de la sección. */
  titleId = input<string>('');
}
