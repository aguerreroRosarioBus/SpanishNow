import { Component, computed, effect, inject, input, output, untracked } from '@angular/core';
import { NavigationEnd, Router, RouterLink, RouterLinkActive } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { filter, map } from 'rxjs/operators';
import { AuthService } from '../../../core/services/auth.service';
import { CommentBadgeService } from '../../../core/services/comment-badge.service';
import { IconComponent } from '../icon/icon.component';

interface NavItem {
  label: string;
  icon: string;
  link: string;
  query?: Record<string, string>;
  /** Rutas hijas que también marcan este ítem como activo (p. ej. el reproductor cuelga de «Mis cursos») */
  alsoActiveUnder?: string;
  /** Si es true, solo se marca activo cuando coinciden también los parámetros de la URL */
  exactQuery?: boolean;
  /** Muestra un contador (comentarios sin responder). */
  badge?: 'comments';
}

interface NavGroup {
  title: string;
  items: NavItem[];
}

@Component({
  selector: 'app-sidebar-nav',
  standalone: true,
  imports: [RouterLink, RouterLinkActive, IconComponent],
  templateUrl: './sidebar-nav.component.html',
  styleUrl: './sidebar-nav.component.scss'
})
export class SidebarNavComponent {
  private authService = inject(AuthService);
  private router = inject(Router);
  private commentBadge = inject(CommentBadgeService);
  unansweredComments = this.commentBadge.unanswered;
  private badgeLoaded = false;
  currentUser = this.authService.currentUser;
  private url = toSignal(
    this.router.events.pipe(filter((e): e is NavigationEnd => e instanceof NavigationEnd), map(e => e.urlAfterRedirects)),
    { initialValue: this.router.url }
  );

  constructor() {
    // El badge de comentarios sin responder se actualiza al navegar (con un intervalo mínimo entre consultas)
    effect(() => {
      this.url();
      const teacher = this.currentUser()?.role === 'teacher';
      untracked(() => {
        if (!teacher) { this.commentBadge.reset(); return; }
        // La primera consulta de cada sesión ignora el intervalo mínimo
        this.commentBadge.refresh(!this.badgeLoaded);
        this.badgeLoaded = true;
      });
    });
  }

  /** Cantidad a mostrar en el ítem (0 = sin badge). */
  badgeCount(item: NavItem): number { return item.badge === 'comments' ? this.unansweredComments() : 0; }

  isUnder(item: NavItem): boolean {
    return !!item.alsoActiveUnder && this.url().startsWith(item.alsoActiveUnder);
  }

  /** Plegada a 64px (solo íconos) */
  collapsed = input(false);
  /** Plegado automático (reproductor): no se puede expandir a mano */
  forced = input(false);
  collapseToggle = output<void>();

  groups = computed<NavGroup[]>(() => {
    if (this.currentUser()?.role === 'student') {
      return [
        {
          title: 'Aprendizaje',
          items: [
            { label: 'Mis cursos', icon: 'book-open', link: '/student/dashboard', exactQuery: true, alsoActiveUnder: '/student/course/' },
            { label: 'Explorar cursos', icon: 'compass', link: '/student/dashboard', query: { view: 'catalog' }, exactQuery: true },
            { label: 'Mi avance', icon: 'bar-chart', link: '/student/progress' },
            { label: 'Clases en vivo', icon: 'rectangle', link: '/live' },
            { label: 'Maestros', icon: 'users', link: '/teachers' }
          ]
        },
        { title: 'Cuenta', items: [{ label: 'Mis compras', icon: 'receipt', link: '/student/purchases' }, { label: 'Configuración', icon: 'settings', link: '/settings' }] }
      ];
    }
    return [
      {
        title: 'Enseñanza',
        items: [
          { label: 'Mis cursos', icon: 'book-open', link: '/teacher/dashboard', alsoActiveUnder: '/teacher/course/' },
          { label: 'Clases en vivo', icon: 'rectangle', link: '/live' },
          { label: 'Comentarios', icon: 'message-square', link: '/teacher/comments', badge: 'comments' }
        ]
      },
      {
        title: 'Negocio',
        items: [
          { label: 'Ventas', icon: 'shopping-bag', link: '/teacher/sales' },
          { label: 'Órdenes', icon: 'receipt', link: '/teacher/orders' },
          { label: 'Cupones', icon: 'tag', link: '/teacher/coupons' },
          { label: 'Afiliados', icon: 'share', link: '/teacher/affiliates' }
        ]
      },
      { title: 'Cuenta', items: [{ label: 'Configuración', icon: 'settings', link: '/settings' }] }
    ];
  });
}
