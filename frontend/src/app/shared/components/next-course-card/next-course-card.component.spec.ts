import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { beforeEach, describe, expect, it } from 'vitest';
import { NextCourseCardComponent } from './next-course-card.component';
import { NextCourseOffer } from '../../../core/models/sales.model';

const offer = (alreadyEnrolled: boolean): NextCourseOffer => ({ course: { id: 7, slug: 'viajar', title: 'Viajar con confianza', price: 0, currency: 'USD' }, couponCode: null, alreadyEnrolled });

describe('A-05: tarjeta del curso siguiente', () => {
  beforeEach(() => { localStorage.clear(); localStorage.setItem('spanishnow.locale', 'es'); TestBed.configureTestingModule({ providers: [provideRouter([])] }); });
  const render = (value: NextCourseOffer) => {
    const f = TestBed.createComponent(NextCourseCardComponent);
    f.componentRef.setInput('offer', value);
    f.detectChanges();
    return f.nativeElement as HTMLElement;
  };

  it('curso ya inscrito: «Siguiente curso de la serie», sin aviso redundante y enlace directo al reproductor', () => {
    const el = render(offer(true));
    expect(el.querySelector('strong')?.textContent).toBe('Siguiente curso de la serie: Viajar con confianza');
    expect(el.textContent).not.toContain('Ya estás inscrito');
    expect(el.querySelector('a')?.getAttribute('href')).toBe('/student/course/7/play');
  });

  it('curso aún no comprado: mantiene la invitación y el enlace a la página del curso', () => {
    const el = render(offer(false));
    expect(el.querySelector('strong')?.textContent).toBe('Sigue con Viajar con confianza');
    expect(el.querySelector('a')?.getAttribute('href')).toBe('/courses/viajar');
  });
});
