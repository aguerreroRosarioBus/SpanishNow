import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { AffiliateService } from '../../../core/services/affiliate.service';
import { CourseService } from '../../../core/services/course.service';
import { UserPreferencesService } from '../../../core/services/user-preferences.service';
import { I18nService } from '../../../core/i18n/i18n.service';
import { TeacherAffiliatesComponent } from './teacher-affiliates.component';

it('D2-09: reúne detalle, enlaces y edición en un menú accesible por fila', () => {
  const affiliate = { id: 1, name: 'Persona ficticia', email: 'afiliada@example.test', code: 'W17',
    commissionPercent: 20, active: true, notes: null, stats: [] };
  TestBed.configureTestingModule({ providers: [
    { provide: AffiliateService, useValue: { list: () => of([affiliate]) } },
    { provide: CourseService, useValue: { getCourses: () => of([]) } },
    { provide: UserPreferencesService, useValue: { preferences: () => null } }
  ] });
  TestBed.inject(I18nService).setLocale('es');
  const f = TestBed.createComponent(TeacherAffiliatesComponent);
  const openLinks = vi.spyOn(f.componentInstance, 'openLinks');
  f.detectChanges();
  const actions: HTMLElement = f.nativeElement.querySelector('.affiliate-list .actions');
  const trigger = actions.querySelector<HTMLButtonElement>('button.btn-icon')!;
  expect(trigger.getAttribute('aria-label')).toBe('Más acciones de Persona ficticia');
  trigger.click();
  f.detectChanges();
  const menu = Array.from(document.querySelectorAll<HTMLButtonElement>('[role="menuitem"]'));
  expect(menu.map(item => item.textContent?.trim())).toEqual(expect.arrayContaining(['Detalle', 'Links', 'Editar']));
  menu.find(item => item.textContent?.trim() === 'Links')!.click();
  expect(openLinks).toHaveBeenCalledWith(affiliate);
  f.destroy();
});
