import { NgbOffcanvasConfig } from '@ng-bootstrap/ng-bootstrap';
import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { vi } from 'vitest';
import { AdminUsersComponent } from './admin-users.component';
import { AdminService } from '../../../core/services/admin.service';
import { AuthService } from '../../../core/services/auth.service';
import { CourseService } from '../../../core/services/course.service';
import { ToastService } from '../../../core/services/toast.service';
import { UserPreferencesService } from '../../../core/services/user-preferences.service';
import { I18nService } from '../../../core/i18n/i18n.service';
import { AdminUser } from '../../../core/models/admin.model';

function setup(fail = false) {
  const user = {id: 2, name: 'Nombre original', email: 'ficticio@example.test', role: 'student', permissions: [], isTestAccount: true, fixedAdmin: false, suspendedAt: null, createdAt: '2026-10-23T02:30:00Z', coursesCount: 0, enrollmentsCount: 2} as AdminUser;
  const service = {users: vi.fn(() => fail ? throwError(() => ({error: {code: 'unknown', error: 'PRIVATE_INTERNAL'}})) : of({users: [user], total: 1})), permissions: () => of([{key: 'users.manage', label: 'Gestionar usuarios y permisos', description: 'Original'}]), updateUser: vi.fn(), deleteTestUser: vi.fn(), deleteAllTestUsers: vi.fn(), createTestUsers: vi.fn()};
  TestBed.configureTestingModule({providers: [
    {provide: AdminService, useValue: service},
    {provide: AuthService, useValue: {currentUser: () => ({id: 1, role: 'teacher'}), hasPermission: () => true}},
    {provide: CourseService, useValue: {getCourses: () => of([])}},
    {provide: ToastService, useValue: {success: vi.fn(), error: vi.fn(), warning: vi.fn()}},
    {provide: UserPreferencesService, useValue: {preferences: () => ({timeZone: 'America/Argentina/Cordoba'})}}
  ]});
  TestBed.inject(NgbOffcanvasConfig).animation = false;
  const i18n = TestBed.inject(I18nService); i18n.setLocale('es');
  const f = TestBed.createComponent(AdminUsersComponent); f.detectChanges();
  return {f, i18n, user, service, el: f.nativeElement as HTMLElement};
}

it('admin: cambia idioma con confirmación abierta sin ejecutarla ni perder filtros/borrador', () => {
  const {f, i18n, user, service, el} = setup(); const c = f.componentInstance;
  c.testName.set('Borrador original'); c.search.set('Nombre'); c.roleFilter.set('student');
  c.askSuspend(user); f.detectChanges(); const pending = c.pending();
  expect(el.textContent).toContain('no podrá iniciar sesión');
  expect(el.textContent).toContain('22 oct 2026');
  i18n.setLocale('en'); f.detectChanges();
  expect(el.textContent).toContain('will not be able to sign in');
  expect(el.textContent).toContain('Oct 22, 2026');
  expect(el.textContent).toContain('No additional permissions');
  expect(el.querySelector<HTMLInputElement>('#testName')!.value).toBe('Borrador original');
  expect(c.search()).toBe('Nombre'); expect(c.roleFilter()).toBe('student');
  expect(c.pending()).toBe(pending); expect(c.users()[0]).toBe(user);
  expect(service.updateUser).not.toHaveBeenCalled(); expect(service.users).toHaveBeenCalledTimes(1);
  c.askDelete(user); i18n.setLocale('es'); f.detectChanges();
  expect(el.textContent).toContain('Se borrará ficticio@example.test');
  expect(service.deleteTestUser).not.toHaveBeenCalled();
  c.askDeleteAll(); i18n.setLocale('en'); f.detectChanges();
  expect(el.textContent).toContain('All test accounts and their data will be deleted');
  expect(service.deleteAllTestUsers).not.toHaveBeenCalled();
});
it('admin: traduce error cargado sin repetir request y oculta texto arbitrario', () => {
  const {f, i18n, service, el} = setup(true);
  expect(el.textContent).toContain('No se pudieron cargar los usuarios.');
  i18n.setLocale('en'); f.detectChanges();
  expect(el.textContent).toContain('Could not load users.'); expect(el.textContent).not.toContain('PRIVATE_INTERNAL');
  expect(service.users).toHaveBeenCalledTimes(1);
});

it('admin: el directorio abre un panel con permisos y conserva las protecciones de cuenta', async () => {
  const {f, user, service, el, i18n} = setup();
  expect(el.querySelector('.permissions')).toBeNull();
  el.querySelector<HTMLButtonElement>('.manage-button')!.click(); f.detectChanges();
  await f.whenStable();
  expect(document.querySelector('.offcanvas-title')?.textContent).toContain(user.name);
  const check = document.querySelector<HTMLInputElement>('.permission input')!;
  expect(check.disabled).toBe(true);
  i18n.setLocale('en'); f.detectChanges();
  expect(document.querySelector('.offcanvas-body')?.textContent).toContain('Manage users and permissions');
  expect(service.updateUser).not.toHaveBeenCalled();
  document.querySelector<HTMLButtonElement>('.offcanvas-header .btn-close')!.click();
  await f.whenStable();
  f.destroy();
});
