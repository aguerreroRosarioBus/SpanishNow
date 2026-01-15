import { Component, inject, signal, output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../../environments/environment';
import { ToastService } from '../../../core/services/toast.service';

@Component({
  selector: 'app-change-password-modal',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './change-password-modal.component.html',
  styleUrl: './change-password-modal.component.scss'
})
export class ChangePasswordModalComponent {
  private fb = inject(FormBuilder);
  private http = inject(HttpClient);
  private toastService = inject(ToastService);

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

    this.http.post(`${environment.apiUrl}/auth/change-password`, {
      currentPassword,
      newPassword
    }).subscribe({
      next: () => {
        this.toastService.show('success', 'Contraseña cambiada exitosamente');
        this.close.emit();
      },
      error: (error) => {
        const errorMessage = error.error?.error || 'Error al cambiar la contraseña';
        this.toastService.show('error', errorMessage);
        this.isSubmitting.set(false);
      }
    });
  }

  onCancel(): void {
    this.close.emit();
  }
}
