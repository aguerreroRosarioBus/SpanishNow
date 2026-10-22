import { Component, computed, inject, signal, output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../../environments/environment';
import { ToastService } from '../../../core/services/toast.service';
import { I18nService } from '../../../core/i18n/i18n.service';
import { TranslatePipe } from '../../../core/i18n/translate.pipe';

@Component({
  selector: 'app-change-password-modal',
  standalone: true,
  imports: [TranslatePipe, CommonModule, ReactiveFormsModule],
  templateUrl: './change-password-modal.component.html',
  styleUrl: './change-password-modal.component.scss'
})
export class ChangePasswordModalComponent {
  private fb = inject(FormBuilder);
  private http = inject(HttpClient);
  private toastService = inject(ToastService);
  private i18n = inject(I18nService);
  private failure = signal<unknown>(null);
  readonly errorMessage = computed(() => this.failure() ? this.i18n.errorMessage(this.failure(), 'auth.changePasswordError') : '');

  close = output<void>();

  changePasswordForm: FormGroup;
  isSubmitting = signal<boolean>(false);
  showCurrentPassword = signal<boolean>(false);
  showNewPassword = signal<boolean>(false);
  showConfirmPassword = signal<boolean>(false);

  constructor() {
    this.changePasswordForm = this.fb.group({
      currentPassword: ['', [Validators.required]],
      newPassword: ['', [Validators.required, Validators.minLength(6)]],
      confirmPassword: ['', [Validators.required]]
    }, {
      validators: this.passwordMatchValidator
    });
  }

  passwordMatchValidator(group: FormGroup) {
    const newPassword = group.get('newPassword')?.value;
    const confirmPassword = group.get('confirmPassword')?.value;
    return newPassword === confirmPassword ? null : { passwordMismatch: true };
  }

  toggleShowPassword(field: 'current' | 'new' | 'confirm'): void {
    if (field === 'current') {
      this.showCurrentPassword.update(v => !v);
    } else if (field === 'new') {
      this.showNewPassword.update(v => !v);
    } else {
      this.showConfirmPassword.update(v => !v);
    }
  }

  onSubmit(): void {
    if (this.changePasswordForm.invalid || this.isSubmitting()) {
      return;
    }

    const { currentPassword, newPassword } = this.changePasswordForm.value;

    this.isSubmitting.set(true);
    this.failure.set(null);

    this.http.post(`${environment.apiUrl}/auth/change-password`, {
      currentPassword,
      newPassword
    }).subscribe({
      next: () => {
        this.toastService.show('success', this.i18n.t('auth.passwordChanged'));
        this.close.emit();
      },
      error: (error) => {
        this.failure.set(error);
        this.isSubmitting.set(false);
      }
    });
  }

  onCancel(): void {
    this.close.emit();
  }
}
