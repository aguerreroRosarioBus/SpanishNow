import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { BehaviorSubject, of } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { I18N_CATALOGS, I18nService } from '../../core/i18n/i18n.service';
import { ChatFormat } from '../chat/chat-format';
import { CohortInvitationComponent } from './cohort-invitation.component';
import { PACKAGE_MESSAGES } from './packages.i18n';
import { PackagesService } from './packages.service';
import { ClassCohort } from './packages.model';

const cohort = (id: number, extra: Partial<ClassCohort> = {}): ClassCohort => ({
  id, teacherId: 2, templateVersionId: 11, groupSize: 2, acceptedCount: 2, status: 'forming',
  formingDeadlineAt: '2099-01-01T12:00:00Z', tentativeStartsAt: '2099-01-02T12:00:00Z', ...extra });

describe('D-03: detalle de grupo', () => {
  let params: BehaviorSubject<ReturnType<typeof convertToParamMap>>;
  let group: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    localStorage.clear();
    params = new BehaviorSubject(convertToParamMap({ id: '3' }));
    group = vi.fn((id: number) => of(cohort(id, { members: [{ userId: 5, status: 'accepted', name: 'Ana', conversationId: 41 }, { userId: 6, status: 'accepted', name: 'Luis', conversationId: 42 }] })));
    TestBed.configureTestingModule({ providers: [provideRouter([]), { provide: I18N_CATALOGS, multi: true, useValue: PACKAGE_MESSAGES },
      { provide: ActivatedRoute, useValue: { paramMap: params } }, { provide: ChatFormat, useValue: { timeZone: () => 'America/Argentina/Cordoba' } },
      { provide: PackagesService, useValue: { group, respondGroup: vi.fn(), error: () => 'Error' } }] });
    TestBed.inject(I18nService).setLocale('es');
  });
  afterEach(() => { TestBed.resetTestingModule(); localStorage.clear(); });

  it('el docente ve volver, tarjetas, enlace al chat y botón «enviar oferta» por integrante cuando todos aceptaron', () => {
    const f = TestBed.createComponent(CohortInvitationComponent); f.detectChanges();
    const el: HTMLElement = f.nativeElement;
    expect(el.querySelector('h1')!.textContent).toContain('Grupo de clases');
    expect(el.querySelector('.breadcrumb-nav a')!.getAttribute('href')).toBe('/teacher/class-cohorts');
    expect(el.querySelectorAll('.card')).toHaveLength(2);
    expect(Array.from(el.querySelectorAll('a[href^="/messages/"]')).map(a => a.getAttribute('href'))).toEqual(['/messages/41', '/messages/42']);
    const offers = Array.from(el.querySelectorAll('a[href^="/teacher/class-offers/new"]')).map(a => a.getAttribute('href'));
    expect(offers).toEqual(['/teacher/class-offers/new?conversationId=41&cohortId=3', '/teacher/class-offers/new?conversationId=42&cohortId=3']);
  });

  it('no ofrece enviar ofertas mientras falten aceptaciones', () => {
    group.mockImplementation((id: number) => of(cohort(id, { acceptedCount: 1, members: [{ userId: 5, status: 'invited', name: 'Ana', conversationId: 41 }] })));
    const f = TestBed.createComponent(CohortInvitationComponent); f.detectChanges();
    expect(f.nativeElement.querySelector('a[href^="/teacher/class-offers/new"]')).toBeNull();
    expect(f.nativeElement.textContent).toContain('Podrás enviar las ofertas cuando todas las personas hayan aceptado');
  });

  it('D2-08: un grupo listo con clase confirmada muestra ese horario y no espera invitaciones', () => {
    group.mockReturnValue(of(cohort(3, {
      status: 'ready', members: [{ userId: 5, status: 'accepted', name: 'Ana' }],
      confirmedSession: { id: 24, startsAt: '2099-02-03T14:00:00Z' }
    })));
    const f = TestBed.createComponent(CohortInvitationComponent);
    f.detectChanges();
    expect(f.nativeElement.textContent).toContain('Clase confirmada para el');
    expect(f.nativeElement.textContent).not.toContain('falta aceptar el horario');
    expect(f.nativeElement.textContent).not.toContain('Podrás enviar las ofertas');
    expect(f.nativeElement.querySelector('a[href="/schedule?sessionId=24"]')).toBeTruthy();
  });

  it('quien recibe la invitación ve su título, volver a Mensajes y puede aceptar o rechazar', () => {
    group.mockImplementation((id: number) => of(cohort(id, { acceptedCount: 1, invitation: { status: 'invited' } })));
    const f = TestBed.createComponent(CohortInvitationComponent); f.detectChanges();
    const el: HTMLElement = f.nativeElement;
    expect(el.querySelector('h1')!.textContent).toContain('Invitación al grupo');
    expect(el.querySelector('.breadcrumb-nav a')!.getAttribute('href')).toBe('/messages');
    expect(el.textContent).toContain('Aceptar invitación'); expect(el.textContent).toContain('Rechazar invitación');
  });

  it('una fecha tentativa pasada no se presenta como sesión tentativa vigente y avisa si venció el plazo', () => {
    group.mockImplementation((id: number) => of(cohort(id, { tentativeStartsAt: '2026-10-01T12:00:00Z', formingDeadlineAt: '2026-09-25T12:00:00Z', members: [] })));
    const f = TestBed.createComponent(CohortInvitationComponent); f.detectChanges();
    expect(f.nativeElement.textContent).toContain('fecha ya pasada');
    expect(f.nativeElement.textContent).toContain('El plazo para formar el grupo venció');
  });

  it('al cambiar de id sin salir del componente vuelve a cargar y muestra el grupo nuevo', () => {
    const f = TestBed.createComponent(CohortInvitationComponent); f.detectChanges();
    expect(group).toHaveBeenLastCalledWith(3);
    params.next(convertToParamMap({ id: '1' })); f.detectChanges();
    expect(group).toHaveBeenLastCalledWith(1);
    expect(f.componentInstance.cohort()!.id).toBe(1);
  });
});
