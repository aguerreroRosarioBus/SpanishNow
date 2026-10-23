import {TestBed} from '@angular/core/testing';
import {provideHttpClient} from '@angular/common/http';
import {CertificateService} from './certificate.service';
import {I18nService} from '../i18n/i18n.service';

describe('CertificateService: idioma del PDF', () => {
  it('pide el PDF en el idioma de la interfaz', () => {
    TestBed.configureTestingModule({providers: [provideHttpClient()]});
    const i18n = TestBed.inject(I18nService);
    const service = TestBed.inject(CertificateService);
    i18n.setLocale('es');
    expect(service.pdfUrl('K7QM-X2PD-9TNA')).toMatch(/\/pdf\?lang=es$/);
    i18n.setLocale('en');
    expect(service.pdfUrl('K7QM-X2PD-9TNA')).toMatch(/\/pdf\?lang=en$/);
  });
});
