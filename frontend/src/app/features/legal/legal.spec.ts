import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { environment } from '../../../environments/environment';
import { I18N_CATALOGS, I18nService, LOCALE_STORAGE_KEY } from '../../core/i18n/i18n.service';
import { EN } from '../../core/i18n/catalogs/en';
import { AUDIO_MESSAGES } from '../student/story-player/audio-messages';
import { RegisterComponent } from '../auth/register/register.component';
import { PurchasesComponent } from '../student/purchases/purchases.component';
import { AdminLegalComponent } from './admin-legal/admin-legal.component';
import { ExpectationsEditorComponent } from './expectations-editor/expectations-editor.component';
import { LegalConsentComponent } from './legal-consent/legal-consent.component';
import { LEGAL_SALES_MESSAGES } from './legal-messages';
import { LegalPageComponent } from './legal-page/legal-page.component';
import { AdminLegalDocument, EXPECTATION_FIELDS, Expectations, PublicLegalDocument } from './legal.model';

const api = environment.apiUrl;
const business = { responsibleName: 'Responsable ficticio', address: 'Calle ficticia 1', contactEmail: 'c@negocio.invalid', privacyEmail: 'p@negocio.invalid', commercialRetention: 'Plazo ficticio' };
const publicDoc = (documentKey: PublicLegalDocument['documentKey'], locale: 'en' | 'es', version = '3'): PublicLegalDocument => ({
  id: 1, documentKey, documentVersion: version, locale, effectiveAt: '2026-01-01T00:00:00.000Z', publishedAt: '2026-01-01T00:00:00.000Z',
  title: locale === 'en' ? `EN ${documentKey}` : `ES ${documentKey}`, body: `Body ${locale}\nsecond line <b>not html</b>`, business
});
const expectations = (): Expectations => ({
  en: Object.fromEntries(EXPECTATION_FIELDS.map(f => [f, `en ${f}`])) as Expectations['en'],
  es: Object.fromEntries(EXPECTATION_FIELDS.map(f => [f, `es ${f}`])) as Expectations['es']
});

function configure(extra: unknown[] = [], locale: 'en' | 'es' = 'es') {
  localStorage.setItem(LOCALE_STORAGE_KEY, locale);
  TestBed.configureTestingModule({
    providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting(),
      { provide: I18N_CATALOGS, multi: true, useValue: LEGAL_SALES_MESSAGES }, ...extra as never[]]
  });
  return TestBed.inject(HttpTestingController);
}

describe('W02 catálogo legal.*/sales.*', () => {
  it('EN y ES tienen las mismas claves y parámetros, solo con prefijos propios y sin chocar con otros bundles', () => {
    const { en, es } = LEGAL_SALES_MESSAGES;
    expect(Object.keys(en).sort()).toEqual(Object.keys(es).sort());
    const params = (t: unknown) => [...String(t).matchAll(/\{(\w+)\}/g)].map(m => m[1]).sort();
    for (const key of Object.keys(en)) {
      expect(key).toMatch(/^(legal|sales)\./);
      expect(String(es[key]).trim(), key).not.toBe('');
      expect(params(es[key]), key).toEqual(params(en[key]));
    }
    for (const key of [...Object.keys(EN), ...Object.keys(AUDIO_MESSAGES.en)]) expect(Object.hasOwn(en, key), key).toBe(false);
  });

  it('se registra en el inyector raíz junto con W01/W03 sin claves duplicadas', () => {
    TestBed.configureTestingModule({ providers: [
      { provide: I18N_CATALOGS, multi: true, useValue: AUDIO_MESSAGES },
      { provide: I18N_CATALOGS, multi: true, useValue: LEGAL_SALES_MESSAGES }
    ] });
    const i18n = TestBed.inject(I18nService);
    i18n.setLocale('es');
    expect(i18n.t('legal.doc.refunds')).toBe('Política de devoluciones');
    i18n.setLocale('en');
    expect(i18n.t('sales.field.selfStudy')).toBe('Recommended self-study time');
  });
});

describe('W02 página legal pública', () => {
  let query: BehaviorSubject<ReturnType<typeof convertToParamMap>>;
  afterEach(() => localStorage.removeItem(LOCALE_STORAGE_KEY));
  function setup(key: string, version?: string) {
    query = new BehaviorSubject(convertToParamMap(version ? { version } : {}));
    const params = convertToParamMap({ documentKey: key });
    const http = configure([{ provide: ActivatedRoute, useValue: { paramMap: new BehaviorSubject(params), queryParamMap: query, snapshot: { paramMap: params, queryParamMap: query.value } } }]);
    const fixture = TestBed.createComponent(LegalPageComponent);
    fixture.detectChanges();
    return { fixture, http, el: fixture.nativeElement as HTMLElement };
  }

  it('muestra versión, vigencia y contacto; texto plano; el idioma cambia el texto sin cambiar la versión', () => {
    const { fixture, http, el } = setup('terms', '3');
    http.expectOne(r => r.url === `${api}/public/legal/terms` && r.params.get('locale') === 'es' && r.params.get('version') === '3').flush(publicDoc('terms', 'es'));
    fixture.detectChanges();
    expect(el.querySelector('h1')?.textContent).toBe('ES terms');
    expect(el.textContent).toContain('Versión 3');
    expect(el.textContent).toContain('Responsable ficticio');
    expect(el.textContent).toContain('Estás viendo una versión anterior');
    expect(el.querySelector('.legal-doc__body b')).toBeNull();
    expect(el.querySelector('a[href="mailto:p@negocio.invalid"]')).not.toBeNull();

    TestBed.inject(I18nService).setLocale('en');
    fixture.detectChanges();
    http.expectOne(r => r.params.get('locale') === 'en' && r.params.get('version') === '3').flush(publicDoc('terms', 'en'));
    fixture.detectChanges();
    expect(el.querySelector('h1')?.textContent).toBe('EN terms');
    http.verify();
  });

  it('sin versión publicada muestra el aviso; una clave desconocida no consulta al servidor', () => {
    const first = setup('refunds');
    first.http.expectOne(`${api}/public/legal/refunds?locale=es`).flush({ code: 'not_found' }, { status: 404, statusText: 'Not Found' });
    first.fixture.detectChanges();
    expect(first.el.textContent).toContain('todavía no fue publicado');
    TestBed.resetTestingModule();
    const unknown = setup('cookies');
    unknown.http.expectNone(() => true);
    expect(unknown.el.textContent).toContain('todavía no fue publicado');
  });
});

describe('W02 casilla de aceptación', () => {
  afterEach(() => localStorage.removeItem(LOCALE_STORAGE_KEY));
  it('empieza sin marcar, lista versiones exactas y separa privacidad y marketing', () => {
    configure();
    const fixture = TestBed.createComponent(LegalConsentComponent);
    fixture.componentRef.setInput('documents', [
      { documentKey: 'terms', version: '4', title: 'Términos' }, { documentKey: 'privacy', version: '2', title: 'Privacidad' }, { documentKey: 'refunds', version: '1', title: 'Devoluciones' }
    ]);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    const box = el.querySelector<HTMLInputElement>('input[type=checkbox]')!;
    expect(el.querySelectorAll('input[type=checkbox]').length).toBe(1);
    expect(box.checked).toBe(false);
    expect(el.querySelector('a[href="/legal/terms?version=4"]')).not.toBeNull();
    expect(el.querySelector('.legal-consent__docs a[href^="/legal/privacy"]')).toBeNull();
    expect(el.querySelector('.legal-consent__note a[href="/legal/privacy?version=2"]')).not.toBeNull();
    expect(el.textContent).toContain('no te suscribe a mensajes de marketing');
    fixture.componentRef.setInput('submitted', true);
    fixture.detectChanges();
    expect(el.querySelector('[role=alert]')?.textContent).toContain('Marca la casilla');
    box.click();
    fixture.detectChanges();
    expect(fixture.componentInstance.accepted()).toBe(true);
    expect(el.querySelector('[role=alert]')).toBeNull();
  });
});

describe('W02 registro', () => {
  afterEach(() => { localStorage.removeItem(LOCALE_STORAGE_KEY); localStorage.removeItem('user'); localStorage.removeItem('token'); });
  it('no envía sin aceptar; luego manda versión de términos e idioma, nunca privacidad', () => {
    const http = configure();
    const fixture = TestBed.createComponent(RegisterComponent);
    fixture.detectChanges();
    http.expectOne(`${api}/public/legal?locale=es`).flush([publicDoc('terms', 'es', '5'), publicDoc('privacy', 'es', '2'), publicDoc('refunds', 'es', '1')]);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    const component = fixture.componentInstance;
    component.registerForm.setValue({ name: 'Alumno ficticio', email: 'alumno@test.invalid', password: 'secret123' });
    expect(el.querySelector<HTMLInputElement>('.legal-consent input')!.checked).toBe(false);
    expect(el.textContent).not.toContain('ES refunds');
    component.onSubmit();
    fixture.detectChanges();
    http.expectNone(`${api}/auth/register`);
    expect(el.textContent).toContain('Marca la casilla');

    el.querySelector<HTMLInputElement>('.legal-consent input')!.click();
    component.onSubmit();
    const req = http.expectOne(`${api}/auth/register`);
    expect(req.request.body).toEqual({ name: 'Alumno ficticio', email: 'alumno@test.invalid', password: 'secret123', locale: 'es',
      legalConsent: { accepted: true, documents: [{ documentKey: 'terms', documentVersion: '5' }] } });
    req.flush({ code: 'legal_version_changed' }, { status: 409, statusText: 'Conflict' });
    fixture.detectChanges();
    expect(el.textContent).toContain('Los documentos legales se actualizaron');
    http.expectOne(`${api}/public/legal?locale=es`).flush([publicDoc('terms', 'es', '6')]);
    fixture.detectChanges();
    expect(component.legalAccepted()).toBe(false);
  });
});

describe('W02 editor legal', () => {
  afterEach(() => localStorage.removeItem(LOCALE_STORAGE_KEY));
  const adminDoc = (id: number, version: string, publishedAt: string | null, effectiveAt = '2026-01-01T00:00:00.000Z'): AdminLegalDocument => ({
    id, documentKey: 'terms', documentVersion: version, effectiveAt, publishedAt,
    content: { en: { title: `EN v${version}`, body: 'en body' }, es: { title: `ES v${version}`, body: 'es body' } }, business
  });

  it('estados, vista previa por idioma, borrador nuevo a 00:00 UTC y publicación con confirmación', () => {
    const http = configure();
    const fixture = TestBed.createComponent(AdminLegalComponent);
    fixture.detectChanges();
    http.expectOne(`${api}/admin/legal-documents`).flush([adminDoc(3, '3', null), adminDoc(2, '2', '2026-01-02T00:00:00.000Z'), adminDoc(4, '4', '2026-01-03T00:00:00.000Z', '2099-01-01T00:00:00.000Z')]);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    const c = fixture.componentInstance;
    expect(c.versions().map(v => c.status(v))).toEqual(['scheduled', 'draft', 'current']);
    c.selectedId.set(3); c.previewLocale.set('en'); fixture.detectChanges();
    expect(el.querySelector('.preview-doc h3')?.textContent).toBe('EN v3');
    c.previewLocale.set('es'); fixture.detectChanges();
    expect(el.querySelector('.preview-doc h3')?.textContent).toBe('ES v3');

    c.useAsBase(c.versions()[1]);
    c.form.controls.content.controls.es.controls.body.setValue('[TODO: completar]');
    c.saveDraft();
    const draft = http.expectOne(`${api}/admin/legal-documents`);
    expect(draft.request.method).toBe('POST');
    expect(draft.request.body).toMatchObject({ documentKey: 'terms', effectiveAt: '2026-01-01T00:00:00Z', business });
    expect(draft.request.body.content.es.body).toBe('[TODO: completar]');
    draft.flush(adminDoc(5, '5', null));
    http.expectOne(`${api}/admin/legal-documents`).flush([adminDoc(5, '5', null), adminDoc(3, '3', null)]);
    fixture.detectChanges();
    expect(el.textContent).toContain('Borrador versión 5 guardado');

    const five = c.versions()[0];
    c.publish(five);
    http.expectNone(`${api}/admin/legal-documents/5/publish`);
    fixture.detectChanges();
    expect(el.textContent).toContain('Confirmar publicación de la versión 5');
    c.publish(five);
    const pub = http.expectOne(`${api}/admin/legal-documents/5/publish`);
    expect(pub.request.body).toEqual({ documentVersion: '5' });
    pub.flush({ code: 'legal_publication_incomplete', params: { fields: ['content.es.body', 'business.address'] } }, { status: 400, statusText: 'Bad Request' });
    fixture.detectChanges();
    expect(el.textContent).toContain('Todavía no se puede publicar');
    expect(el.textContent).toContain('Texto (Español), Domicilio');
  });
});

describe('W02 editor de expectativas', () => {
  afterEach(() => localStorage.removeItem(LOCALE_STORAGE_KEY));
  it('exige ambos idiomas, envía la versión leída y muestra el conflicto', () => {
    const http = configure([{ provide: ActivatedRoute, useValue: { snapshot: { paramMap: convertToParamMap({ id: '9' }) } } }]);
    const fixture = TestBed.createComponent(ExpectationsEditorComponent);
    fixture.detectChanges();
    http.expectOne(`${api}/courses/9/expectations`).flush({ version: 0, expectations: null });
    fixture.detectChanges();
    const c = fixture.componentInstance;
    const el = fixture.nativeElement as HTMLElement;
    c.save();
    fixture.detectChanges();
    http.expectNone(`${api}/courses/9/expectations`);
    expect(el.textContent).toContain('Completa todos los campos en ambos idiomas');

    c.form.setValue(expectations());
    fixture.detectChanges();
    expect(el.textContent).toContain('es selfStudy');
    c.save();
    const put = http.expectOne(`${api}/courses/9/expectations`);
    expect(put.request.body).toEqual({ version: 0, expectations: expectations() });
    put.flush({ version: 1, expectations: expectations() });
    c.save();
    const again = http.expectOne(`${api}/courses/9/expectations`);
    expect(again.request.body.version).toBe(1);
    again.flush({ code: 'version_conflict' }, { status: 409, statusText: 'Conflict' });
    fixture.detectChanges();
    expect(el.textContent).toContain('Esto cambió al mismo tiempo');
  });
});

describe('W02 historial de compras', () => {
  afterEach(() => localStorage.removeItem(LOCALE_STORAGE_KEY));
  it('muestra la instantánea aceptada (precio, expectativas y versiones), no la actual', () => {
    const http = configure();
    const fixture = TestBed.createComponent(PurchasesComponent);
    fixture.detectChanges();
    const order = { id: 1, paidAt: '2026-03-01T00:00:00.000Z', course: { title: 'Curso', slug: 'curso' }, amount: 9000, currency: 'usd', status: 'paid', refundedAmount: 0, receiptUrl: null };
    http.expectOne(`${api}/me/orders`).flush([
      { ...order, commercial: { courseId: 1, title: 'Curso', teacherId: 1, price: 9000, currency: 'usd', version: 1, expectations: expectations(), hash: 'h',
        legalDocuments: [{ documentKey: 'terms', version: '2', effectiveAt: '2026-01-01T00:00:00.000Z', business, content: { en: { title: 'Terms v2', body: '' }, es: { title: 'Términos v2', body: '' } } }] } },
      { ...order, id: 2, commercial: null }
    ]);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelectorAll('details.purchase-terms').length).toBe(1);
    expect(el.textContent).toContain('es outcomes');
    expect(el.textContent).toMatch(/Precio mostrado en el checkout: USD\s90/);
    const link = el.querySelector<HTMLAnchorElement>('details a[href^="/legal/terms"]')!;
    expect(link.textContent).toBe('Términos v2');
    expect(link.getAttribute('href')).toBe('/legal/terms?version=2');
  });
});

beforeEach(() => localStorage.removeItem(LOCALE_STORAGE_KEY));
