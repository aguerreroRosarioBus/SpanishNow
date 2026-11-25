import { Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { AuthService } from '../../core/services/auth.service';

/**
 * Página 404 (A-01). Cualquier URL desconocida llega aquí y NO toca la sesión: antes `**` redirigía a `auth/login`,
 * cuyo constructor llama a `logout()`, y una dirección mal escrita sacaba al usuario.
 */
@Component({
  selector: 'app-not-found',
  standalone: true,
  imports: [RouterLink, TranslatePipe],
  styleUrl: './not-found.component.scss',
  template: `<div class="not-found" data-testid="not-found">
  <p class="not-found__code">{{ 'notFound.code' | t }}</p>
  <h1 class="page-title">{{ 'notFound.title' | t }}</h1>
  <p class="not-found__help">{{ 'notFound.help' | t }}</p>
  <div class="not-found__actions">
    @if (home(); as target) {
      <a class="btn btn-primary" [routerLink]="target.link">{{ target.label | t }}</a>
      <a class="btn btn-secondary" routerLink="/courses">{{ 'notFound.catalog' | t }}</a>
    } @else {
      <a class="btn btn-primary" routerLink="/auth/login">{{ 'notFound.login' | t }}</a>
      <a class="btn btn-secondary" routerLink="/courses">{{ 'notFound.catalog' | t }}</a>
    }
  </div>
</div>`
})
export class NotFoundComponent {
  private auth = inject(AuthService);

  /** Destino «de inicio» de quien tiene sesión; null si no la hay. */
  readonly home = computed(() => {
    if (!this.auth.currentUser() || !this.auth.isAuthenticated()) return null;
    return this.auth.isTeacher()
      ? { link: '/teacher/dashboard', label: 'notFound.teacherPanel' }
      : { link: '/student/dashboard', label: 'notFound.myCourses' };
  });
}
