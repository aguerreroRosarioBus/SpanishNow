import { Component, computed, inject, input, output } from '@angular/core';
import { NavigationEnd, Router, RouterLink, RouterLinkActive } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { filter, map } from 'rxjs/operators';
import { AuthService } from '../../../core/services/auth.service';
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
  currentUser = this.authService.currentUser;
  private url = toSignal(
    this.router.events.pipe(filter((e): e is NavigationEnd => e instanceof NavigationEnd), map(e => e.urlAfterRedirects)),
    { initialValue: this.router.url }
  );

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
            { label: 'Maestros', icon: 'users', link: '/teachers' }
          ]
        },
        { title: 'Cuenta', items: [{ label: 'Mis compras', icon: 'receipt', link: '/student/purchases' }, { label: 'Configuración', icon: 'settings', link: '/settings' }] }
      ];
    }
    return [
      { title: 'Enseñanza', items: [{ label: 'Mis cursos', icon: 'book-open', link: '/teacher/dashboard', alsoActiveUnder: '/teacher/course/' }] },
      {
        title: 'Negocio',
        items: [
          { label: 'Ventas', icon: 'shopping-bag', link: '/teacher/sales' },
          { label: 'Órdenes', icon: 'receipt', link: '/teacher/orders' },
          { label: 'Cupones', icon: 'tag', link: '/teacher/coupons' }
        ]
      },
      { title: 'Cuenta', items: [{ label: 'Configuración', icon: 'settings', link: '/settings' }] }
    ];
  });
}
