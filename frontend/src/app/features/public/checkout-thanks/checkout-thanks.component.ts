import { TranslatePipe } from '../../../core/i18n/translate.pipe';
import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

/** Página de agradecimiento de Hotmart: estática, sin datos de la compra. */
@Component({
  selector: 'app-checkout-thanks',
  standalone: true,
  imports: [TranslatePipe, RouterLink],
  templateUrl: './checkout-thanks.component.html',
  styleUrl: './checkout-thanks.component.scss'
})
export class CheckoutThanksComponent {}
