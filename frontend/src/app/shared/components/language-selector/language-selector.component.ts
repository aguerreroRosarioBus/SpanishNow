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
    /* Mismo aspecto que el botón secundario de al lado («Ayuda de esta pantalla»): borde, radio, alto y tipografía. */
    .language-select {
      appearance: none; -webkit-appearance: none;
      height: 44px; padding: 0 34px 0 14px;
      border: 1px solid #e4d8cc; border-radius: var(--radius-md);
      background: #fff url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%236b5e55' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E") no-repeat right 12px center;
      color: var(--color-text); font: 600 .8125rem/1 var(--font-body); cursor: pointer;
      transition: background-color var(--transition-fast);
    }
    .language-select:hover { background-color: var(--color-bg-light); }
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
