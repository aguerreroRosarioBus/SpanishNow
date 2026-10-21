import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';

/** Pide el email para recibir el link de recuperación (siempre responde igual: no revela si existe). */
@Component({
  selector: 'app-forgot-password',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './forgot-password.component.html',
  styleUrl: './forgot-password.component.scss'
})
export class ForgotPasswordComponent {
  private authService = inject(AuthService);

  form = inject(FormBuilder).group({
    email: ['', [Validators.required, Validators.email]]
  });
  isLoading = signal(false);
  sent = signal(false);
  errorMessage = signal('');

  submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.isLoading.set(true);
    this.errorMessage.set('');
    this.authService.forgotPassword(this.form.value.email!.trim()).subscribe({
      next: () => {
        this.sent.set(true);
        this.isLoading.set(false);
      },
      error: () => {
        this.errorMessage.set('Something went wrong. Please try again.');
        this.isLoading.set(false);
      }
    });
  }

  invalid(): boolean {
    const control = this.form.controls.email;
    return control.invalid && control.touched;
  }
}
