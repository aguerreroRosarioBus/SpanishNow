import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

export interface TabBarItem { id: string; label: string; }

/**
 * Pestañas en una sola fila con desplazamiento horizontal suave y sin barra visible: nunca
 * parten en dos renglones ni producen scroll horizontal de la página. Usa `aria-pressed`
 * como el resto de las navegaciones por sección del proyecto.
 */
@Component({
  selector: 'app-tab-bar',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <nav [attr.aria-label]="label()">
      @for (t of items(); track t.id) {
        <button type="button" class="btn tab-bar__tab" [class.btn-secondary]="active() === t.id" [class.btn-ghost]="active() !== t.id"
                [attr.aria-pressed]="active() === t.id" [attr.data-tab]="t.id" (click)="selected.emit(t.id)">{{ t.label }}</button>
      }
    </nav>
  `,
  styles: [`
    :host { display: block; min-width: 0; margin-bottom: var(--spacing-md); }
    nav { display: flex; flex-wrap: nowrap; gap: var(--spacing-xs); overflow-x: auto; overscroll-behavior-x: contain; scroll-behavior: smooth; scrollbar-width: none; -webkit-overflow-scrolling: touch; }
    nav::-webkit-scrollbar { display: none; }
    .tab-bar__tab { flex: 0 0 auto; white-space: nowrap; }
  `]
})
export class TabBarComponent {
  items = input.required<TabBarItem[]>();
  label = input<string>('');
  active = input.required<string>();
  /** Emite el id de la pestaña elegida; el padre decide si cambia (puede tener efectos). */
  selected = output<string>();
}
