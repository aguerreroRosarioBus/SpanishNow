import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { vi } from 'vitest';
import { CertificateVerifyComponent } from './certificate-verify.component';
import { CertificateService } from '../../../core/services/certificate.service';
import { I18nService } from '../../../core/i18n/i18n.service';
import { UserPreferencesService } from '../../../core/services/user-preferences.service';

it('certificado: localiza etiquetas conservando identidad, código e instante emitido', () => {
  const certificate = Object.freeze({code: 'K7QM-X2PD-9TNA', studentName: 'José original', teacherName: 'María original', courseTitle: 'Historias originales', issuedAt: '2026-10-23T02:30:00Z'});
  const verify = vi.fn(() => of(certificate));
  TestBed.configureTestingModule({providers: [provideRouter([]),
    {provide: ActivatedRoute, useValue: {snapshot: {paramMap: convertToParamMap({code: certificate.code})}}},
    {provide: CertificateService, useValue: {verify, pdfUrl: (code: string) => '/pdf/' + code}},
    {provide: UserPreferencesService, useValue: {preferences: () => ({timeZone: 'America/Argentina/Cordoba'})}}
  ]});
  const i18n = TestBed.inject(I18nService); i18n.setLocale('en');
  const f = TestBed.createComponent(CertificateVerifyComponent); f.detectChanges();
  const el = f.nativeElement as HTMLElement;
  expect(el.textContent).toContain('Valid certificate');
  expect(el.textContent).toContain('October 22, 2026');
  i18n.setLocale('es'); f.detectChanges();
  expect(el.textContent).toContain('Certificado válido');
  expect(el.textContent).toContain('22 de octubre de 2026');
  for (const value of [certificate.code, certificate.studentName, certificate.teacherName, certificate.courseTitle]) expect(el.textContent).toContain(value);
  expect(f.componentInstance.certificate()).toBe(certificate);
  expect(verify).toHaveBeenCalledTimes(1);
});
