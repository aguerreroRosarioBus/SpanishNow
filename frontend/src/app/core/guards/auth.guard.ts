import { inject } from '@angular/core';
import { Router, CanActivateFn } from '@angular/router';
import { map } from 'rxjs';
import { AuthService } from '../services/auth.service';

export const authGuard: CanActivateFn = () => {
  const authService = inject(AuthService);
  const router = inject(Router);

  if (authService.isAuthenticated()) {
    return true;
  }

  router.navigate(['/auth/login']);
  return false;
};

export const teacherGuard: CanActivateFn = () => {
  const authService = inject(AuthService);
  const router = inject(Router);

  if (authService.isAuthenticated() && authService.isTeacher()) {
    return true;
  }

  router.navigate(['/']);
  return false;
};

export const studentGuard: CanActivateFn = () => {
  const authService = inject(AuthService);
  const router = inject(Router);

  if (authService.isAuthenticated() && authService.isStudent()) {
    return true;
  }

  router.navigate(['/']);
  return false;
};

/** Panel de administración: cualquier cuenta con permisos de administración. */
export const adminGuard: CanActivateFn = () => {
  const authService = inject(AuthService);
  const router = inject(Router);

  if (!authService.isAuthenticated()) return router.createUrlTree(['/auth/login']);
  if (authService.isAdmin()) return true;
  // Sesión guardada antes de que existieran los permisos: se consultan antes de decidir.
  if (authService.currentUser()?.permissions === undefined) {
    return authService.loadMe().pipe(map(() => authService.isAdmin() || router.createUrlTree(['/'])));
  }
  return router.createUrlTree(['/']);
};
