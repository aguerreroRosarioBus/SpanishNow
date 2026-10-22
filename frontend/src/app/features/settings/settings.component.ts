import { Component, effect, inject, signal, untracked } from '@angular/core';
import { AuthService } from '../../core/services/auth.service';
import { IconComponent } from '../../shared/components/icon/icon.component';
import { ChangePasswordModalComponent } from '../../shared/components/change-password-modal/change-password-modal.component';
import { UserPreferencesService } from '../../core/services/user-preferences.service';
import { TranslatePipe } from '../../core/i18n/translate.pipe';

@Component({
  selector: 'app-settings',
  standalone: true,
  imports: [TranslatePipe, IconComponent, ChangePasswordModalComponent],
  templateUrl: './settings.component.html',
  styleUrl: './settings.component.scss'
})
export class SettingsComponent {
  private authService = inject(AuthService);
  currentUser = this.authService.currentUser;
  readonly preferences = inject(UserPreferencesService);
  readonly zoneDraft = signal('');
  readonly zoneConfirmed = signal(false);
  readonly deviceZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  readonly zones = typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf('timeZone') : [];
  private editedZone = false;
  showChangePasswordModal = signal<boolean>(false);

  constructor() {
    effect(() => {
      const zone = this.preferences.preferences()?.timeZone;
      untracked(() => { if (!this.editedZone) this.zoneDraft.set(zone ?? ''); });
    });
  }

  editZone(zone: string): void {
    this.editedZone = true;
    this.zoneDraft.set(zone);
    this.zoneConfirmed.set(false);
  }

  saveZone(event: Event): void {
    event.preventDefault();
    if (!this.zoneConfirmed() || !this.zoneDraft().trim() || this.preferences.saving()) return;
    this.preferences.saveTimeZone(this.zoneDraft().trim());
  }

  openChangePasswordModal(): void {
    this.showChangePasswordModal.set(true);
  }

  closeChangePasswordModal(): void {
    this.showChangePasswordModal.set(false);
  }
}
