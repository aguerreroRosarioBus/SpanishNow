import { Component, inject } from '@angular/core';
import { I18nService } from '../../../core/i18n/i18n.service';
import { isLocale } from '../../../core/i18n/i18n.types';
import { TranslatePipe } from '../../../core/i18n/translate.pipe';
import { UserPreferencesService } from '../../../core/services/user-preferences.service';

@Component({
  selector: 'app-language-selector',
  standalone: true,
  imports: [TranslatePipe],
  template: `
    <select class="language-select" [value]="i18n.locale()" [attr.aria-label]="'common.language' | t"
            (change)="select($event)">
      <option value="en" lang="en">English</option>
      <option value="es" lang="es">Español</option>
    </select>
    <span class="visually-hidden" role="status">{{ preferences.saving() ? ('preferences.saving' | t) : '' }}</span>
    @if (preferences.errorMessage()) {
      <div class="preference-error" role="status">
        {{ preferences.errorMessage() }}
        <button type="button" class="btn btn-sm btn-secondary" (click)="preferences.retry()">{{ 'preferences.retry' | t }}</button>
      </div>
    }
  `,
  styles: `
    :host { display: inline-flex; flex: none; position: relative; }
    .preference-error {
      position: absolute; top: 100%; right: 0; z-index: 1100; width: min(280px, 80vw);
      padding: 12px; border: 1px solid var(--color-border); border-radius: 6px;
      background: var(--color-bg); color: var(--color-text); font-size: .8125rem; box-shadow: var(--shadow-sm);
    }
    .language-select {
      min-height: 44px; max-width: 102px; padding: 4px 6px;
      border: 1px solid var(--color-border); border-radius: var(--radius-sm, 6px);
      background: var(--color-bg); color: var(--color-text); font: inherit; font-size: .8125rem;
    }
    .language-select:focus-visible { outline: 2px solid var(--color-primary); outline-offset: 2px; }
  `
})
export class LanguageSelectorComponent {
  readonly i18n = inject(I18nService);
  readonly preferences = inject(UserPreferencesService);
  select(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    if (isLocale(value)) this.i18n.setLocale(value);
  }
}
