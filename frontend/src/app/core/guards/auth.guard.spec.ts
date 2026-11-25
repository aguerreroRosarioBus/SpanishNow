import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { of } from 'rxjs';
import { AuthService } from '../services/auth.service';
import { adminGuard, homeRedirect } from './auth.guard';

@Component({ template: '' })
class Destination {}

describe('C2-02: navegación con sesión', () => {
  it('redirige la raíz y el acceso denegado según el rol sin descartar la sesión', async () => {
    const user = signal<{ role: string; permissions?: string[] } | null>(null);
    const auth = {
      currentUser: user,
      isAuthenticated: () => !!user(),
      isTeacher: () => user()?.role === 'teacher',
      hasPermission: (permission: string) => user()?.permissions?.includes(permission) ?? false,
      loadMe: vi.fn(() => of(null)),
      logout: vi.fn()
    };
    TestBed.configureTestingModule({ providers: [
      { provide: AuthService, useValue: auth },
      provideRouter([
        { path: '', pathMatch: 'full', redirectTo: homeRedirect },
        { path: 'auth/login', component: Destination }, { path: 'teacher/dashboard', component: Destination },
        { path: 'student/dashboard', component: Destination },
        { path: 'admin/users', component: Destination, canActivate: [adminGuard] }
      ])
    ] });
    const harness = await RouterTestingHarness.create();
    const router = TestBed.inject(Router);
    await harness.navigateByUrl('/');
    expect(router.url).toBe('/auth/login');

    for (const role of ['teacher', 'student']) {
      user.set({ role, permissions: ['legal.manage'] });
      await harness.navigateByUrl('/');
      expect(router.url).toBe('/' + role + '/dashboard');
      await harness.navigateByUrl('/admin/users');
      expect(router.url).toBe('/' + role + '/dashboard');
    }
    user.set({ role: 'teacher' });
    await harness.navigateByUrl('/admin/users');
    expect(auth.loadMe).toHaveBeenCalledOnce();
    expect(router.url).toBe('/teacher/dashboard');

    user.set({ role: 'teacher', permissions: ['test_users.manage'] });
    await harness.navigateByUrl('/admin/users');
    expect(router.url).toBe('/admin/users');
    expect(auth.logout).not.toHaveBeenCalled();
  });
});
