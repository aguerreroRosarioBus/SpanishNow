import { I18nService } from '../../../core/i18n/i18n.service';
import { TranslatePipe } from '../../../core/i18n/translate.pipe';
import { Component, computed, inject, signal } from '@angular/core';
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
  imports: [TranslatePipe, ReactiveFormsModule, RouterLink],
  templateUrl: './reset-password.component.html',
  styleUrl: './reset-password.component.scss'
})
export class ResetPasswordComponent {
  readonly i18n = inject(I18nService);
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
  private failure = signal<{ status?: number } | null>(null);
  errorMessage = computed(() => {
    const failure = this.failure();
    return failure ? this.i18n.errorMessage(failure, failure.status === 400 || failure.status === 404
      ? 'auth.invalidLink' : 'errors.unexpected') : '';
  });

  submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.isLoading.set(true);
    this.failure.set(null);
    this.authService.resetPassword({ token: this.token, password: this.form.value.password! }).subscribe({
      next: response => {
        // La sesión ya quedó guardada por AuthService, igual que en el login
        this.router.navigate([response.user.role === 'teacher' ? '/teacher/dashboard' : '/student/dashboard']);
      },
      error: error => {
        this.isLoading.set(false);
        this.failure.set(error);
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
