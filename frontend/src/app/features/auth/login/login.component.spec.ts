import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { LoginComponent } from './login.component';

describe('C-06: foco inicial del login', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({ providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()] });
  });

  it('al abrir la pantalla el foco queda en el campo de email', async () => {
    const fixture = TestBed.createComponent(LoginComponent);
    document.body.appendChild(fixture.nativeElement);
    fixture.detectChanges();
    await fixture.whenStable();
    expect(document.activeElement).toBe(fixture.nativeElement.querySelector('#email'));
    fixture.nativeElement.remove();
  });

  it('entrar a la pantalla de acceso sigue descartando la sesión anterior', () => {
    localStorage.setItem('token', 'jwt'); localStorage.setItem('user', '{}');
    TestBed.createComponent(LoginComponent);
    expect(localStorage.getItem('token')).toBeNull();
  });
});
