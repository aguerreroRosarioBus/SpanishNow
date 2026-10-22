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

function course(provider: 'hotmart' | 'site'): PublicCourseDetail {
  return { id: 7, slug: 'c', title: 'Course', level: 'A1', price: 5000, currency: 'usd', units: [], checkoutProvider: provider };
}

function setup(provider: 'hotmart' | 'site', query: Record<string, string> = {}) {
  const catalog = {
    getCourse: vi.fn(() => of(course(provider))),
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
      { provide: AuthService, useValue: { currentUser: () => null, isAuthenticated: () => false, isStudent: () => false } }
    ]
  });
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
    expect(catalog.checkout).toHaveBeenCalledWith(7, undefined, null, null);
  });

  it('Hotmart: ?coupon= se aplica solo; un cupón parcial rechazado muestra el mensaje sin formulario', () => {
    const { fixture, catalog, el } = setup('hotmart', { coupon: 'half' });
    fixture.detectChanges();
    expect(catalog.quote).toHaveBeenCalledWith(7, 'HALF', null);
    expect(el.textContent).toContain('applied at the Hotmart checkout');
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
