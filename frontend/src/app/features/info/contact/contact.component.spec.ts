import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { I18nService } from '../../../core/i18n/i18n.service';
import { ContactComponent } from './contact.component';

describe('C-02: /contact no promete un formulario que no existe', () => {
  beforeEach(() => { localStorage.clear(); TestBed.configureTestingModule({}); });
  afterEach(() => { TestBed.resetTestingModule(); localStorage.clear(); });

  for (const locale of ['es', 'en'] as const) {
    it(`muestra los correos y oculta «enviar un mensaje» (${locale})`, () => {
      TestBed.inject(I18nService).setLocale(locale);
      const fixture = TestBed.createComponent(ContactComponent);
      fixture.detectChanges();
      const el: HTMLElement = fixture.nativeElement;
      expect(el.querySelector('a[href="mailto:contacto@spanishnow.com"]')).not.toBeNull();
      expect(el.querySelector('a[href="mailto:soporte@spanishnow.com"]')).not.toBeNull();
      expect(el.textContent).not.toMatch(/Envíanos un mensaje|Send us a message|próximamente|available soon/);
    });
  }
});
