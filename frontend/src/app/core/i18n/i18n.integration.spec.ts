import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { LoginComponent } from '../../features/auth/login/login.component';
import { RegisterComponent } from '../../features/auth/register/register.component';
import { ForgotPasswordComponent } from '../../features/auth/forgot-password/forgot-password.component';
import { ResetPasswordComponent } from '../../features/auth/reset-password/reset-password.component';
import { LanguageSelectorComponent } from '../../shared/components/language-selector/language-selector.component';
import { NavbarTopComponent } from '../../shared/components/navbar-top/navbar-top.component';
import { SidebarNavComponent } from '../../shared/components/sidebar-nav/sidebar-nav.component';
import { AuthService } from '../services/auth.service';
import { I18nService, LOCALE_STORAGE_KEY } from './i18n.service';
import { LocaleDatePipe, LocaleMoneyPipe, LocaleNumberPipe } from './locale-format.pipe';
import { environment } from '../../../environments/environment';

@Component({
  imports: [LanguageSelectorComponent, LocaleDatePipe, LocaleMoneyPipe, LocaleNumberPipe],
  template: `<app-language-selector />
    <span id="money">{{ amount | localeMoney : 'USD' }}</span>
    <span id="number">{{ 1234.5 | localeNumber }}</span>
    <span id="date">{{ instant | localeDate : zone : { hourCycle: 'h23' } }}</span>
    <p lang="es">El gato quiere una casa.</p>`
})
class FormatsHost {
  amount = 9015;
  instant = '2026-10-23T02:30:00.000Z';
  zone = 'America/Argentina/Cordoba';
}

describe('I18N: integración sin destruir formularios ni datos', () => {
  beforeEach(() => {
    localStorage.removeItem('user'); localStorage.removeItem('token');
    localStorage.setItem(LOCALE_STORAGE_KEY, 'es');
    TestBed.configureTestingModule({ providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()] });
  });
  afterEach(() => { localStorage.removeItem(LOCALE_STORAGE_KEY); localStorage.removeItem('user'); localStorage.removeItem('token'); });

  it('cambia textos, validaciones y errores del login sin alterar campos ni estado', () => {
    const fixture = TestBed.createComponent(LoginComponent);
    const component = fixture.componentInstance;
    fixture.detectChanges();
    const originalForm = component.loginForm;
    component.loginForm.setValue({ email: 'ficticio@example.test', password: 'prueba123' });
    component.onSubmit();
    TestBed.inject(HttpTestingController).expectOne(`${environment.apiUrl}/auth/login`)
      .flush({ error: 'Texto antiguo' }, { status: 401, statusText: 'Unauthorized' });
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Email o contraseña incorrectos.');
    TestBed.inject(I18nService).setLocale('en');
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Incorrect email or password.');
    expect(fixture.nativeElement.querySelector('label[for="password"]').textContent).toBe('Password');
    expect(component.loginForm).toBe(originalForm);
    expect(component.loginForm.value).toEqual({ email: 'ficticio@example.test', password: 'prueba123' });
    component.loginForm.controls['email'].setValue('incorrecto');
    component.loginForm.controls['email'].markAsTouched();
    expect(component.getErrorMessage('email')).toBe('Enter a valid email address.');
  });

  it('mantiene borrador de registro y traduce la validación al cambiar idioma', () => {
    const fixture = TestBed.createComponent(RegisterComponent);
    const component = fixture.componentInstance;
    component.registerForm.setValue({ name: 'Ana', email: 'sin-arroba', password: 'prueba123' });
    component.registerForm.markAllAsTouched();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Ingresa un email válido.');
    TestBed.inject(I18nService).setLocale('en');
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Enter a valid email address.');
    expect(component.registerForm.value.name).toBe('Ana');
    expect(component.registerForm.dirty).toBe(false);
    expect(component.registerForm.touched).toBe(true);
  });

  it('la recuperación traduce confirmación sin repetir la petición', () => {
    const fixture = TestBed.createComponent(ForgotPasswordComponent);
    fixture.componentInstance.form.setValue({ email: 'ficticio@example.test' });
    fixture.componentInstance.submit();
    const http = TestBed.inject(HttpTestingController);
    http.expectOne(`${environment.apiUrl}/auth/forgot-password`).flush({});
    TestBed.inject(I18nService).setLocale('en');
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('If an account exists');
    expect(fixture.componentInstance.sent()).toBe(true);
    http.verify();
  });

  it('conserva contraseñas y validación de coincidencia del restablecimiento', () => {
    const fixture = TestBed.createComponent(ResetPasswordComponent);
    const component = fixture.componentInstance;
    component.token = 'token-ficticio';
    component.form.setValue({ password: 'prueba123', confirm: 'otra123' });
    component.form.markAllAsTouched();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Las contraseñas no coinciden.');
    TestBed.inject(I18nService).setLocale('en');
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Passwords don’t match.');
    expect(component.form.controls.password.value).toBe('prueba123');
  });

  for (const role of ['student', 'teacher'] as const) {
    it(`ofrece un único selector global para ${role} y mantiene el nombre propio`, () => {
      TestBed.inject(AuthService).currentUser.set({ id: 1, name: 'Ángela', email: 'a@example.test', role });
      const fixture = TestBed.createComponent(NavbarTopComponent);
      fixture.detectChanges();
      const select: HTMLSelectElement = fixture.nativeElement.querySelector('select');
      expect(fixture.nativeElement.querySelectorAll('app-language-selector').length).toBe(1);
      select.value = 'en'; select.dispatchEvent(new Event('change'));
      fixture.detectChanges();
      expect(select.getAttribute('aria-label')).toBe('Language');
      expect(fixture.nativeElement.textContent).toContain('Ángela');
      expect(fixture.nativeElement.querySelector('button.account-button').getAttribute('aria-label')).toBe('Account menu');
    });
  }

  it('traduce navegación administrativa sin cambiar rutas o permisos', () => {
    const user = { id: 2, name: 'Admin ficticio', email: 'admin@example.test', role: 'student' as const, permissions: ['users.manage'] };
    TestBed.inject(AuthService).currentUser.set(user);
    const fixture = TestBed.createComponent(SidebarNavComponent);
    fixture.detectChanges();
    const adminLink = fixture.nativeElement.querySelector('a[href="/admin/users"]');
    expect(adminLink.textContent).toContain('Usuarios');
    TestBed.inject(I18nService).setLocale('en');
    fixture.detectChanges();
    expect(adminLink.textContent).toContain('Users');
    expect(adminLink.isConnected).toBe(true);
    expect(TestBed.inject(AuthService).currentUser()).toBe(user);
  });

  it('los pipes reaccionan al selector conservando importe, zona, instante y contenido docente', () => {
    const fixture = TestBed.createComponent(FormatsHost);
    fixture.detectChanges();
    const select: HTMLSelectElement = fixture.nativeElement.querySelector('select');
    expect(fixture.nativeElement.querySelector('#money').textContent).toContain('90,15');
    select.value = 'en'; select.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('#money').textContent).toContain('90.15');
    expect(fixture.nativeElement.querySelector('#money').textContent).toContain('USD');
    expect(fixture.nativeElement.querySelector('#number').textContent).toBe('1,234.5');
    expect(fixture.nativeElement.querySelector('#date').textContent).toContain('23:30');
    expect(fixture.nativeElement.querySelector('p').textContent).toBe('El gato quiere una casa.');
    expect(fixture.componentInstance.amount).toBe(9015);
    expect(fixture.componentInstance.zone).toBe('America/Argentina/Cordoba');
    expect(fixture.componentInstance.instant).toBe('2026-10-23T02:30:00.000Z');
  });
});
