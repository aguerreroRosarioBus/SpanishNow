import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AuthService } from '../../core/services/auth.service';
import { ChangePasswordModalComponent } from '../../shared/components/change-password-modal/change-password-modal.component';

@Component({
  selector: 'app-settings',
  standalone: true,
  imports: [CommonModule, ChangePasswordModalComponent],
  templateUrl: './settings.component.html',
  styleUrl: './settings.component.scss'
})
export class SettingsComponent {
  private authService = inject(AuthService);
  currentUser = this.authService.currentUser;
  showChangePasswordModal = signal<boolean>(false);

  openChangePasswordModal(): void {
    this.showChangePasswordModal.set(true);
  }

  closeChangePasswordModal(): void {
    this.showChangePasswordModal.set(false);
  }
}
