import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';

/**
 * Componente de Login
 *
 * Este componente maneja el inicio de sesión de usuarios (profesores y alumnos).
 * Usa Reactive Forms para validación y manejo de formularios.
 */
@Component({
  selector: 'app-login',
  standalone: true, // Componente standalone (no necesita NgModule)
  imports: [
    CommonModule,        // Directivas comunes (ngIf, ngFor, etc.)
    ReactiveFormsModule, // Para formularios reactivos
    RouterLink           // Para enlace a registro
  ],
  templateUrl: './login.component.html',
  styleUrl: './login.component.scss'
})
export class LoginComponent {
  // Inyección de dependencias usando inject() (nueva forma de Angular)
  private fb = inject(FormBuilder);      // Para construir formularios
  private authService = inject(AuthService); // Servicio de autenticación
  private router = inject(Router);       // Para navegación

  // Estado del componente
  loginForm: FormGroup;           // Formulario reactivo
  errorMessage: string = '';      // Mensaje de error si falla login
  isLoading: boolean = false;     // Indicador de carga durante petición

  constructor() {
    // Inicializar el formulario con validaciones
    this.loginForm = this.fb.group({
      // Campo email: requerido y debe ser email válido
      email: ['', [Validators.required, Validators.email]],

      // Campo password: requerido y mínimo 6 caracteres
      password: ['', [Validators.required, Validators.minLength(6)]]
    });
  }

  /**
   * Método que se ejecuta al enviar el formulario
   */
  onSubmit(): void {
    // Si el formulario es inválido, marcar todos los campos como touched
    // para mostrar los errores de validación
    if (this.loginForm.invalid) {
      this.loginForm.markAllAsTouched();
      return;
    }

    // Activar indicador de carga
    this.isLoading = true;
    this.errorMessage = '';

    // Obtener los valores del formulario
    const { email, password } = this.loginForm.value;

    // Llamar al servicio de autenticación
    this.authService.login({ email, password }).subscribe({
      // Si el login es exitoso
      next: (response) => {
        console.log('Login exitoso:', response);

        // Redirigir según el rol del usuario
        if (response.user.role === 'teacher') {
          // Si es profesor, ir al dashboard de profesor
          this.router.navigate(['/teacher/dashboard']);
        } else {
          // Si es alumno, ir al dashboard de alumno
          this.router.navigate(['/student/dashboard']);
        }
      },

      // Si hay un error
      error: (error) => {
        console.error('Error en login:', error);
        this.isLoading = false;

        // Mostrar mensaje de error apropiado
        if (error.status === 401) {
          this.errorMessage = 'Email o contraseña incorrectos';
        } else {
          this.errorMessage = 'Error al iniciar sesión. Por favor intenta de nuevo.';
        }
      },

      // Siempre se ejecuta al final (éxito o error)
      complete: () => {
        this.isLoading = false;
      }
    });
  }

  /**
   * Helper para verificar si un campo tiene error y fue tocado
   * Se usa en el template para mostrar mensajes de error
   */
  hasError(field: string): boolean {
    const control = this.loginForm.get(field);
    return !!(control && control.invalid && control.touched);
  }

  /**
   * Helper para obtener el mensaje de error específico de un campo
   */
  getErrorMessage(field: string): string {
    const control = this.loginForm.get(field);

    if (control?.hasError('required')) {
      return `${field === 'email' ? 'El email' : 'La contraseña'} es requerida`;
    }

    if (control?.hasError('email')) {
      return 'Ingresa un email válido';
    }

    if (control?.hasError('minlength')) {
      return 'La contraseña debe tener al menos 6 caracteres';
    }

    return '';
  }
}