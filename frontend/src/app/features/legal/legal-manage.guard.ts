import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { map } from 'rxjs/operators';
import { AuthService } from '../../core/services/auth.service';

/**
 * Editor legal: exige sesión y deja entrar a quien la tenga. Si falta `legal.manage` el propio editor
 * muestra un aviso (antes se redirigía a «/» y se veía una pantalla vacía); el servidor vuelve a verificar el permiso.
 */
export const legalManageGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  if (!auth.isAuthenticated()) return router.createUrlTree(['/auth/login']);
  // Sesión guardada antes de que existieran los permisos: se consultan antes de mostrar el editor.
  if (auth.currentUser()?.permissions === undefined) return auth.loadMe().pipe(map(() => true));
  return true;
};
