import {TestBed} from '@angular/core/testing';
import {of, throwError} from 'rxjs';
import {vi} from 'vitest';
import {TeacherCouponsComponent} from './coupons/teacher-coupons.component';
import {TeacherAffiliatesComponent} from './affiliates/teacher-affiliates.component';
import {CouponService} from '../../core/services/coupon.service';
import {AffiliateService} from '../../core/services/affiliate.service';
import {CourseService} from '../../core/services/course.service';
import {UserPreferencesService} from '../../core/services/user-preferences.service';
import {I18nService} from '../../core/i18n/i18n.service';
import {Coupon} from '../../core/models/sales.model';
import {Affiliate} from '../../core/models/community.model';

const providers = (extra: unknown[]) => [
  {provide: CourseService, useValue: {getCourses: () => of([{id: 3, title: 'Curso original', slug: 'curso', price: 9000, currency: 'usd', isPublished: true}])}},
  {provide: UserPreferencesService, useValue: {preferences: () => ({timeZone: 'America/Argentina/Cordoba'})}},
  ...extra as []
];

describe('cupones y afiliados del docente: idioma', () => {
  it('cupones: conserva borrador, confirmación y error por código sin repetir peticiones al cambiar idioma', () => {
    const coupon = Object.freeze({id: 1, code: 'PRIMAVERA', percentOff: null, amountOff: 1500, currency: 'usd', courseId: null, maxRedemptions: 5, redemptions: 2, expiresAt: '2026-10-23T00:00:00.000Z', active: true}) as Coupon;
    const api = {list: vi.fn(() => of([coupon])), update: vi.fn(() => throwError(() => ({status: 400, error: {error: 'texto libre', code: 'coupon_invalid'}}))), remove: vi.fn(), create: vi.fn()};
    TestBed.configureTestingModule({providers: providers([{provide: CouponService, useValue: api}])});
    const i18n = TestBed.inject(I18nService); i18n.setLocale('es');
    const f = TestBed.createComponent(TeacherCouponsComponent); f.detectChanges(); const c = f.componentInstance;
    expect(f.nativeElement.textContent).toContain('Cupones'); expect(f.nativeElement.textContent).toContain('15,00');
    c.openEdit(coupon); c.form.controls.maxRedemptions.setValue(9); c.askDelete(coupon);
    c.save(); f.detectChanges();
    expect(c.formError()).toBe('Este cupón no es válido.');
    i18n.setLocale('en'); f.detectChanges();
    expect(f.nativeElement.textContent).toContain('Coupons'); expect(f.nativeElement.textContent).toContain('15.00'); expect(f.nativeElement.textContent).toContain('Oct 23, 2026');
    expect(c.formError()).toBe('This coupon is not valid.'); expect(f.nativeElement.textContent).toContain('Delete coupon PRIMAVERA?');
    expect(c.form.controls.maxRedemptions.value).toBe(9); expect(c.toDelete()).toBe(coupon);
    expect(api.list).toHaveBeenCalledTimes(1); expect(api.remove).not.toHaveBeenCalled();
  });

  it('afiliados: conserva pago sin guardar, montos y monedas; no suma ni convierte', () => {
    const affiliate = Object.freeze({id: 7, name: 'Ana ficticia', email: 'ana@example.test', code: 'ANA1', commissionPercent: 20, active: true, notes: null,
      stats: [{currency: 'usd', orders: 1, sales: 9000, commission: 1800, paid: 0, owed: 1800}, {currency: 'eur', orders: 2, sales: 5000, commission: 1000, paid: 500, owed: 500}]}) as Affiliate;
    const api = {list: vi.fn(() => of([affiliate])), orders: vi.fn(() => of([])), payouts: vi.fn(() => of([{id: 9, amount: 500, currency: 'eur', paidAt: '2026-10-23T00:00:00.000Z', note: 'Transferencia'}])), addPayout: vi.fn(), removePayout: vi.fn()};
    TestBed.configureTestingModule({providers: providers([{provide: AffiliateService, useValue: api}])});
    const i18n = TestBed.inject(I18nService); i18n.setLocale('es');
    const f = TestBed.createComponent(TeacherAffiliatesComponent); f.detectChanges(); const c = f.componentInstance;
    expect(f.nativeElement.textContent).toContain('Afiliados'); expect(f.nativeElement.textContent).toMatch(/20\s?%/);
    c.openDetail(affiliate); c.payoutForm.patchValue({amount: 12.5, note: 'Borrador'}); c.askDeletePayout({id: 9, amount: 500, currency: 'eur', paidAt: '2026-10-23T00:00:00.000Z', note: null});
    f.detectChanges();
    i18n.setLocale('en'); f.detectChanges();
    const text = f.nativeElement.textContent as string;
    expect(text).toContain('Affiliates'); expect(text).toMatch(/USD\s90\.00/); expect(text).toContain('EUR');
    expect(text).toContain('Oct 23, 2026'); expect(text).toContain('Owed'); expect(text).toMatch(/Delete payment of EUR\s5\.00/);
    expect(c.payoutForm.getRawValue().amount).toBe(12.5); expect(c.payoutForm.getRawValue().note).toBe('Borrador'); expect(c.payoutToDelete()?.id).toBe(9);
    expect(api.addPayout).not.toHaveBeenCalled(); expect(api.removePayout).not.toHaveBeenCalled(); expect(api.list).toHaveBeenCalledTimes(1);
  });
});
