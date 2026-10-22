import { Component, inject, signal } from '@angular/core';
import { LayoutComponent } from './shared/components/layout/layout.component';
import { ToastComponent } from './shared/components/toast/toast.component';
import { PwaStatusComponent } from './shared/components/pwa-status/pwa-status.component';
import { AuthService } from './core/services/auth.service';
import { PwaService } from './core/services/pwa.service';
import { I18nService } from './core/i18n/i18n.service';
import { UserPreferencesService } from './core/services/user-preferences.service';

@Component({
  selector: 'app-root',
  imports: [LayoutComponent, ToastComponent, PwaStatusComponent],
  templateUrl: './app.html',
  styleUrl: './app.scss'
})
export class App {
  protected readonly title = signal('frontend');

  constructor() {
    inject(I18nService);
    inject(UserPreferencesService);
    inject(PwaService).start();
    // Refresca permisos y datos del usuario con la sesión guardada
    inject(AuthService).refreshMe();
  }
}
