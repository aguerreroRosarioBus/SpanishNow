import { Component, computed, inject, input } from '@angular/core';
import { I18nService } from '../../../core/i18n/i18n.service';
import { TranslatePipe } from '../../../core/i18n/translate.pipe';
import { EXPECTATION_FIELDS, Expectations } from '../legal.model';

/** Expectativas estructuradas (SALES-01) en el idioma de la interfaz; texto plano del docente. */
@Component({
  selector: 'app-expectations-view',
  standalone: true,
  imports: [TranslatePipe],
  template: `
    @if (current(); as e) {
      <dl class="expectations">
        @for (field of fields; track field) {
          @if (e[field]) {
            <dt>{{ ('sales.field.' + field) | t }}</dt>
            <dd>{{ e[field] }}</dd>
          }
        }
      </dl>
    }
    <p class="expectations__note">{{ 'sales.lifetimeNote' | t }}</p>
  `,
  styles: [`
    .expectations { margin: 0; }
    .expectations dt { font-weight: 600; margin-top: .75rem; }
    .expectations dd { margin: .15rem 0 0; white-space: pre-line; overflow-wrap: anywhere; }
    .expectations__note { font-size: .875rem; color: var(--color-text-secondary, #6c757d); margin: .75rem 0 0; }
  `]
})
export class ExpectationsViewComponent {
  private i18n = inject(I18nService);
  readonly expectations = input<Expectations | null>(null);
  readonly fields = EXPECTATION_FIELDS;
  readonly current = computed(() => this.expectations()?.[this.i18n.locale()] ?? null);
}
