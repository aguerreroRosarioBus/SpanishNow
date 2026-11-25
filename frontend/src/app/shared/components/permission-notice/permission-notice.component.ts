import { Component } from '@angular/core';
import { TranslatePipe } from '../../../core/i18n/translate.pipe';

/** Aviso único cuando una pantalla recibe 403 por falta de permiso (D-01, D-02): evita la pantalla vacía. */
@Component({
  selector: 'app-permission-notice',
  standalone: true,
  imports: [TranslatePipe],
  template: `<p class="alert alert-warning" role="alert" data-testid="permission-notice">{{ 'access.denied' | t }}</p>`
})
export class PermissionNoticeComponent {}
