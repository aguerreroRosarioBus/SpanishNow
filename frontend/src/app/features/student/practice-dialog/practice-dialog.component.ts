import { Component, ViewEncapsulation, input, output } from '@angular/core';
import { TranslatePipe } from '../../../core/i18n/translate.pipe';
import { IconComponent } from '../../../shared/components/icon/icon.component';
import { ModalFocusDirective } from '../../../shared/directives/modal-focus.directive';

let nextId = 0;

/**
 * Ventana común de las prácticas (tarjetas, emparejar, escuchar y repetir): cabecera blanca con título y objetivo,
 * cierre con la X, Escape o el fondo, y el cuerpo nunca más alto que la pantalla.
 * También define las clases `.practice-*` que comparten las tres actividades (barra superior, progreso, panel de
 * resultado, navegación), por eso no encapsula estilos: todas llevan el prefijo.
 */
@Component({
  selector: 'app-practice-dialog',
  standalone: true,
  imports: [TranslatePipe, IconComponent, ModalFocusDirective],
  encapsulation: ViewEncapsulation.None,
  template: `
    @if (show()) {
      <div class="practice-backdrop" (click)="close.emit()">
        <section class="practice-dialog" role="dialog" aria-modal="true" [attr.aria-labelledby]="titleId"
                 [appModalFocus]="show()" (modalDismiss)="close.emit()" (click)="$event.stopPropagation()">
          <header class="practice-dialog__head">
            <div class="practice-dialog__titles">
              <h2 class="practice-dialog__title" [id]="titleId">{{ title() }}</h2>
              @if (goal()) { <p class="practice-dialog__goal">{{ goal() }}</p> }
            </div>
            <button type="button" class="btn-icon btn-icon--lg" (click)="close.emit()" [attr.aria-label]="'activities.close' | t">
              <app-icon name="close" [size]="18" />
            </button>
          </header>
          <div class="practice-dialog__body"><ng-content /></div>
        </section>
      </div>
    }
  `,
  styles: `
    .practice-backdrop {
      position: fixed; inset: 0; z-index: 1055;
      display: flex; align-items: center; justify-content: center;
      padding: 16px; background: rgba(43, 33, 28, .45);
    }
    .practice-dialog {
      display: flex; flex-direction: column;
      width: min(720px, 100%); max-height: calc(100dvh - 32px);
      background: var(--color-bg); border-radius: var(--radius-xl); box-shadow: var(--shadow-lg);
      overflow: hidden;
    }
    .practice-dialog__head {
      display: flex; align-items: flex-start; justify-content: space-between; gap: 16px;
      padding: 20px 20px 16px 24px; border-bottom: 1px solid var(--color-divider);
    }
    .practice-dialog__title { margin: 0; font: 600 1.125rem/1.35 var(--font-heading); color: var(--color-text); }
    .practice-dialog__goal { margin: 4px 0 0; font-size: .8125rem; line-height: 1.45; color: var(--color-text-light); }
    .practice-dialog__head .btn-icon { margin: -4px -4px 0 0; }
    .practice-dialog__body { min-height: 0; overflow-y: auto; padding: 20px 24px 24px; }

    /* Piezas comunes de las tres actividades */
    .practice-top { display: flex; align-items: center; gap: 12px; margin-bottom: 16px; }
    .practice-top__count { flex: none; font-size: .8125rem; font-weight: 700; color: var(--color-text-light); font-variant-numeric: tabular-nums; }
    .practice-progress { flex: 1; height: 6px; border-radius: var(--radius-full); background: var(--color-bg-dark); overflow: hidden; }
    .practice-progress > span { display: block; height: 100%; border-radius: inherit; background: var(--color-primary); transition: width var(--transition-slow); }
    .practice-top__actions { flex: none; display: flex; gap: 4px; }
    .practice-nav { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-top: 16px; }
    .practice-nav > .is-hidden { visibility: hidden; }
    .practice-done {
      display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 12px;
      margin-top: 16px; padding: 12px 16px; border-radius: var(--radius-lg);
      background: var(--color-success-soft); color: var(--color-success-text);
    }
    .practice-done strong { display: block; font-size: .9375rem; }
    .practice-done p { margin: 2px 0 0; font-size: .8125rem; }
    .practice-hint { margin: 0 0 12px; font-size: .8125rem; color: var(--color-text-light); }
    .practice-state { padding: 40px 0; text-align: center; color: var(--color-text-light); }

    @media (max-width: 575.98px) {
      /* En la barra superior quedan solo los íconos; el texto sigue para lectores de pantalla. */
      .practice-top__actions .btn { width: 32px; padding: 0; }
      .practice-label { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
      .practice-backdrop { padding: 8px; align-items: flex-end; }
      .practice-dialog { max-height: calc(100dvh - 16px); }
      .practice-dialog__head { padding: 16px 12px 12px 16px; }
      .practice-dialog__body { padding: 16px; }
    }
  `
})
export class PracticeDialogComponent {
  readonly show = input(false);
  readonly title = input('');
  readonly goal = input<string | null>(null);
  readonly close = output<void>();
  readonly titleId = `practice-title-${++nextId}`;
}
