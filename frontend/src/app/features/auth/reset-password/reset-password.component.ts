import { Component, inject, signal } from '@angular/core';
import { AbstractControl, FormBuilder, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';

function passwordsMatch(group: AbstractControl): ValidationErrors | null {
  return group.get('password')?.value === group.get('confirm')?.value ? null : { mismatch: true };
}

/** Elegir o cambiar la contraseña con el token del email (también sirve para invitaciones: ?invite=1). */
@Component({
  selector: 'app-reset-password',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './reset-password.component.html',
  styleUrl: './reset-password.component.scss'
})
export class ResetPasswordComponent {
  private authService = inject(AuthService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);

  token = this.route.snapshot.queryParamMap.get('token') ?? '';
  isInvite = this.route.snapshot.queryParamMap.get('invite') === '1';

  form = inject(FormBuilder).group({
    password: ['', [Validators.required, Validators.minLength(6)]],
    confirm: ['', [Validators.required]]
  }, { validators: passwordsMatch });
  isLoading = signal(false);
  errorMessage = signal('');

  submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.isLoading.set(true);
    this.errorMessage.set('');
    this.authService.resetPassword({ token: this.token, password: this.form.value.password! }).subscribe({
      next: response => {
        // La sesión ya quedó guardada por AuthService, igual que en el login
        this.router.navigate([response.user.role === 'teacher' ? '/teacher/dashboard' : '/student/dashboard']);
      },
      error: error => {
        this.isLoading.set(false);
        this.errorMessage.set(error?.status === 400 || error?.status === 404
          ? 'This link is invalid or has expired. Please request a new one.'
          : 'Something went wrong. Please try again.');
      }
    });
  }

  fieldInvalid(field: 'password' | 'confirm'): boolean {
    const control = this.form.controls[field];
    return control.invalid && control.touched;
  }

  mismatch(): boolean {
    return this.form.hasError('mismatch') && this.form.controls.confirm.touched;
  }
}
