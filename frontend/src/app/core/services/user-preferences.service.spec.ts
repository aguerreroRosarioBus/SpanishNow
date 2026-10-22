import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AuthService } from './auth.service';
import { UserPreferencesService } from './user-preferences.service';
import { I18nService, LOCALE_STORAGE_KEY } from '../i18n/i18n.service';
import { environment } from '../../../environments/environment';

const API = `${environment.apiUrl}/me/preferences`;
const user = (id: number) => ({ id, name: `Cuenta ${id}`, email: `cuenta${id}@example.test`, role: 'student' as const });
const preferences = (locale: 'en' | 'es' | null = 'en', timeZone = 'America/Argentina/Cordoba') => ({
  locale, timeZone, timeZoneConfirmedAt: '2026-10-22T15:00:00.000Z'
});

describe('W01: persistencia de preferencias y precedencia de idioma', () => {
  let auth: AuthService;
  let i18n: I18nService;
  let service: UserPreferencesService;
  let http: HttpTestingController;

  beforeEach(() => {
    localStorage.removeItem('user'); localStorage.removeItem('token');
    localStorage.setItem(LOCALE_STORAGE_KEY, 'es');
    TestBed.configureTestingModule({ providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()] });
    auth = TestBed.inject(AuthService);
    i18n = TestBed.inject(I18nService);
    service = TestBed.inject(UserPreferencesService);
    http = TestBed.inject(HttpTestingController);
    TestBed.tick();
  });
  afterEach(() => {
    http.verify({ ignoreCancelled: true });
    localStorage.removeItem(LOCALE_STORAGE_KEY); localStorage.removeItem('user'); localStorage.removeItem('token');
  });

  const enter = (id: number) => { auth.currentUser.set(user(id)); TestBed.tick(); };

  it('visitante no llama a la API ni detecta/guarda una zona automáticamente', () => {
    expect(i18n.locale()).toBe('es');
    i18n.setLocale('en');
    http.expectNone(API);
    expect(service.preferences()).toBeNull();
    expect(localStorage.getItem(LOCALE_STORAGE_KEY)).toBe('en');
  });

  it('preferencia de cuenta supera preferencia anónima y respeta los null sin elegir', () => {
    enter(1);
    http.expectOne(API).flush(preferences('en'));
    expect(i18n.locale()).toBe('en');
    expect(service.preferences()?.timeZone).toBe('America/Argentina/Cordoba');
    // Leer la cuenta no sobrescribe el idioma del visitante en storage.
    expect(localStorage.getItem(LOCALE_STORAGE_KEY)).toBe('es');
    enter(2);
    http.expectOne(API).flush(preferences(null));
    expect(i18n.locale()).toBe('es');
  });

  it('elección explícita del visitante supera cuenta al entrar y se persiste sin tocar zona', () => {
    i18n.setLocale('es');
    enter(1);
    http.expectOne(API).flush(preferences('en'));
    expect(i18n.locale()).toBe('es');
    const save = http.expectOne(API);
    expect(save.request.method).toBe('PATCH');
    expect(save.request.body).toEqual({ locale: 'es' });
    save.flush(preferences('es'));
    expect(service.saving()).toBe(false);
  });

  it('respuesta tardía de GET no revierte una selección explícita durante carga', () => {
    enter(1);
    const load = http.expectOne(API);
    i18n.setLocale('en');
    expect(i18n.locale()).toBe('en');
    load.flush(preferences('es'));
    expect(i18n.locale()).toBe('en');
    const save = http.expectOne(API);
    expect(save.request.body).toEqual({ locale: 'en' });
    save.flush(preferences('en'));
  });

  it('serializa cambios rápidos y guarda la última elección aunque una respuesta anterior llegue después', () => {
    enter(1); http.expectOne(API).flush(preferences('en'));
    i18n.setLocale('es');
    const first = http.expectOne(API);
    i18n.setLocale('en'); i18n.setLocale('es'); i18n.setLocale('en');
    http.expectNone(API);
    first.flush(preferences('es'));
    expect(i18n.locale()).toBe('en');
    const last = http.expectOne(API);
    expect(last.request.body).toEqual({ locale: 'en' });
    last.flush(preferences('en'));
    expect(service.preferences()?.locale).toBe('en');
  });

  it('fallo de guardado conserva elección y datos, muestra error y permite reintento explícito', () => {
    enter(1); http.expectOne(API).flush(preferences('en'));
    i18n.setLocale('es');
    http.expectOne(API).flush({}, { status: 503, statusText: 'Unavailable' });
    expect(i18n.locale()).toBe('es');
    expect(service.preferences()?.locale).toBe('en');
    expect(service.errorMessage()).toContain('No pudimos guardar');
    expect(service.saving()).toBe(false);
    service.retry();
    const retry = http.expectOne(API);
    expect(retry.request.body).toEqual({ locale: 'es' });
    retry.flush(preferences('es'));
    expect(service.errorMessage()).toBe('');
  });

  it('puede reintentar GET y no duplica lecturas por refrescar el mismo usuario', () => {
    enter(1);
    http.expectOne(API).flush({}, { status: 503, statusText: 'Unavailable' });
    expect(service.errorMessage()).toContain('cargar');
    service.retry(); http.expectOne(API).flush(preferences('en'));
    auth.currentUser.set({ ...user(1), name: 'Nuevo nombre' }); TestBed.tick();
    http.expectNone(API);
    expect(i18n.locale()).toBe('en');
  });

  it('logout cancela solicitudes pendientes y descarta la preferencia de cuenta', () => {
    enter(1);
    const load = http.expectOne(API);
    auth.currentUser.set(null); TestBed.tick();
    expect(load.cancelled).toBe(true);
    expect(service.preferences()).toBeNull();
    expect(i18n.locale()).toBe('es');
    expect(service.loading()).toBe(false);
    expect(service.errorMessage()).toBe('');
  });

  it('cambiar de cuenta cancela escrituras/cola anteriores y carga la cuenta destino', () => {
    enter(1); http.expectOne(API).flush(preferences('en'));
    i18n.setLocale('es'); const oldSave = http.expectOne(API);
    i18n.setLocale('en');
    enter(2);
    expect(oldSave.cancelled).toBe(true);
    http.expectOne(API).flush(preferences('es'));
    expect(i18n.locale()).toBe('es');
    http.expectNone(API);
    expect(service.preferences()?.locale).toBe('es');
  });

  it('un cambio de idioma nunca confirma ni guarda una zona, y guardar zona no cambia el idioma', () => {
    enter(1); http.expectOne(API).flush(preferences('en'));
    service.saveTimeZone('Asia/Kathmandu');
    const zone = http.expectOne(API);
    expect(zone.request.body).toEqual({ timeZone: 'Asia/Kathmandu', confirmTimeZone: true });
    i18n.setLocale('es');
    zone.flush(preferences('en', 'Asia/Kathmandu'));
    const language = http.expectOne(API);
    expect(language.request.body).toEqual({ locale: 'es' });
    language.flush(preferences('es', 'Asia/Kathmandu'));
    expect(service.preferences()?.timeZone).toBe('Asia/Kathmandu');
    expect(i18n.locale()).toBe('es');
  });

  it('una zona rechazada por validación no impide guardar un idioma elegido después', () => {
    enter(1); http.expectOne(API).flush(preferences('en'));
    service.saveTimeZone('EST');
    http.expectOne(API).flush({ code: 'time_zone_invalid', params: {} }, { status: 400, statusText: 'Bad Request' });
    i18n.setLocale('es');
    const language = http.expectOne(API);
    expect(language.request.body).toEqual({ locale: 'es' });
    language.flush(preferences('es'));
    expect(service.preferences()?.timeZone).toBe('America/Argentina/Cordoba');
  });
});
