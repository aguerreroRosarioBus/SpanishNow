import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Router } from '@angular/router';
import { AuthService } from './auth.service';
import { User } from '../models/user.model';

const admin: User = { id: 1, name: 'Admin', email: 'a@x.com', role: 'teacher', permissions: ['test_users.manage'] };
const testStudent: User = { id: 9, name: 'Prueba', email: 'p@spanishnow.test', role: 'student', isTestAccount: true, permissions: [] };

describe('AuthService admin', () => {
  let http: HttpTestingController;
  let navigate: ReturnType<typeof vi.fn>;

  function setup(): AuthService {
    localStorage.setItem('token', 'admin-token');
    localStorage.setItem('user', JSON.stringify(admin));
    navigate = vi.fn().mockResolvedValue(true);
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), { provide: Router, useValue: { navigate } }]
    });
    http = TestBed.inject(HttpTestingController);
    return TestBed.inject(AuthService);
  }

  afterEach(() => localStorage.clear());

  it('evalúa permisos', () => {
    const auth = setup();
    expect(auth.isAdmin()).toBe(true);
    expect(auth.hasPermission('test_users.manage')).toBe(true);
    expect(auth.hasPermission('users.manage')).toBe(false);
  });

  it('entra como una cuenta de prueba y vuelve a la sesión del admin', () => {
    const auth = setup();
    auth.impersonate(9).subscribe();
    http.expectOne(r => r.url.endsWith('/admin/users/9/impersonate')).flush({ user: testStudent, token: 'test-token' });

    expect(auth.impersonating()).toBe(true);
    expect(auth.getToken()).toBe('test-token');
    expect(auth.currentUser()?.id).toBe(9);
    expect(JSON.parse(localStorage.getItem('adminSession')!)).toEqual({ token: 'admin-token', user: admin });
    expect(navigate).toHaveBeenCalledWith(['/student/dashboard']);

    auth.stopImpersonating();
    http.expectOne(r => r.url.endsWith('/auth/me')).flush({ user: admin });
    expect(auth.impersonating()).toBe(false);
    expect(auth.getToken()).toBe('admin-token');
    expect(auth.currentUser()?.id).toBe(1);
    expect(localStorage.getItem('adminSession')).toBeNull();
    expect(navigate).toHaveBeenCalledWith(['/admin/users']);
  });

  it('logout durante la suplantación borra adminSession', () => {
    const auth = setup();
    auth.impersonate(9).subscribe();
    http.expectOne(r => r.url.endsWith('/impersonate')).flush({ user: testStudent, token: 't' });
    auth.logout();
    expect(localStorage.getItem('adminSession')).toBeNull();
    expect(auth.impersonating()).toBe(false);
  });

  it('refreshMe cierra la sesión con 401', () => {
    const auth = setup();
    auth.refreshMe();
    http.expectOne(r => r.url.endsWith('/auth/me')).flush({}, { status: 401, statusText: 'Unauthorized' });
    expect(auth.currentUser()).toBeNull();
    expect(auth.getToken()).toBeNull();
  });
});
