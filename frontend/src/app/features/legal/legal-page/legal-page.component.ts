import { Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { Subscription } from 'rxjs';
import { I18nService } from '../../../core/i18n/i18n.service';
import { TranslatePipe } from '../../../core/i18n/translate.pipe';
import { BUSINESS_FIELDS, LEGAL_KEYS, LegalKey, PUBLIC_LEGAL_KEYS, PublicLegalDocument } from '../legal.model';
import { LegalService } from '../legal.service';

/** Página pública de un documento legal (LEGAL-01): vigente o, con ?version=, una publicada anterior. */
@Component({
  selector: 'app-legal-page',
  standalone: true,
  imports: [TranslatePipe, RouterLink],
  templateUrl: './legal-page.component.html',
  styleUrl: './legal-page.component.scss'
})
export class LegalPageComponent {
  private route = inject(ActivatedRoute);
  private legal = inject(LegalService);
  readonly i18n = inject(I18nService);
  readonly businessFields = BUSINESS_FIELDS;
  readonly otherKeys = PUBLIC_LEGAL_KEYS;

  private params = toSignal(this.route.paramMap, { initialValue: this.route.snapshot.paramMap });
  private query = toSignal(this.route.queryParamMap, { initialValue: this.route.snapshot.queryParamMap });
  readonly key = computed(() => {
    const key = this.params().get('documentKey');
    return (LEGAL_KEYS as readonly string[]).includes(key ?? '') ? key as LegalKey : null;
  });
  readonly version = computed(() => this.query().get('version'));

  readonly doc = signal<PublicLegalDocument | null>(null);
  readonly state = signal<'loading' | 'ready' | 'missing' | 'error'>('loading');
  readonly effective = computed(() => {
    const doc = this.doc();
    return doc ? this.i18n.formatInstant(doc.effectiveAt, 'UTC', { dateStyle: 'long' }) : '';
  });
  private request?: Subscription;

  constructor() {
    // El idioma cambia el texto mostrado sin cambiar de versión ni de ruta.
    effect(() => {
      const key = this.key(); const version = this.version(); const locale = this.i18n.locale();
      untracked(() => this.load(key, version, locale));
    });
  }

  private load(key: LegalKey | null, version: string | null, locale: 'en' | 'es'): void {
    this.request?.unsubscribe();
    if (!key) { this.doc.set(null); this.state.set('missing'); return; }
    this.state.set('loading');
    this.request = this.legal.document(key, locale, version).subscribe({
      next: doc => { this.doc.set(doc); this.state.set('ready'); },
      error: error => { this.doc.set(null); this.state.set(error?.status === 404 ? 'missing' : 'error'); }
    });
  }
}
