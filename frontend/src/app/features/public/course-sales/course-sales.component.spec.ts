import { TestBed } from '@angular/core/testing';
import { provideRouter, ActivatedRoute, convertToParamMap } from '@angular/router';
import { of, throwError } from 'rxjs';
import { vi } from 'vitest';
import { CourseSalesComponent } from './course-sales.component';
import { PublicCatalogService } from '../../../core/services/public-catalog.service';
import { AffiliateService } from '../../../core/services/affiliate.service';
import { EnrollmentService } from '../../../core/services/enrollment.service';
import { AuthService } from '../../../core/services/auth.service';
import { PublicCourseDetail } from '../../../core/models/sales.model';
import { I18N_CATALOGS, I18nService } from '../../../core/i18n/i18n.service';
import { LEGAL_SALES_MESSAGES } from '../../legal/legal-messages';
import { CommercialSnapshot, EXPECTATION_FIELDS, Expectations } from '../../legal/legal.model';

function course(provider: 'hotmart' | 'site'): PublicCourseDetail {
  return { id: 7, slug: 'c', title: 'Course', level: 'A1', price: 5000, currency: 'usd', units: [], checkoutProvider: provider };
}

function setup(provider: 'hotmart' | 'site', query: Record<string, string> = {}, commercial?: CommercialSnapshot) {
  const catalog = {
    getCourse: vi.fn(() => of({ ...course(provider), ...(commercial ? { commercial } : {}) })),
    quote: vi.fn(() => throwError(() => ({ status: 400, error: { code: 'coupon_not_applicable', error: 'Discounts for this course are applied at the Hotmart checkout' } }))),
    checkout: vi.fn(() => of({ url: 'https://pay.hotmart.com/X' }))
  };
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      { provide: ActivatedRoute, useValue: { snapshot: { paramMap: convertToParamMap({ slug: 'c' }), queryParamMap: convertToParamMap(query) } } },
      { provide: PublicCatalogService, useValue: catalog },
      { provide: AffiliateService, useValue: { validateCode: vi.fn(() => of({ valid: false })) } },
      { provide: EnrollmentService, useValue: { getMyCourses: vi.fn(() => of([])) } },
      { provide: AuthService, useValue: { currentUser: () => null, isAuthenticated: () => false, isStudent: () => false } },
      { provide: I18N_CATALOGS, multi: true, useValue: LEGAL_SALES_MESSAGES }
    ]
  });
  TestBed.inject(I18nService).setLocale('en');
  const fixture = TestBed.createComponent(CourseSalesComponent);
  fixture.detectChanges();
  return { fixture, catalog, el: fixture.nativeElement as HTMLElement };
}

describe('CourseSalesComponent', () => {
  it('Hotmart: muestra "Secure checkout by Hotmart", sin cupón ni email', () => {
    const { el } = setup('hotmart');
    expect(el.textContent).toContain('Secure checkout by Hotmart');
    expect(el.textContent).not.toContain('Have a coupon?');
    expect(el.querySelector('#buyerEmail')).toBeNull();
  });

  it('sitio: conserva el cupón y el texto de siempre', () => {
    const { el } = setup('site');
    expect(el.textContent).toContain('Have a coupon?');
    expect(el.textContent).not.toContain('Hotmart');
  });

  it('Hotmart: Buy now llama al checkout sin email', () => {
    const { fixture, catalog } = setup('hotmart');
    vi.spyOn(fixture.componentInstance as any, 'redirect').mockImplementation(() => {});
    fixture.componentInstance.buy();
    expect(catalog.checkout).toHaveBeenCalledWith(7, undefined, null, null, null);
  });

  it('Hotmart: ?coupon= se aplica solo; un cupón parcial rechazado muestra el mensaje sin formulario', () => {
    const { fixture, catalog, el } = setup('hotmart', { coupon: 'half' });
    fixture.detectChanges();
    expect(catalog.quote).toHaveBeenCalledWith(7, 'HALF', null);
    expect(el.textContent).toContain('applied at the Hotmart checkout');
    TestBed.inject(I18nService).setLocale('es');
    fixture.detectChanges();
    expect(el.textContent).toContain('se aplican en el checkout de Hotmart');
    expect(catalog.quote).toHaveBeenCalledTimes(1);
    expect(el.querySelector('#couponCode')).toBeNull();
  });

  it('Hotmart: con cupón del 100 % y sin sesión pide el email', () => {
    const { fixture, catalog, el } = setup('hotmart');
    catalog.quote.mockReturnValue(of({ originalAmount: 5000, discountAmount: 5000, amount: 0, currency: 'usd', coupon: { code: 'FREE', percentOff: 100, amountOff: null } }) as any);
    fixture.componentInstance.couponInput.set('free');
    fixture.componentInstance.applyCoupon();
    fixture.detectChanges();
    expect(fixture.componentInstance.needsEmail()).toBe(true);
    expect(el.querySelector('#buyerEmail')).not.toBeNull();
  });
});

describe('CourseSalesComponent · W02 instantánea y aceptación', () => {
  const text = (l: 'en' | 'es') => Object.fromEntries(EXPECTATION_FIELDS.map(f => [f, `${l} ${f}`])) as Expectations['en'];
  const doc = (documentKey: 'terms' | 'privacy' | 'refunds', version: string) => ({
    documentKey, version, effectiveAt: '2026-01-01T00:00:00.000Z',
    content: { en: { title: `EN ${documentKey}`, body: 'x' }, es: { title: `ES ${documentKey}`, body: 'x' } },
    business: { responsibleName: 'R', address: 'A', contactEmail: 'c@x.invalid', privacyEmail: 'p@x.invalid', commercialRetention: 'C' }
  });
  const commercial = (hash = 'h1'): CommercialSnapshot => ({
    courseId: 7, title: 'Course', teacherId: 1, price: 5000, currency: 'usd', version: 2, expectations: { en: text('en'), es: text('es') },
    legalDocuments: [doc('terms', '4'), doc('privacy', '2'), doc('refunds', '1')], hash
  });

  it('muestra expectativas en el idioma activo y la casilla sin marcar', () => {
    const { fixture, el } = setup('site', {}, commercial());
    TestBed.inject(I18nService).setLocale('es');
    fixture.detectChanges();
    expect(el.textContent).toContain('es audience');
    expect(el.textContent).toContain('El acceso vitalicio al contenido del curso no incluye clases en vivo');
    expect(el.querySelector<HTMLInputElement>('.legal-consent input')!.checked).toBe(false);
  });

  it('sin aceptar no llama al checkout; aceptando envía hash, idioma y versiones contractuales', () => {
    const { fixture, catalog, el } = setup('hotmart', {}, commercial());
    TestBed.inject(I18nService).setLocale('en');
    vi.spyOn(fixture.componentInstance as any, 'redirect').mockImplementation(() => {});
    fixture.componentInstance.buy();
    fixture.detectChanges();
    expect(catalog.checkout).not.toHaveBeenCalled();
    expect(el.textContent).toContain('Check the box');
    fixture.componentInstance.legalAccepted.set(true);
    TestBed.inject(I18nService).setLocale('es');
    fixture.detectChanges();
    expect(fixture.componentInstance.legalAccepted()).toBe(true);
    expect(fixture.componentInstance.commercial()?.hash).toBe('h1');
    TestBed.inject(I18nService).setLocale('en');
    fixture.componentInstance.buy();
    expect(catalog.checkout).toHaveBeenCalledWith(7, undefined, null, null, {
      locale: 'en', commercialHash: 'h1',
      legalConsent: { accepted: true, documents: [{ documentKey: 'terms', documentVersion: '4' }, { documentKey: 'refunds', documentVersion: '1' }] }
    });
  });

  it('si cambió la instantánea, muestra el aviso, recarga y pide aceptar de nuevo (no lo confunde con "ya inscripto")', () => {
    const { fixture, catalog, el } = setup('site', {}, commercial());
    TestBed.inject(I18nService).setLocale('en');
    catalog.checkout.mockReturnValue(throwError(() => ({ status: 409, error: { code: 'sales_snapshot_changed' } })) as any);
    catalog.getCourse.mockReturnValue(of({ ...course('site'), commercial: commercial('h2') }) as any);
    fixture.componentInstance.legalAccepted.set(true);
    fixture.componentInstance.buy();
    fixture.detectChanges();
    expect(fixture.componentInstance.alreadyEnrolled()).toBe(false);
    expect(el.textContent).toContain('The conditions of this course changed');
    expect(fixture.componentInstance.legalAccepted()).toBe(false);
    expect(fixture.componentInstance.commercial()?.hash).toBe('h2');
  });
});


describe('CourseSalesComponent · W01 conserva borradores y errores', () => {
  it('cambia precio, plural y error sin perder cupón ni correo y sin comprar', () => {
    const { fixture, catalog, el } = setup('site');
    const c = fixture.componentInstance;
    c.buyerEmail.set('persona@example.test');
    c.couponInput.set('BORRADOR');
    c.showCoupon.set(true);
    catalog.quote.mockReturnValue(throwError(() => ({status: 400, error: {code: 'coupon_expired', error: 'INTERNAL_SECRET'}})));
    c.applyCoupon();
    expect(c.couponError()).toBe('This coupon has expired.');
    const original = c.course();
    TestBed.inject(I18nService).setLocale('es');
    fixture.detectChanges();
    expect(c.couponError()).toBe('Este cupón venció.');
    expect(el.textContent).toContain('0 unidades');
    expect(el.textContent).not.toContain('INTERNAL_SECRET');
    expect(c.priceLabel()).toContain('50,00');
    expect(c.priceLabel()).toContain('USD');
    expect(c.course()).toBe(original);
    expect(c.buyerEmail()).toBe('persona@example.test');
    expect(c.couponInput()).toBe('BORRADOR');
    expect(catalog.quote).toHaveBeenCalledTimes(1);
    expect(catalog.checkout).not.toHaveBeenCalled();
  });
});
