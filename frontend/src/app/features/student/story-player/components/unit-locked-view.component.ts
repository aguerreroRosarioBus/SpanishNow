import { I18nService } from '../../../../core/i18n/i18n.service';
import { TranslatePipe } from '../../../../core/i18n/translate.pipe';
import { Component, computed, inject } from '@angular/core';
import { Router } from '@angular/router';
import { IconComponent } from '../../../../shared/components/icon/icon.component';
import { unitDisplayTitle } from '../../../../shared/utils/unit-title';
import { LessonNavigationStore } from '../lesson-navigation.store';

/** Unidad con liberación por fechas que todavía no se abrió: explica cuándo estará disponible. */
@Component({
  selector: 'app-unit-locked-view',
  standalone: true,
  imports: [TranslatePipe, IconComponent],
  template: `
    <article class="locked-card" role="status">
      <span class="locked-card__icon" aria-hidden="true"><app-icon name="lock" [size]="28" /></span>
      <span class="eyebrow">{{ 'player.unitCount' | t: {number: nav.unitNumber(), total: nav.unitCount()} }}</span>
      <h1 class="locked-card__title">{{ unitTitle() }}</h1>
      <p class="locked-card__when">{{ nav.currentUnitAvailableText() }}</p>
      <p class="locked-card__hint">{{ 'player.driptip' | t }}</p>
      <div class="locked-card__actions">
        @if (nav.canGoPreviousUnit()) {
          <button type="button" class="btn btn-primary" (click)="nav.goToPreviousUnit()"><app-icon name="chevron-left" [size]="16" />{{ 'player.goPreviousUnit' | t }}</button>
        } @else {
          <button type="button" class="btn btn-primary" (click)="back()">{{ 'player.backCourses' | t }}</button>
        }
      </div>
    </article>
  `,
  styles: [`
    :host { display: block; }
    .locked-card { display: flex; flex-direction: column; align-items: center; gap: 8px; padding: 40px 28px; text-align: center; background: var(--color-bg); border: 1px solid var(--color-border); border-radius: var(--radius-lg); }
    .locked-card__icon { display: inline-flex; padding: 14px; color: var(--color-primary-hover); background: var(--color-primary-soft); border-radius: var(--radius-full); }
    .locked-card__title { margin: 0; font: 600 1.5rem/1.25 var(--font-heading); overflow-wrap: anywhere; }
    .locked-card__when { margin: 0; font: 600 1.125rem/1.3 var(--font-heading); color: var(--color-primary-hover); }
    .locked-card__hint { margin: 0; max-width: 460px; color: var(--color-text-light); }
    .locked-card__actions { margin-top: 12px; }
  `]
})
export class UnitLockedViewComponent {
  i18n = inject(I18nService);
  nav = inject(LessonNavigationStore);
  private router = inject(Router);

  unitTitle = computed(() => unitDisplayTitle(this.nav.currentUnit()?.title) || this.i18n.t('player.unitFallback'));

  back(): void { this.router.navigate(['/student/dashboard']); }
}
