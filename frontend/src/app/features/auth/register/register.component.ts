import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';

/**
 * Componente de Registro
 *
 * Permite crear cuentas nuevas para profesores y alumnos.
 * Similar al Login pero con campos adicionales (name, role).
 */
@Component({
  selector: 'app-register',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink],
  templateUrl: './register.component.html',
  styleUrl: './register.component.scss'
})
export class RegisterComponent {
  private fb = inject(FormBuilder);
  private authService = inject(AuthService);
  private router = inject(Router);

  registerForm: FormGroup;
  errorMessage: string = '';
  isLoading: boolean = false;

  constructor() {
    // Formulario con campos adicionales comparado con Login
    this.registerForm = this.fb.group({
      // Nombre completo (requerido, mínimo 3 caracteres)
      name: ['', [Validators.required, Validators.minLength(3)]],

      // Email (requerido y formato válido)
      email: ['', [Validators.required, Validators.email]],

      // Password (requerido, mínimo 6 caracteres)
      password: ['', [Validators.required, Validators.minLength(6)]],

      // Rol: teacher o student (requerido)
      // Por defecto: student (mayoría de usuarios serán alumnos)
      role: ['student', [Validators.required]]
    });
  }

  /**
   * Maneja el envío del formulario de registro
   */
  onSubmit(): void {
    if (this.registerForm.invalid) {
      this.registerForm.markAllAsTouched();
      return;
    }

    this.isLoading = true;
    this.errorMessage = '';

    // Obtener todos los valores del formulario
    const formData = this.registerForm.value;

    // Llamar al servicio de registro
    this.authService.register(formData).subscribe({
      next: (response) => {
        console.log('Registro exitoso:', response);

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
        console.error('Error en registro:', error);
        this.isLoading = false;

        // Manejar diferentes tipos de errores
        if (error.status === 400) {
          // Error de validación (ej: email ya existe)
          this.errorMessage = error.error.error || 'Datos inválidos';
        } else {
          this.errorMessage = 'Error al registrarse. Por favor intenta de nuevo.';
        }
      },

      complete: () => {
        this.isLoading = false;
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
        name: 'El nombre',
        email: 'El email',
        password: 'La contraseña',
        role: 'El rol'
      };
      return `${fieldNames[field]} es requerido`;
    }

    if (control?.hasError('email')) {
      return 'Ingresa un email válido';
    }

    if (control?.hasError('minlength')) {
      const minLength = control.errors?.['minlength'].requiredLength;
      return `Debe tener al menos ${minLength} caracteres`;
    }

    return '';
  }
}