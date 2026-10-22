import { I18nService } from '../../../core/i18n/i18n.service';
import { TranslatePipe } from '../../../core/i18n/translate.pipe';
import { Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Subscription } from 'rxjs';
import { liveReturnUrl } from '../../../core/guards/live-auth.guard';
import { AuthService } from '../../../core/services/auth.service';
import { LegalConsentComponent } from '../../legal/legal-consent/legal-consent.component';
import { PublicLegalDocument } from '../../legal/legal.model';
import { consentFor, LegalService } from '../../legal/legal.service';

/**
 * Componente de Registro
 *
 * Permite crear cuentas de alumno (el registro público nunca crea docentes).
 */
@Component({
  selector: 'app-register',
  standalone: true,
  imports: [TranslatePipe, CommonModule, ReactiveFormsModule, RouterLink, LegalConsentComponent],
  templateUrl: './register.component.html',
  styleUrl: './register.component.scss'
})
export class RegisterComponent {
  private fb = inject(FormBuilder);
  readonly i18n = inject(I18nService);
  private authService = inject(AuthService);
  private router = inject(Router);
  readonly returnUrl = liveReturnUrl(inject(ActivatedRoute).snapshot.queryParamMap.get('returnUrl'));

  registerForm: FormGroup;
  private failure = signal<unknown>(null);
  private errorKey = signal('');
  readonly errorMessage = computed(() => {
    const key = this.errorKey();
    return key ? this.i18n.errorMessage(this.failure(), key) : '';
  });
  readonly isLoading = signal(false);

  // W02 (LEGAL-01/02): el servidor exige aceptar los términos vigentes; privacidad solo se informa.
  private legal = inject(LegalService);
  private legalDocs = signal<PublicLegalDocument[]>([]);
  readonly legalUnavailable = signal(false);
  readonly consentDocs = computed(() => this.legalDocs()
    .filter(d => d.documentKey === 'terms' || d.documentKey === 'privacy')
    .map(d => ({ documentKey: d.documentKey, version: d.documentVersion, title: d.title })));
  readonly needsConsent = computed(() => this.consentDocs().some(d => d.documentKey !== 'privacy'));
  readonly legalAccepted = signal(false);
  readonly consentSubmitted = signal(false);
  readonly legalError = signal('');

  constructor() {
    // Formulario con campos adicionales comparado con Login
    this.registerForm = this.fb.group({
      // Nombre completo (requerido, mínimo 3 caracteres)
      name: ['', [Validators.required, Validators.minLength(3)]],

      // Email (requerido y formato válido)
      email: ['', [Validators.required, Validators.email]],

      // Password (requerido, mínimo 6 caracteres)
      password: ['', [Validators.required, Validators.minLength(6)]]
    });
    // Títulos en el idioma de la interfaz; si cambia la versión vigente, hay que volver a aceptar.
    effect(() => {
      const locale = this.i18n.locale();
      untracked(() => this.loadLegal(locale));
    });
  }

  /** Si falla, el registro no se bloquea: el servidor decide con `legal_acceptance_required`. */
  loadLegal(locale = this.i18n.locale()): void {
    this.legalRequest?.unsubscribe();
    this.legalRequest = this.legal.current(locale).subscribe({
      next: docs => {
        const before = this.consentDocs().map(d => d.documentKey + d.version).join();
        this.legalDocs.set(docs);
        this.legalUnavailable.set(false);
        if (before && before !== this.consentDocs().map(d => d.documentKey + d.version).join()) this.legalAccepted.set(false);
      },
      error: () => this.legalUnavailable.set(true)
    });
  }
  private legalRequest?: Subscription;

  /**
   * Maneja el envío del formulario de registro
   */
  onSubmit(): void {
    if (this.isLoading()) return;
    this.consentSubmitted.set(true);
    if (this.registerForm.invalid || (this.needsConsent() && !this.legalAccepted())) {
      this.registerForm.markAllAsTouched();
      return;
    }

    this.isLoading.set(true);
    this.errorKey.set('');
    this.failure.set(null);
    this.legalError.set('');

    // Obtener todos los valores del formulario
    const formData = {
      ...this.registerForm.value,
      locale: this.i18n.locale(),
      ...(this.needsConsent() ? { legalConsent: consentFor(this.legalDocs().filter(d => d.documentKey === 'terms')) } : {})
    };

    // Llamar al servicio de registro
    this.authService.register(formData).subscribe({
      next: (response) => {
        if (this.returnUrl) { void this.router.navigateByUrl(this.returnUrl); return; }

        // El backend automáticamente hace login después del registro
        // y devuelve el token, por lo que podemos redirigir directamente

        // Redirigir según el rol
        if (response.user.role === 'teacher') {
          this.router.navigate(['/teacher/dashboard']);
        } else {
          this.router.navigate(['/student/dashboard']);
        }
      },

      error: (error) => {
        this.failure.set(error);
        this.isLoading.set(false);

        // Manejar diferentes tipos de errores
        if (['legal_acceptance_required', 'legal_version_changed'].includes(error?.error?.code)) {
          // Otra versión entró en vigencia: se recarga y se pide aceptar de nuevo.
          this.legalAccepted.set(false);
          this.loadLegal();
          this.errorKey.set('');
          this.legalError.set(this.legal.errorMessage(error));
        } else if (error.status === 400) {
          // Error de validación (ej: email ya existe)
          this.errorKey.set('auth.invalidData');
        } else {
          this.errorKey.set('auth.registerError');
        }
      },

      complete: () => {
        this.isLoading.set(false);
      }
    });
  }

  /**
   * Verifica si un campo tiene error
   */
  hasError(field: string): boolean {
    const control = this.registerForm.get(field);
    return !!(control && control.invalid && control.touched);
  }

  /**
   * Obtiene el mensaje de error específico para cada campo
   */
  getErrorMessage(field: string): string {
    const control = this.registerForm.get(field);

    if (control?.hasError('required')) {
      const fieldNames: { [key: string]: string } = {
        name: 'auth.nameRequired',
        email: 'auth.emailRequired',
        password: 'auth.passwordRequired'
      };
      return this.i18n.t(fieldNames[field]);
    }

    if (control?.hasError('email')) {
      return this.i18n.t('auth.emailInvalid');
    }

    if (control?.hasError('minlength')) {
      const minLength = control.errors?.['minlength'].requiredLength;
      return this.i18n.t('auth.minLength', { min: minLength });
    }

    return '';
  }
}
