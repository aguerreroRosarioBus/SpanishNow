import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { signal } from '@angular/core';
import { of } from 'rxjs';
import { PurchasesComponent } from './purchases.component';
import { SalesService } from '../../../core/services/sales.service';
import { UserPreferencesService } from '../../../core/services/user-preferences.service';
import { PackagesService } from '../../packages/packages.service';
import { PACKAGE_MESSAGES } from '../../packages/packages.i18n';
import { I18N_CATALOGS, I18nService, LOCALE_STORAGE_KEY } from '../../../core/i18n/i18n.service';

describe('W01: compras en ambos idiomas', () => {
  afterEach(() => localStorage.removeItem(LOCALE_STORAGE_KEY));

  it('conserva importe, moneda, título y día en zona elegida al traducir', () => {
    const commercial = Object.freeze({ price: 9015, currency: 'USD', expectations: null, legalDocuments: [
      { documentKey: 'terms', version: 'v1', content: { en: { title: 'Original terms' }, es: { title: 'Condiciones originales' } } }
    ] });
    const order = Object.freeze({ id: 1, paidAt: '2026-10-23T02:30:00.000Z', course: { title: 'Historias de María', slug: 'historias' }, amount: 9015, currency: 'USD', status: 'paid', refundedAmount: 1500, receiptUrl: null, commercial });
    TestBed.configureTestingModule({ providers: [provideRouter([]),
      { provide: SalesService, useValue: { myOrders: () => of([order]) } },
      { provide: UserPreferencesService, useValue: { preferences: signal({ timeZone: 'America/Argentina/Cordoba' }) } }
    ] });
    const i18n = TestBed.inject(I18nService);
    i18n.setLocale('es');
    const fixture = TestBed.createComponent(PurchasesComponent);
    fixture.detectChanges();
    const row = fixture.nativeElement.querySelector('tbody tr');
    expect(row.textContent).toContain('90,15');
    expect(row.textContent).toContain('22 oct');
    expect(row.textContent).toContain('Reembolso parcial');
    expect(row.textContent).toContain('Condiciones originales');
    i18n.setLocale('en'); fixture.detectChanges();
    expect(row.textContent).toContain('90.15');
    expect(row.textContent).toContain('Oct 22');
    expect(row.textContent).toContain('Partially refunded');
    expect(row.textContent).toContain('Historias de María');
    expect(row.textContent).toContain('USD');
    expect(row.textContent).toContain('Original terms');
    expect(row.querySelector('a[href="/legal/terms?version=v1"]')).toBeTruthy();
    expect(fixture.componentInstance.orders()[0].commercial).toBe(commercial);
    expect(row.isConnected).toBe(true);
    expect(fixture.componentInstance.orders()[0]).toBe(order);
  });
});

describe('W20: «Mis compras» incluye los paquetes de clases (D3-DIN-08)', () => {
  it('lista el paquete con importe pagado y devuelto, su estado y el enlace; sin cursos tampoco muestra «sin compras»', () => {
    const pack = { id: 31, offerId: 5, paidAt: '2026-11-25T21:00:00.000Z', status: 'cancelled', paid: { amount: 5000, currency: 'USD' },
      refund: { status: 'confirmed', amount: 5000, currency: 'USD', refundedAmount: 5000 }, snapshot: { nameEs: 'Cuatro clases', nameEn: 'Four classes' } };
    TestBed.configureTestingModule({ providers: [provideRouter([]),
      { provide: SalesService, useValue: { myOrders: () => of([]) } },
      { provide: I18N_CATALOGS, multi: true, useValue: PACKAGE_MESSAGES },
      { provide: PackagesService, useValue: { purchases: () => of([pack]) } },
      { provide: UserPreferencesService, useValue: { preferences: signal({ timeZone: 'America/Argentina/Cordoba' }) } }
    ] });
    TestBed.inject(I18nService).setLocale('es');
    const fixture = TestBed.createComponent(PurchasesComponent);
    fixture.detectChanges();
    const text = (fixture.nativeElement.textContent as string).replace(/\u00a0/g, ' ');
    expect(text).toContain('Paquetes de clases');
    expect(text).toContain('Cuatro clases');
    expect(text).toContain('USD 50,00');
    expect(text).toContain('Reembolsado: USD 50,00');
    expect(text).toContain('Reembolsado');
    expect(text).not.toContain('Todavía no tienes compras');
    expect(fixture.nativeElement.querySelector('a[href="/class-packages/31"]')).toBeTruthy();
  });
});
