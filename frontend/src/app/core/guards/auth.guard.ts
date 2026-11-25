import { inject } from '@angular/core';
import { Router, CanActivateFn, RedirectFunction } from '@angular/router';
import { map } from 'rxjs';
import { AuthService } from '../services/auth.service';

const dashboardPath = (auth: AuthService) => auth.isTeacher() ? '/teacher/dashboard' : '/student/dashboard';

export const homeRedirect: RedirectFunction = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  return router.parseUrl(auth.isAuthenticated() && auth.currentUser() ? dashboardPath(auth) : '/auth/login');
};

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

/** Administración de usuarios y cuentas de prueba. */
export const adminGuard: CanActivateFn = () => {
  const authService = inject(AuthService);
  const router = inject(Router);

  if (!authService.isAuthenticated()) return router.createUrlTree(['/auth/login']);
  const canAccessUsers = () => authService.hasPermission('users.manage') || authService.hasPermission('test_users.manage');
  if (canAccessUsers()) return true;
  // Sesión guardada antes de que existieran los permisos: se consultan antes de decidir.
  if (authService.currentUser()?.permissions === undefined) {
    return authService.loadMe().pipe(map(() => canAccessUsers() || router.parseUrl(dashboardPath(authService))));
  }
  return router.parseUrl(dashboardPath(authService));
};
