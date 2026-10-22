import { I18nService } from '../../../core/i18n/i18n.service';
import { TranslatePipe } from '../../../core/i18n/translate.pipe';
import { Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { liveReturnUrl } from '../../../core/guards/live-auth.guard';
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
    TranslatePipe,
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
  readonly i18n = inject(I18nService);
  private authService = inject(AuthService); // Servicio de autenticación
  private router = inject(Router);       // Para navegación
  readonly returnUrl = liveReturnUrl(inject(ActivatedRoute).snapshot.queryParamMap.get('returnUrl'));

  // Estado del componente
  loginForm: FormGroup;           // Formulario reactivo
  private failure = signal<unknown>(null);
  private errorKey = signal('');
  readonly errorMessage = computed(() => {
    const key = this.errorKey();
    return key ? this.i18n.errorMessage(this.failure(), key) : '';
  });
  readonly isLoading = signal(false);

  constructor() {
    // Entrar a la pantalla de acceso descarta cualquier sesión vieja (el header no debe mostrar a otro usuario)
    this.authService.logout();

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
    if (this.isLoading()) return;
    // Si el formulario es inválido, marcar todos los campos como touched
    // para mostrar los errores de validación
    if (this.loginForm.invalid) {
      this.loginForm.markAllAsTouched();
      return;
    }

    // Activar indicador de carga
    this.isLoading.set(true);
    this.errorKey.set('');
    this.failure.set(null);

    // Obtener los valores del formulario
    const { email, password } = this.loginForm.value;

    // Llamar al servicio de autenticación
    this.authService.login({ email, password }).subscribe({
      // Si el login es exitoso
      next: (response) => {
        if (this.returnUrl) { void this.router.navigateByUrl(this.returnUrl); return; }

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
        this.failure.set(error);
        this.isLoading.set(false);

        // Mostrar mensaje de error apropiado
        if (error.status === 401) {
          this.errorKey.set('auth.invalidCredentials');
        } else if (error.status === 403) {
          this.errorKey.set('auth.suspended');
        } else {
          this.errorKey.set('auth.loginError');
        }
      },

      // Siempre se ejecuta al final (éxito o error)
      complete: () => {
        this.isLoading.set(false);
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
      return this.i18n.t(field === 'email' ? 'auth.emailRequired' : 'auth.passwordRequired');
    }

    if (control?.hasError('email')) {
      return this.i18n.t('auth.emailInvalid');
    }

    if (control?.hasError('minlength')) {
      return this.i18n.t('auth.minLength', { min: 6 });
    }

    return '';
  }
}
