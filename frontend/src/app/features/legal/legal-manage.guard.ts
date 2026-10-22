import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { map } from 'rxjs/operators';
import { AuthService } from '../../core/services/auth.service';

/** Editor legal: solo con la capacidad explícita `legal.manage` (el servidor vuelve a verificarla). */
export const legalManageGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  if (!auth.isAuthenticated()) return router.createUrlTree(['/auth/login']);
  if (auth.hasPermission('legal.manage')) return true;
  // Sesión guardada antes de que existieran los permisos: se consultan antes de decidir.
  if (auth.currentUser()?.permissions === undefined) {
    return auth.loadMe().pipe(map(() => auth.hasPermission('legal.manage') || router.createUrlTree(['/'])));
  }
  return router.createUrlTree(['/']);
};
