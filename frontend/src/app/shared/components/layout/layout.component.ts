import { TranslatePipe } from '../../../core/i18n/translate.pipe';
import { Component, computed, inject, signal } from '@angular/core';
import { RouterOutlet, RouterLink, Router, NavigationEnd } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { filter, map } from 'rxjs/operators';
import { NavbarTopComponent } from '../navbar-top/navbar-top.component';
import { SidebarNavComponent } from '../sidebar-nav/sidebar-nav.component';
import { AuthService } from '../../../core/services/auth.service';
import { ScreenTutorialComponent } from '../screen-tutorial/screen-tutorial.component';

@Component({
  selector: 'app-layout',
  standalone: true,
  imports: [TranslatePipe, RouterOutlet, RouterLink, NavbarTopComponent, SidebarNavComponent, ScreenTutorialComponent],
  templateUrl: './layout.component.html',
  styleUrl: './layout.component.scss'
})
export class LayoutComponent {
  private router = inject(Router);
  private authService = inject(AuthService);
  currentUser = this.authService.currentUser;
  impersonating = this.authService.impersonating;
  readonly year = new Date().getFullYear();

  private url = toSignal(
    this.router.events.pipe(
      filter((event): event is NavigationEnd => event instanceof NavigationEnd),
      map(event => event.urlAfterRedirects)
    ),
    { initialValue: this.router.url }
  );

  /** Pantallas de acceso: sin barra lateral ni datos de usuario, con el pie público. */
  isAuthPage = computed(() => this.url().startsWith('/auth/'));
  /** El reproductor es el único lugar donde el contenido usa el ancho de 1180px. */
  isPlayer = computed(() => /^\/student\/course\/[^/]+\/play/.test(this.url()));
  isLiveRoom = computed(() => /^\/live\/\d+(?:\?|$)/.test(this.url()));
  isWorkspace = computed(() => this.isPlayer() || this.isLiveRoom());
  showSidebar = computed(() => !this.isAuthPage() && !!this.authService.currentUser());
  /** El pie público solo se ve fuera de la app autenticada. */
  showFooter = computed(() => !this.authService.currentUser() || this.isAuthPage());

  userCollapsed = signal(false);
  /** En el reproductor la barra lateral se pliega sola. */
  sidebarCollapsed = computed(() => this.isWorkspace() || this.userCollapsed());
  sidebarOpen = signal(false);

  constructor() {
    // Al navegar en móvil se cierra el menú desplegable
    this.router.events.pipe(filter(e => e instanceof NavigationEnd)).subscribe(() => this.sidebarOpen.set(false));
  }

  stopImpersonating(): void {
    this.authService.stopImpersonating();
  }

  toggleSidebar(): void {
    this.sidebarOpen.update(v => !v);
  }

  toggleCollapse(): void {
    this.userCollapsed.update(v => !v);
  }
}
