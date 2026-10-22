import { Component, inject, OnInit, signal } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { TranslatePipe } from '../../../core/i18n/translate.pipe';
import { Locale } from '../../../core/i18n/i18n.types';
import { EXPECTATION_FIELDS, ExpectationField, Expectations } from '../legal.model';
import { LegalService } from '../legal.service';
import { ExpectationsViewComponent } from '../expectations-view/expectations-view.component';

/** Editor del docente dueño (SALES-01): ambos idiomas completos, con control de versión. */
@Component({
  selector: 'app-expectations-editor',
  standalone: true,
  imports: [TranslatePipe, ReactiveFormsModule, RouterLink, ExpectationsViewComponent],
  templateUrl: './expectations-editor.component.html'
})
export class ExpectationsEditorComponent implements OnInit {
  private legal = inject(LegalService);
  private fb = inject(FormBuilder);
  readonly courseId = Number(inject(ActivatedRoute).snapshot.paramMap.get('id'));
  readonly fields = EXPECTATION_FIELDS;
  readonly locales: readonly Locale[] = ['en', 'es'];

  readonly form: FormGroup = this.fb.group(Object.fromEntries(this.locales.map(locale => [locale,
    this.fb.group(Object.fromEntries(EXPECTATION_FIELDS.map(f => [f, ['', [Validators.required, Validators.maxLength(4000)]]])))])));
  readonly version = signal(0);
  readonly state = signal<'loading' | 'ready' | 'error'>('loading');
  readonly saving = signal(false);
  readonly message = signal('');
  readonly missing = signal(false);
  readonly error = signal('');
  /** Vista previa en vivo, tal como la verá el comprador en el idioma de la interfaz. */
  readonly preview = toSignal(this.form.valueChanges, { initialValue: null }) as () => Expectations | null;

  ngOnInit(): void {
    this.legal.expectations(this.courseId).subscribe({
      next: ({ version, expectations }) => {
        this.version.set(version);
        if (expectations) this.form.setValue(expectations);
        this.state.set('ready');
      },
      error: () => this.state.set('error')
    });
  }

  control(locale: Locale, field: ExpectationField) { return this.form.get([locale, field]); }

  save(): void {
    if (this.saving()) return;
    this.message.set(''); this.error.set(''); this.missing.set(false);
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.missing.set(true);
      return;
    }
    this.saving.set(true);
    this.legal.saveExpectations(this.courseId, this.version(), this.form.getRawValue() as Expectations).subscribe({
      next: saved => {
        this.version.set(saved.version);
        this.form.markAsPristine();
        this.message.set(String(saved.version));
        this.saving.set(false);
      },
      error: err => {
        this.saving.set(false);
        this.error.set(this.legal.errorMessage(err));
      }
    });
  }
}
