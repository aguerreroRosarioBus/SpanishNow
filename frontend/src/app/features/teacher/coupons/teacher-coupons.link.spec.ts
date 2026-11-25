import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TeacherCouponsComponent } from './teacher-coupons.component';
import { CouponService } from '../../../core/services/coupon.service';
import { CourseService } from '../../../core/services/course.service';
import { UserPreferencesService } from '../../../core/services/user-preferences.service';
import { I18nService } from '../../../core/i18n/i18n.service';
import { Coupon } from '../../../core/models/sales.model';

const coupon = (over: Partial<Coupon>): Coupon => ({ id: 1, code: 'TODOS', percentOff: 10, amountOff: null, currency: null, courseId: null, maxRedemptions: null, redemptions: 0, expiresAt: null, active: true, ...over } as Coupon);

describe('D-07: cupones sin selector incrustado y con un solo estado', () => {
  const setup = (coupons: Coupon[]) => {
    TestBed.configureTestingModule({ providers: [
      { provide: CouponService, useValue: { list: () => of(coupons) } },
      { provide: CourseService, useValue: { getCourses: () => of([{ id: 3, title: 'Curso original', slug: 'curso', price: 9000, currency: 'usd', isPublished: true }]) } },
      { provide: UserPreferencesService, useValue: { preferences: () => ({ timeZone: 'UTC' }) } }] });
    TestBed.inject(I18nService).setLocale('es');
    const f = TestBed.createComponent(TeacherCouponsComponent); f.detectChanges(); return f;
  };
  beforeEach(() => localStorage.clear());

  it('ninguna fila lleva un <select> incrustado: todas tienen la misma estructura', () => {
    const f = setup([coupon({ id: 1 }), coupon({ id: 2, code: 'CURSO', courseId: 3 })]);
    expect(f.nativeElement.querySelector('tbody select')).toBeNull();
  });

  it('el botón de enlace de un cupón de todos los cursos abre un diálogo para elegir el curso y copiar', () => {
    const f = setup([coupon({ id: 1 })]);
    (f.nativeElement.querySelector('[data-testid="coupon-link"]') as HTMLButtonElement).click(); f.detectChanges();
    const dialog = f.nativeElement.querySelector('[data-testid="coupon-link-dialog"]') as HTMLElement;
    expect(dialog.textContent).toContain('Link de venta del cupón TODOS');
    const copy = dialog.querySelector('[data-testid="coupon-link-copy"]') as HTMLButtonElement;
    expect(copy.disabled).toBe(true);
    const select = dialog.querySelector('select') as HTMLSelectElement;
    select.value = '3'; select.dispatchEvent(new Event('change')); f.detectChanges();
    expect((dialog.querySelector('#couponLinkUrl') as HTMLInputElement).value).toContain('/courses/curso?coupon=TODOS');
    expect(copy.disabled).toBe(false);
  });

  it('un cupón con curso fijo copia el link directo sin abrir el diálogo', () => {
    const f = setup([coupon({ id: 2, code: 'CURSO', courseId: 3 })]);
    const copy = vi.spyOn(f.componentInstance, 'copyLink').mockResolvedValue();
    (f.nativeElement.querySelector('[data-testid="coupon-link"]') as HTMLButtonElement).click(); f.detectChanges();
    expect(copy).toHaveBeenCalledTimes(1);
    expect(f.nativeElement.querySelector('[data-testid="coupon-link-dialog"]')).toBeNull();
  });

  it('un cupón vencido e inactivo muestra solo «Vencido»', () => {
    const f = setup([coupon({ id: 3, active: false, expiresAt: '2020-01-01T00:00:00.000Z' })]);
    const row = f.nativeElement.querySelector('tbody tr') as HTMLElement;
    expect(row.querySelector('[data-testid="coupon-status"]')?.textContent?.trim()).toBe('Vencido');
    expect(row.textContent).not.toContain('Inactivo');
    expect((row.textContent!.match(/Vencido/g) ?? []).length).toBe(1);
  });
});
