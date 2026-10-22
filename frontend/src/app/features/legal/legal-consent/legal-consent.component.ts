import { Component, computed, input, model } from '@angular/core';
import { TranslatePipe } from '../../../core/i18n/translate.pipe';
import { LegalKey } from '../legal.model';

export interface ConsentDocument { documentKey: LegalKey; version: string; title: string; }

let nextId = 0;

/**
 * Casilla de aceptación (LEGAL-02): siempre empieza sin marcar y enumera las versiones exactas.
 * Privacidad se informa aparte; no hay consentimiento de marketing aquí.
 */
@Component({
  selector: 'app-legal-consent',
  standalone: true,
  imports: [TranslatePipe],
  template: `
    <fieldset class="legal-consent" [class.legal-consent--invalid]="showError()">
      <div class="form-check">
        <input class="form-check-input" type="checkbox" [id]="id" [checked]="accepted()"
               (change)="accepted.set($any($event.target).checked)"
               [attr.aria-describedby]="id + '-docs' + (showError() ? ' ' + id + '-error' : '')"
               [attr.aria-invalid]="showError() || null">
        <label class="form-check-label" [for]="id">{{ 'legal.consent.label' | t }}</label>
      </div>
      <ul class="legal-consent__docs" [id]="id + '-docs'">
        @for (doc of contractualDocs(); track doc.documentKey) {
          <li>
            <a [href]="'/legal/' + doc.documentKey + '?version=' + doc.version" target="_blank" rel="noopener">{{ doc.title }}</a>
            <span class="text-secondary-ui"> · {{ 'legal.version' | t : { version: doc.version } }}</span>
          </li>
        }
      </ul>
      @if (privacy(); as p) {
        <p class="legal-consent__note">
          {{ 'legal.consent.privacy' | t }}
          <a [href]="'/legal/privacy?version=' + p.version" target="_blank" rel="noopener">{{ p.title }}</a>
        </p>
      }
      <p class="legal-consent__note">{{ 'legal.consent.noMarketing' | t }}</p>
      @if (showError()) {
        <div class="invalid-feedback d-block" [id]="id + '-error'" role="alert">{{ 'legal.consent.required' | t }}</div>
      }
    </fieldset>
  `,
  styles: [`
    .legal-consent { border: 1px solid var(--color-border); border-radius: var(--radius-md, 8px); padding: .75rem 1rem; margin: 0; }
    .legal-consent--invalid { border-color: var(--bs-danger, #dc3545); }
    .legal-consent__docs { margin: .5rem 0 .25rem 1.5rem; padding-left: 1rem; }
    .legal-consent__note { font-size: .875rem; color: var(--color-text-secondary, #6c757d); margin: .25rem 0 0; }
  `]
})
export class LegalConsentComponent {
  readonly documents = input.required<readonly ConsentDocument[]>();
  readonly accepted = model(false);
  /** El padre lo activa cuando intentó continuar sin aceptar. */
  readonly submitted = input(false);
  readonly id = `legal-consent-${nextId++}`;
  readonly contractualDocs = computed(() => this.documents().filter(d => d.documentKey !== 'privacy'));
  readonly privacy = computed(() => this.documents().find(d => d.documentKey === 'privacy') ?? null);
  readonly showError = computed(() => this.submitted() && !this.accepted());
}
