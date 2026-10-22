import { Component, inject } from '@angular/core';
import { I18nService } from '../../../core/i18n/i18n.service';
import { isLocale } from '../../../core/i18n/i18n.types';
import { TranslatePipe } from '../../../core/i18n/translate.pipe';

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
  `,
  styles: `
    :host { display: inline-flex; flex: none; }
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
  select(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    if (isLocale(value)) this.i18n.setLocale(value);
  }
}
