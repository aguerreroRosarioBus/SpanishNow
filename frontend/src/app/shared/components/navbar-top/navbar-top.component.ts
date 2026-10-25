import { ScreenTutorialComponent } from '../screen-tutorial/screen-tutorial.component';
import { LanguageSelectorComponent } from '../language-selector/language-selector.component';
import { TranslatePipe } from '../../../core/i18n/translate.pipe';
import { Component, inject, input, output, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { PwaService } from '../../../core/services/pwa.service';
import { NgbDropdown, NgbDropdownToggle, NgbDropdownMenu, NgbDropdownItem } from '@ng-bootstrap/ng-bootstrap';
import { AuthService } from '../../../core/services/auth.service';
import { IconComponent } from '../icon/icon.component';

@Component({
  selector: 'app-navbar-top',
  standalone: true,
  imports: [ScreenTutorialComponent, LanguageSelectorComponent, TranslatePipe, RouterLink, NgbDropdown, NgbDropdownToggle, NgbDropdownMenu, NgbDropdownItem, IconComponent],
  templateUrl: './navbar-top.component.html',
  styleUrl: './navbar-top.component.scss'
})
export class NavbarTopComponent {
  private authService = inject(AuthService);
  private router = inject(Router);

  pwa = inject(PwaService);
  currentUser = this.authService.currentUser;
  showIosHelp = signal(false);

  /** false en login/registro: el header no muestra datos de usuario */
  showUser = input(true);
  menuOpen = input(false);
  sidebarToggle = output<void>();

  toggleSidebar(): void {
    this.sidebarToggle.emit();
  }

  install(): void { void this.pwa.install(); }

  logout(): void {
    this.authService.logout();
    this.router.navigate(['/auth/login']);
  }
}
