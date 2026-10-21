import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';
/** Keep an invitation through login without accepting redirects to external sites. */
export const liveAuthGuard: CanActivateFn = (_route, state) => inject(AuthService).isAuthenticated()
  ? true : inject(Router).createUrlTree(['/auth/login'], { queryParams: { returnUrl: state.url } });
export const liveReturnUrl = (value: string | null): string | null => value && /^\/live(?:\/|\?|$)/.test(value) && !/[\\\u0000-\u001f]/.test(value) ? value : null;
