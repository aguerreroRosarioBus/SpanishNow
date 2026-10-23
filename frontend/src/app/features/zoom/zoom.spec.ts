import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { provideRouter, ActivatedRoute, convertToParamMap } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { of, Subject, throwError } from 'rxjs';
import { ZoomCardComponent } from './zoom-card.component';
import { ZoomSessionComponent } from './zoom-session.component';
import { ZoomApi } from './zoom-api.service';
import { AuthService } from '../../core/services/auth.service';
import { ClassSessionsService } from '../../core/services/class-sessions.service';
import { UserPreferencesService } from '../../core/services/user-preferences.service';
import { FeaturesService } from '../../core/services/features.service';
import { I18nService } from '../../core/i18n/i18n.service';
const account = { status: 'connected', fake: true, accountEmail: 'docente@zoom.invalid', capabilities: { maxMinutes: 120, maxParticipants: 100 }, lastError: null };
const preferences = { preferences: () => ({ timeZone: 'America/Argentina/Cordoba' }) };
const session = { id: 7, teacherId: 1, version: 2, status: 'confirmed', minutes: 50, startsAt: '2026-11-02T15:00:00Z', endsAt: '2026-11-02T15:50:00Z',
  teacher: { id: 1, name: 'Docente', timeZone: 'America/New_York' }, timeZone: 'America/New_York', liveClassId: 8, whiteboardJoinCode: 'board' };
function setupCard(api: object = {}, query = {}) {
  TestBed.configureTestingModule({ imports: [ZoomCardComponent], providers: [provideRouter([]),
    { provide: ZoomApi, useValue: { status: () => of(account), sessions: () => of({ items: [] }), error: () => 'Error seguro', ...api } },
    { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: convertToParamMap(query) } } },
    { provide: FeaturesService, useValue: { load() {}, enabled: () => true } }, { provide: UserPreferencesService, useValue: preferences }] });
  const f = TestBed.createComponent(ZoomCardComponent); f.detectChanges(); return f;
}
function setupSession(api: object = {}, teacher = true) {
  TestBed.configureTestingModule({ imports: [ZoomSessionComponent], providers: [provideRouter([]),
    { provide: ActivatedRoute, useValue: { snapshot: { paramMap: { get: () => '7' } } } },
    { provide: AuthService, useValue: { currentUser: signal({ id: teacher ? 1 : 2 }) } },
    { provide: UserPreferencesService, useValue: preferences }, { provide: ClassSessionsService, useValue: { get: () => of(session) } },
    { provide: ZoomApi, useValue: { session: () => of({ status: 'needs_attention', manual: false, fake: true }), error: () => 'Error seguro', ...api } }] });
  const f = TestBed.createComponent(ZoomSessionComponent); f.detectChanges(); return f;
}
describe('W08 UI propia', () => {
  it('tarjeta traduce estado/capacidad y exige confirmar antes de desconectar', () => {
    const disconnect = vi.fn(() => of({ ...account, status: 'disconnected', capabilities: null })); const f = setupCard({ disconnect });
    const i18n = TestBed.inject(I18nService); i18n.setLocale('es'); f.detectChanges();
    expect(f.nativeElement.textContent).toContain('120 minutos'); expect(f.nativeElement.textContent).toContain('Conectada');
    // La tarjeta no afirma que la cuenta tenga sala de espera: SpanishNow la activa en cada reunión.
    expect(f.nativeElement.textContent).toContain('SpanishNow activa la sala de espera');
    f.componentInstance.disconnect(); expect(disconnect).not.toHaveBeenCalled();
    f.componentInstance.disconnecting.set(true); i18n.setLocale('en'); f.detectChanges();
    expect(f.nativeElement.textContent).toContain('Disconnect?'); expect(f.componentInstance.disconnecting()).toBe(true);
    f.componentInstance.disconnect(); expect(disconnect).toHaveBeenCalledTimes(1);
  });
  it('OAuth no duplica solicitudes mientras espera y conserva error recuperable', () => {
    const pending = new Subject<{ url: string; fake: boolean }>(); const connect = vi.fn(() => pending); const f = setupCard({ connect });
    f.componentInstance.connect(); f.componentInstance.connect(); expect(connect).toHaveBeenCalledTimes(1);
    pending.error({ error: { code: 'zoom_busy' } }); f.detectChanges(); expect(f.nativeElement.querySelector('[role=alert]').textContent).toBe('Error seguro');
    expect(f.componentInstance.busy()).toBe(false);
  });
  it('confirma el pendiente con sesión y conserva el rechazo de otra cuenta', () => {
    const complete = vi.fn(() => throwError(() => ({ error: { code: 'forbidden' } })));
    const f = setupCard({ complete }, { zoom: 'confirm', token: 'pendiente' });
    expect(complete).toHaveBeenCalledWith('pendiente'); expect(f.componentInstance.status()).toBeNull();
    expect(f.nativeElement.querySelector('[role=alert]').textContent).toBe('Error seguro');
  });
  it('cancelación OAuth muestra código traducible sin completar ningún grant', () => {
    const complete = vi.fn(); const f = setupCard({ complete }, { zoom: 'zoom_oauth_denied' });
    expect(complete).not.toHaveBeenCalled(); expect(f.componentInstance.failure()).toEqual({ error: { code: 'zoom_oauth_denied' } });
  });
  it('callback OAuth inválido muestra código traducible sin completar ningún grant', () => {
    const complete = vi.fn(); const f = setupCard({ complete }, { zoom: 'zoom_oauth_invalid' });
    expect(complete).not.toHaveBeenCalled(); expect(f.componentInstance.failure()).toEqual({ error: { code: 'zoom_oauth_invalid' } });
  });
  it('callback con scopes faltantes conserva el código sin completar ningún grant', () => {
    const complete = vi.fn(); const f = setupCard({ complete }, { zoom: 'zoom_oauth_scopes_missing' });
    expect(complete).not.toHaveBeenCalled(); expect(f.componentInstance.failure()).toEqual({ error: { code: 'zoom_oauth_scopes_missing' } });
  });
  it('callback con Zoom no disponible muestra el código sin completar ningún grant', () => {
    const complete = vi.fn(); const f = setupCard({ complete }, { zoom: 'zoom_provider_unavailable' });
    expect(complete).not.toHaveBeenCalled(); expect(f.componentInstance.failure()).toEqual({ error: { code: 'zoom_provider_unavailable' } });
  });
  it('clase separa reunión/pizarra y conserva el borrador manual al cambiar EN/ES', () => {
    const manual = vi.fn(() => of({ manual: true })); const f = setupSession({ manual, join: () => of({ hostUrl: 'https://zoom.us/s/123456789?zak=fake', manual: false }) });
    const c = f.componentInstance; c.manualLink = 'https://zoom.us/j/123456789?pwd=manual';
    TestBed.inject(I18nService).setLocale('en'); f.changeDetectorRef.markForCheck(); f.detectChanges();
    expect(c.manualLink).toContain('pwd=manual'); expect(f.nativeElement.textContent).toContain('Whiteboard');
    c.join(); f.detectChanges(); expect(f.nativeElement.querySelector('a[target=_blank]').getAttribute('rel')).toBe('noopener noreferrer');
    c.saveManual(); expect(manual).toHaveBeenCalledWith(7, 2, 'https://zoom.us/j/123456789?pwd=manual'); expect(c.sync()?.manual).toBe(true);
    expect(c.meeting()).toBeNull();
  });
  it('alumno solo ve acciones de participante, sin gestión de conexión ni enlace manual', () => {
    const f = setupSession({ join: () => of({ joinUrl: 'https://zoom.us/j/123456789', manual: false }) }, false);
    TestBed.inject(I18nService).setLocale('en'); f.detectChanges();
    expect(f.nativeElement.querySelector('form')).toBeNull(); expect(f.nativeElement.textContent).not.toContain('Retry meeting sync');
    f.componentInstance.join(); expect(f.componentInstance.meeting()).toContain('/j/');
  });
  it('error al guardar conserva borrador, no declara sync exitosa', () => {
    const f = setupSession({ manual: () => throwError(() => ({ error: { code: 'version_conflict' } })) });
    f.componentInstance.manualLink = 'https://zoom.us/j/123456789'; f.componentInstance.saveManual();
    expect(f.componentInstance.manualLink).toBe('https://zoom.us/j/123456789'); expect(f.componentInstance.sync()?.status).toBe('needs_attention');
  });
});
describe('W08 API y errores seguros', () => {
  it('traduce errores propios en EN/ES sin mostrar texto libre ni host', () => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    const api = TestBed.inject(ZoomApi); const i18n = TestBed.inject(I18nService);
    i18n.setLocale('en'); expect(api.error({ error: { code: 'zoom_capacity_exceeded' } })).toContain('class length');
    expect(api.error({ error: { code: 'provider_unavailable' } })).toContain('not configured');
    expect(api.error({ error: { code: 'zoom_provider_unavailable' } })).toContain('could not complete');
    expect(api.error({ error: { code: 'zoom_oauth_scopes_missing' } })).toContain('requested permissions');
    expect(api.error({ error: { code: 'zoom_waiting_room_disabled' } })).toContain('waiting room');
    i18n.setLocale('es'); expect(api.error({ error: { code: 'zoom_invalid_link' } })).toContain('participante');
    expect(api.error({ error: { code: 'zoom_waiting_room_disabled' } })).toContain('sala de espera');
    expect(api.error({ error: { code: 'provider_unavailable' } })).toContain('todavía no está configurado');
    expect(api.error({ error: { code: 'zoom_provider_unavailable' } })).toContain('no pudo completar');
    expect(api.error({ error: { code: 'zoom_oauth_scopes_missing' } })).toContain('permisos solicitados');
    expect(api.error({ error: { error: 'https://zoom.us/s/secret?zak=secret' } })).not.toContain('secret');
    api.manual(7, 2, null).subscribe(); const request = TestBed.inject(HttpTestingController).expectOne(r => r.url.endsWith('/zoom/sessions/7/manual-link'));
    expect(request.request.method).toBe('PUT'); expect(request.request.body).toEqual({ version: 2, joinUrl: null }); request.flush({ manual: false });
    TestBed.inject(HttpTestingController).verify();
  });
});
