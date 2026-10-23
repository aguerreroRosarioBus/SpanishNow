import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { afterEach, describe, expect, it } from 'vitest';
import { routes } from '../../app.routes';
import { I18N_CATALOGS, LOCALE_STORAGE_KEY } from '../../core/i18n/i18n.service';
import { LEGAL_SALES_MESSAGES } from './legal-messages';

function session(permissions: string[] | undefined) {
  localStorage.setItem(LOCALE_STORAGE_KEY, 'es');
  localStorage.setItem('token', 't');
  localStorage.setItem('user', JSON.stringify({ id: 1, name: 'Solange', email: 's@x.invalid', role: 'teacher', permissions }));
  TestBed.configureTestingModule({ providers: [provideRouter(routes), provideHttpClient(), provideHttpClientTesting(),
    { provide: I18N_CATALOGS, multi: true, useValue: LEGAL_SALES_MESSAGES }] });
}

describe('Ruta /admin/legal', () => {
  afterEach(() => { ['token', 'user', LOCALE_STORAGE_KEY].forEach(k => localStorage.removeItem(k)); });

  it('con legal.manage renderiza el editor con su título', async () => {
    session(['legal.manage']);
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/admin/legal');
    TestBed.inject(HttpTestingController).expectOne(r => r.url.endsWith('/admin/legal-documents')).flush([]);
    harness.detectChanges();
    expect(harness.routeNativeElement?.querySelector('h1')?.textContent).toContain('Documentos legales');
  });

  it('sin legal.manage no queda en blanco: avisa que falta el permiso', async () => {
    session(['users.manage']);
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/admin/legal');
    harness.detectChanges();
    const alert = harness.routeNativeElement?.querySelector('[role="alert"]');
    expect(alert?.textContent).toContain('no tiene permiso');
    expect(harness.routeNativeElement?.querySelector('h1')?.textContent).toContain('Documentos legales');
  });
});
