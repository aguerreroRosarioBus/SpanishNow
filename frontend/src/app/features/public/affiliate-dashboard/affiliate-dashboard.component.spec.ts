import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { of } from 'rxjs';
import { vi } from 'vitest';
import { AffiliateDashboardComponent } from './affiliate-dashboard.component';
import { AffiliateService } from '../../../core/services/affiliate.service';
import { I18nService } from '../../../core/i18n/i18n.service';
import { UserPreferencesService } from '../../../core/services/user-preferences.service';

it('afiliado: conserva importes, moneda, instantáneas, enlaces y fecha calendario al cambiar idioma', () => {
  const data = Object.freeze({
    affiliate: {name: 'José original', code: 'JOSE', commissionPercent: 12.5},
    links: [{courseTitle: 'Historias originales', url: 'https://example.test/c?ref=JOSE'}],
    stats: [{currency: 'USD', orders: 1, sales: 9015, commission: 1127, paid: 1000, owed: 127}],
    orders: [{paidAt: '2026-10-23T02:30:00Z', courseTitle: 'Historias originales', amount: 9015, currency: 'USD', commissionAmount: 1127, commissionStatus: 'pending'}],
    payouts: [{paidAt: '2026-10-22', amount: 1000, currency: 'USD', note: 'Nota humana original'}]
  });
  const dashboard = vi.fn(() => of(data));
  TestBed.configureTestingModule({providers: [
    {provide: ActivatedRoute, useValue: {snapshot: {paramMap: convertToParamMap({token: 'ficticio'})}}},
    {provide: AffiliateService, useValue: {dashboard}},
    {provide: UserPreferencesService, useValue: {preferences: () => ({timeZone: 'America/Argentina/Cordoba'})}}
  ]});
  const i18n = TestBed.inject(I18nService);
  i18n.setLocale('en');
  const f = TestBed.createComponent(AffiliateDashboardComponent); f.detectChanges();
  const el = f.nativeElement as HTMLElement;
  expect(el.textContent).toContain('90.15');
  expect(el.textContent).toContain('Oct 22, 2026');
  i18n.setLocale('es'); f.detectChanges();
  expect(el.textContent).toContain('90,15');
  expect(el.textContent).toContain('USD');
  expect(el.textContent).toContain('22 oct 2026');
  expect(el.textContent).not.toContain('23 oct');
  expect(el.textContent).toContain('Pendiente');
  expect(el.textContent).toContain('Nota humana original');
  expect(el.textContent).toContain('Historias originales');
  expect(f.componentInstance.data()).toBe(data);
  expect(dashboard).toHaveBeenCalledTimes(1);
  expect(f.componentInstance.date(null)).toBe('—');
});
