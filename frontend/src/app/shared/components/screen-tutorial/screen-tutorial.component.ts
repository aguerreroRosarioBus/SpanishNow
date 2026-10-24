import { DOCUMENT } from '@angular/common';
import { afterNextRender, Component, DestroyRef, effect, inject, signal } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { AuthService } from '../../../core/services/auth.service';
import { TranslatePipe } from '../../../core/i18n/translate.pipe';
import { TutorialService, visibleTarget } from '../../../core/tutorials/tutorial.service';
import { TutorialDefinition } from '../../../core/tutorials/tutorial.model';
import { TUTORIALS } from '../../../core/tutorials/tutorials';

@Component({
  selector: 'app-screen-tutorial', standalone: true, imports: [TranslatePipe],
  template: `
    @if (current(); as screen) {
      <aside class="screen-help" [class.in-editor]="screen.tour.id === 'composer'" [hidden]="tutorial.active()" [attr.aria-label]="'tutorial.help' | t">
        @if (!tutorial.status(screen.tour)) {
          <div class="screen-help__hint">
            <p>{{ 'tutorial.invitation' | t }}</p>
            <button type="button" class="screen-help__dismiss" [attr.aria-label]="'tutorial.dismiss' | t" (click)="tutorial.dismiss(screen.tour)">×</button>
          </div>
        }
        <button #start type="button" class="btn btn-secondary btn-sm screen-help__button" data-testid="screen-help"
          [disabled]="tutorial.loading()" (click)="tutorial.start(screen.tour, screen.root, start)">
          <span aria-hidden="true">?</span>{{ 'tutorial.help' | t }}
          <small>{{ (tutorial.status(screen.tour) === 'completed' ? 'tutorial.repeat' : 'tutorial.start') | t }}</small>
        </button>
        @if (tutorial.error()) { <p class="screen-help__error" role="alert">{{ 'tutorial.unavailable' | t }}</p> }
      </aside>
    }
  `,
  styleUrl: './screen-tutorial.component.scss',
})
export class ScreenTutorialComponent {
  readonly tutorial = inject(TutorialService);
  private readonly auth = inject(AuthService);
  private readonly document = inject(DOCUMENT);
  private readonly destroy = inject(DestroyRef);
  readonly current = signal<{ tour: TutorialDefinition; root: HTMLElement } | null>(null);

  constructor() {
    const router = inject(Router);
    router.events.pipe(takeUntilDestroyed()).subscribe(event => {
      if (event instanceof NavigationEnd) this.detect();
    });
    effect(() => { this.auth.currentUser(); this.detect(); });
    afterNextRender(() => {
      // Solo cambios de estructura, sin sondeo ni observar cada movimiento de la pizarra.
      const observer = new MutationObserver(() => this.detect());
      observer.observe(this.document.body, { childList: true, subtree: true });
      this.destroy.onDestroy(() => observer.disconnect());
      this.detect();
    });
  }

  private detect(): void {
    const user = this.auth.currentUser();
    let next: { tour: TutorialDefinition; root: HTMLElement } | null = null;
    // No superponer la guía a formularios modales ni a la introducción del editor.
    const blocked = this.document.querySelector('.tutorial-backdrop, .modal.show, .confirm-backdrop');
    if (user && !blocked) {
      for (const tour of TUTORIALS) {
        if (!tour.roles.includes(user.role)) continue;
        const root = visibleTarget(this.document.body, tour.root);
        if (root) {
          // El diálogo tiene su propio botón, dentro del contexto aria-modal.
          if (tour.id !== 'composer') next = { tour, root };
          break;
        }
      }
    }
    const previous = this.current();
    if (previous?.tour === next?.tour && previous?.root === next?.root) return;
    if (previous) this.tutorial.stop();
    this.current.set(next);
  }
}
