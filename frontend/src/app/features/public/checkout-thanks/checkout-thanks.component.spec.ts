import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { I18nService } from '../../../core/i18n/i18n.service';
import { CheckoutThanksComponent } from './checkout-thanks.component';

describe('C-05: /checkout/thanks no afirma un pago que no conoce', () => {
  beforeEach(() => { localStorage.clear(); TestBed.configureTestingModule({ providers: [provideRouter([])] }); });
  afterEach(() => { TestBed.resetTestingModule(); localStorage.clear(); });

  for (const [locale, titulo, condicional] of [['es', 'Gracias', 'Si completaste la compra'], ['en', 'Thank you', 'If your purchase went through']] as const) {
    it(`muestra «${titulo}» y un aviso condicional (${locale})`, () => {
      TestBed.inject(I18nService).setLocale(locale);
      const fixture = TestBed.createComponent(CheckoutThanksComponent);
      fixture.detectChanges();
      const texto: string = fixture.nativeElement.textContent;
      expect(fixture.nativeElement.querySelector('h1').textContent).toContain(titulo);
      expect(texto).toContain(condicional);
      expect(texto).not.toMatch(/Pago recibido|Payment received/);
    });
  }
});
