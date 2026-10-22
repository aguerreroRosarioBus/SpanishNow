import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { I18nService } from '../../../core/i18n/i18n.service';
import { TranslatePipe } from '../../../core/i18n/translate.pipe';
import { Locale } from '../../../core/i18n/i18n.types';
import { AdminLegalDocument, BUSINESS_FIELDS, LEGAL_KEYS, LegalDraftInput, LegalKey } from '../legal.model';
import { LegalService } from '../legal.service';

type VersionStatus = 'draft' | 'scheduled' | 'current' | 'published';

/**
 * Editor legal (LEGAL-05): borradores bilingües, vista previa y publicación versionada.
 * Solo crea versiones nuevas; el servidor bloquea publicar con identidad/contacto incompletos o placeholders.
 */
@Component({
  selector: 'app-admin-legal',
  standalone: true,
  imports: [TranslatePipe, ReactiveFormsModule],
  templateUrl: './admin-legal.component.html',
  styleUrl: './admin-legal.component.scss'
})
export class AdminLegalComponent implements OnInit {
  private legal = inject(LegalService);
  private fb = inject(FormBuilder);
  readonly i18n = inject(I18nService);
  readonly keys = LEGAL_KEYS;
  readonly businessFields = BUSINESS_FIELDS;
  readonly locales: readonly Locale[] = ['en', 'es'];

  readonly docs = signal<AdminLegalDocument[]>([]);
  readonly state = signal<'loading' | 'ready' | 'error'>('loading');
  readonly key = signal<LegalKey>('terms');
  readonly selectedId = signal<number | null>(null);
  readonly previewLocale = signal<Locale>(this.i18n.locale());
  readonly confirming = signal<number | null>(null);
  readonly busy = signal(false);
  readonly notice = signal<{ key: string; version: string } | null>(null);
  readonly error = signal('');
  readonly missingFields = signal<string[]>([]);

  readonly versions = computed(() => this.docs().filter(d => d.documentKey === this.key()).sort((a, b) => Number(b.documentVersion) - Number(a.documentVersion)));
  readonly currentId = computed(() => this.versions().find(d => d.publishedAt && Date.parse(d.effectiveAt) <= Date.now())?.id ?? null);
  readonly selected = computed(() => this.versions().find(d => d.id === this.selectedId()) ?? this.versions()[0] ?? null);

  readonly form = this.fb.nonNullable.group({
    effectiveAt: ['', Validators.required],
    content: this.fb.nonNullable.group({
      en: this.fb.nonNullable.group({ title: ['', Validators.maxLength(200)], body: ['', Validators.maxLength(100000)] }),
      es: this.fb.nonNullable.group({ title: ['', Validators.maxLength(200)], body: ['', Validators.maxLength(100000)] })
    }),
    // Datos reales del negocio (LEGAL-01): nunca se completan con valores inventados.
    business: this.fb.nonNullable.group({
      responsibleName: ['', Validators.maxLength(500)], address: ['', Validators.maxLength(500)],
      contactEmail: ['', Validators.maxLength(500)], privacyEmail: ['', Validators.maxLength(500)],
      commercialRetention: ['', Validators.maxLength(5000)]
    })
  });

  ngOnInit(): void { this.reload(); }

  private reload(selectId?: number): void {
    this.legal.adminList().subscribe({
      next: docs => {
        this.docs.set(docs);
        this.state.set('ready');
        if (selectId) this.selectedId.set(selectId);
      },
      error: () => this.state.set('error')
    });
  }

  status(doc: AdminLegalDocument): VersionStatus {
    if (!doc.publishedAt) return 'draft';
    if (Date.parse(doc.effectiveAt) > Date.now()) return 'scheduled';
    return doc.id === this.currentId() ? 'current' : 'published';
  }

  statusLabel(doc: AdminLegalDocument): string {
    return this.i18n.t({ draft: 'legal.admin.draft', scheduled: 'legal.admin.scheduled', current: 'legal.admin.current', published: 'legal.admin.published' }[this.status(doc)]);
  }

  /** Fechas de vigencia: a las 00:00 UTC, mostradas en UTC (no dependen del idioma). */
  date(instant: string): string { return this.i18n.formatInstant(instant, 'UTC', { dateStyle: 'medium' }); }

  selectKey(key: LegalKey): void {
    this.key.set(key);
    this.selectedId.set(null);
    this.resetMessages();
  }

  useAsBase(doc: AdminLegalDocument): void {
    this.form.setValue({ effectiveAt: doc.effectiveAt.slice(0, 10), content: doc.content, business: doc.business });
    this.resetMessages();
  }

  saveDraft(): void {
    if (this.busy()) return;
    this.resetMessages();
    if (this.form.invalid) { this.form.markAllAsTouched(); return; }
    const value = this.form.getRawValue();
    const input: LegalDraftInput = { ...value, documentKey: this.key(), effectiveAt: `${value.effectiveAt}T00:00:00Z` };
    this.busy.set(true);
    this.legal.createDraft(input).subscribe({
      next: doc => {
        this.busy.set(false);
        this.notice.set({ key: 'legal.admin.saved', version: doc.documentVersion });
        this.reload(doc.id);
      },
      error: err => { this.busy.set(false); this.error.set(this.legal.errorMessage(err)); }
    });
  }

  publish(doc: AdminLegalDocument): void {
    if (this.busy()) return;
    if (this.confirming() !== doc.id) { this.confirming.set(doc.id); return; }
    this.resetMessages();
    this.busy.set(true);
    this.legal.publish(doc.id, doc.documentVersion).subscribe({
      next: published => {
        this.busy.set(false);
        this.notice.set({ key: 'legal.admin.publishedOk', version: published.documentVersion });
        this.reload(published.id);
      },
      error: err => {
        this.busy.set(false);
        this.error.set(this.legal.errorMessage(err));
        const fields = err?.error?.params?.fields;
        if (Array.isArray(fields)) this.missingFields.set(fields.filter((f: unknown): f is string => typeof f === 'string'));
      }
    });
  }

  /** `content.en.body` → «Texto (Inglés)»; `business.address` → «Domicilio». */
  fieldLabel(path: string): string {
    const [group, a, b] = path.split('.');
    if (group === 'business') return this.i18n.t(`legal.field.${a}`);
    const lang = this.i18n.t(a === 'en' ? 'legal.admin.english' : 'legal.admin.spanish');
    return `${this.i18n.t(b === 'title' ? 'legal.admin.titleField' : 'legal.admin.bodyField')} (${lang})`;
  }
  readonly missingLabels = computed(() => this.missingFields().map(f => this.fieldLabel(f)).join(', '));

  private resetMessages(): void {
    this.notice.set(null);
    this.error.set('');
    this.missingFields.set([]);
    this.confirming.set(null);
  }
}
