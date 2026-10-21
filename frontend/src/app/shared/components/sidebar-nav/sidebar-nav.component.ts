import { Component, computed, inject, input, output } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';
import { IconComponent } from '../icon/icon.component';

interface NavItem {
  label: string;
  icon: string;
  link: string;
  query?: Record<string, string>;
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
  currentUser = this.authService.currentUser;

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
            { label: 'Mis cursos', icon: 'book-open', link: '/student/dashboard', exactQuery: true },
            { label: 'Explorar cursos', icon: 'compass', link: '/student/dashboard', query: { view: 'catalog' }, exactQuery: true },
            { label: 'Mi avance', icon: 'bar-chart', link: '/student/progress' },
            { label: 'Maestros', icon: 'users', link: '/teachers' }
          ]
        },
        { title: 'Cuenta', items: [{ label: 'Configuración', icon: 'settings', link: '/settings' }] }
      ];
    }
    return [
      { title: 'Enseñanza', items: [{ label: 'Mis cursos', icon: 'book-open', link: '/teacher/dashboard' }] },
      { title: 'Cuenta', items: [{ label: 'Configuración', icon: 'settings', link: '/settings' }] }
    ];
  });
}
