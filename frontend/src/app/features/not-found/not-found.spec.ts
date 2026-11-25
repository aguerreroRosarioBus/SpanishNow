import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { routes } from '../../app.routes';
import { NotFoundComponent } from './not-found.component';

const session = (role: 'student' | 'teacher') => {
  localStorage.setItem('token', 'jwt-de-prueba');
  localStorage.setItem('user', JSON.stringify({ id: 1, name: 'Ana', email: 'ana@example.test', role, permissions: [] }));
};

describe('A-01: página 404 que no cierra la sesión', () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem('spanishnow.locale', 'es');
    TestBed.configureTestingModule({ providers: [provideRouter(routes), provideHttpClient(), provideHttpClientTesting()] });
  });

  it('una URL inexistente muestra la 404 y conserva token y usuario', async () => {
    session('student');
    const harness = await RouterTestingHarness.create();
    const component = await harness.navigateByUrl('/esto-no-existe', NotFoundComponent);
    expect(component).toBeInstanceOf(NotFoundComponent);
    expect(TestBed.inject(Router).url).toBe('/esto-no-existe');
    expect(localStorage.getItem('token')).toBe('jwt-de-prueba');
    expect(localStorage.getItem('user')).not.toBeNull();
    expect(harness.routeNativeElement?.textContent).toContain('No encontramos esa página');
  });

  it('el alumno con sesión ve «Mis cursos» y el catálogo; no ve «Iniciar sesión»', async () => {
    session('student');
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/nope/otra/ruta', NotFoundComponent);
    const links = Array.from((harness.routeNativeElement as HTMLElement).querySelectorAll('a')).map(a => [a.textContent?.trim(), a.getAttribute('href')]);
    expect(links).toEqual([['Mis cursos', '/student/dashboard'], ['Ver cursos', '/courses']]);
  });

  it('el docente con sesión ve el panel docente', async () => {
    session('teacher');
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/nope', NotFoundComponent);
    const first = (harness.routeNativeElement as HTMLElement).querySelector('a');
    expect(first?.textContent?.trim()).toBe('Panel docente');
    expect(first?.getAttribute('href')).toBe('/teacher/dashboard');
  });

  it('sin sesión ofrece «Iniciar sesión» y el catálogo', async () => {
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/nope', NotFoundComponent);
    const links = Array.from((harness.routeNativeElement as HTMLElement).querySelectorAll('a')).map(a => [a.textContent?.trim(), a.getAttribute('href')]);
    expect(links).toEqual([['Iniciar sesión', '/auth/login'], ['Ver cursos', '/courses']]);
  });

  it('en inglés usa los textos en inglés', async () => {
    localStorage.setItem('spanishnow.locale', 'en');
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/nope', NotFoundComponent);
    expect(harness.routeNativeElement?.textContent).toContain('We could not find that page');
    expect(harness.routeNativeElement?.textContent).toContain('Sign in');
  });

  it('entrar a /auth/login a propósito sigue descartando la sesión anterior', async () => {
    session('student');
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/auth/login');
    expect(localStorage.getItem('token')).toBeNull();
    expect(localStorage.getItem('user')).toBeNull();
  });
});
