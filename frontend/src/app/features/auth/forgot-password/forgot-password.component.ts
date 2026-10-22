import { I18nService } from '../../../core/i18n/i18n.service';
import { TranslatePipe } from '../../../core/i18n/translate.pipe';
import { Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';

/** Pide el email para recibir el link de recuperación (siempre responde igual: no revela si existe). */
@Component({
  selector: 'app-forgot-password',
  standalone: true,
  imports: [TranslatePipe, ReactiveFormsModule, RouterLink],
  templateUrl: './forgot-password.component.html',
  styleUrl: './forgot-password.component.scss'
})
export class ForgotPasswordComponent {
  readonly i18n = inject(I18nService);
  private authService = inject(AuthService);

  form = inject(FormBuilder).group({
    email: ['', [Validators.required, Validators.email]]
  });
  isLoading = signal(false);
  sent = signal(false);
  private failure = signal<unknown>(null);
  errorMessage = computed(() => this.failure() ? this.i18n.errorMessage(this.failure()) : '');

  submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.isLoading.set(true);
    this.failure.set(null);
    this.authService.forgotPassword(this.form.value.email!.trim()).subscribe({
      next: () => {
        this.sent.set(true);
        this.isLoading.set(false);
      },
      error: error => {
        this.failure.set(error);
        this.isLoading.set(false);
      }
    });
  }

  invalid(): boolean {
    const control = this.form.controls.email;
    return control.invalid && control.touched;
  }
}
