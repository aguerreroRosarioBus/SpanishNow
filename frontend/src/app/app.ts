import { Component, inject, signal } from '@angular/core';
import { LayoutComponent } from './shared/components/layout/layout.component';
import { ToastComponent } from './shared/components/toast/toast.component';
import { PwaStatusComponent } from './shared/components/pwa-status/pwa-status.component';
import { PwaService } from './core/services/pwa.service';

@Component({
  selector: 'app-root',
  imports: [LayoutComponent, ToastComponent, PwaStatusComponent],
  templateUrl: './app.html',
  styleUrl: './app.scss'
})
export class App {
  protected readonly title = signal('frontend');

  constructor() {
    inject(PwaService).start();
  }
}
