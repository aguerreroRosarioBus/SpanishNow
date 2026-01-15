import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterOutlet, Router, NavigationEnd } from '@angular/router';
import { filter } from 'rxjs/operators';
import { NavbarTopComponent } from '../navbar-top/navbar-top.component';
import { SidebarNavComponent } from '../sidebar-nav/sidebar-nav.component';

@Component({
  selector: 'app-layout',
  standalone: true,
  imports: [CommonModule, RouterOutlet, NavbarTopComponent, SidebarNavComponent],
  templateUrl: './layout.component.html',
  styleUrl: './layout.component.scss'
})
export class LayoutComponent {
  private router = inject(Router);
  showSidebar = signal<boolean>(true);
  sidebarOpen = signal<boolean>(false);

  constructor() {
    // Ocultar sidebar en auth pages
    this.router.events.pipe(
      filter(event => event instanceof NavigationEnd)
    ).subscribe((event) => {
      const navigationEvent = event as NavigationEnd;
      this.showSidebar.set(!navigationEvent.url.includes('/auth/'));
    });
  }

  toggleSidebar(): void {
    this.sidebarOpen.update(v => !v);
  }
}
