import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FeaturesService } from '../../core/services/features.service';
import { GoogleCalendarService, GoogleCalendarStatus } from '../../core/services/google-calendar.service';
import { I18N_CATALOGS } from '../../core/i18n/i18n.service';
import { CALENDAR_MESSAGES } from './calendar.messages';
import { CalendarCardComponent } from './calendar-card.component';

const connected = (): GoogleCalendarStatus => ({ provider: 'google_calendar', enabled: true, fake: true, status: 'connected', connected: true, accountEmail: 'docente@example.test',
  targetCalendarId: 'primary', busyCalendarIds: ['primary'], version: 3,
  calendars: [{ id: 'primary', summary: 'Principal', primary: true, accessRole: 'owner' }, { id: 'ro', summary: 'Solo lectura', primary: false, accessRole: 'reader' }, { id: 'clases', summary: 'Clases', primary: false, accessRole: 'owner' }] });
const disconnected = (): GoogleCalendarStatus => ({ provider: 'google_calendar', enabled: true, fake: true, status: 'disconnected', connected: false, calendars: [] });

describe('W07: tarjeta de Google Calendar', () => {
  let api: Record<'status' | 'connect' | 'update' | 'disconnect', ReturnType<typeof vi.fn>>;
  let assign: (url: string) => void;
  const create = (query: Record<string, string> = {}, enabled = true) => {
    TestBed.configureTestingModule({ providers: [provideRouter([]), { provide: I18N_CATALOGS, multi: true, useValue: CALENDAR_MESSAGES },
      { provide: GoogleCalendarService, useValue: api }, { provide: FeaturesService, useValue: { enabled: () => enabled } },
      { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: convertToParamMap(query) } } }] });
    const fixture = TestBed.createComponent(CalendarCardComponent);
    vi.spyOn(fixture.componentInstance, 'go').mockImplementation(assign);
    fixture.detectChanges();
    return fixture;
  };
  beforeEach(() => {
    localStorage.clear(); localStorage.setItem('spanishnow.locale', 'es');
    assign = vi.fn() as unknown as (url: string) => void;
    api = { status: vi.fn(() => of(disconnected())), connect: vi.fn(() => of({ url: 'https://accounts.example/auth' })), update: vi.fn(() => of(connected())), disconnect: vi.fn(() => of({ status: 'disconnected' })) };
  });

  it('sin conexión explica permisos y privacidad y conecta navegando a la URL que da el servidor', () => {
    const fixture = create();
    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('Sin conectar');
    expect(text).toContain('Drive y Classroom no se tocan');
    expect(text).toContain('lista de invitados oculta');
    (fixture.nativeElement.querySelector('button.btn-primary') as HTMLButtonElement).click();
    expect(api.connect).toHaveBeenCalledTimes(1);
    expect(assign).toHaveBeenCalledWith('https://accounts.example/auth');
  });

  it('conectado: solo calendarios escribibles como destino, el destino siempre ocupa y se guarda con la versión', () => {
    api.status.mockReturnValue(of(connected()));
    const fixture = create();
    const options = [...fixture.nativeElement.querySelectorAll('#calendarTarget option')].map((o: HTMLOptionElement) => o.value);
    expect(options).toEqual(['primary', 'clases']);
    expect(fixture.nativeElement.textContent).toContain('docente@example.test');
    expect(fixture.nativeElement.textContent).toContain('solo lectura');
    const component = fixture.componentInstance;
    component.target.set('clases'); component.toggle('ro');
    component.save();
    expect(api.update).toHaveBeenCalledWith({ targetCalendarId: 'clases', busyCalendarIds: ['clases', 'primary', 'ro'], version: 3 });
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Elecciones guardadas.');
  });

  it('revocado o con atención: aviso accionable y reconexión; desconectar pide confirmación y explica qué se conserva', () => {
    api.status.mockReturnValue(of({ ...connected(), status: 'revoked', connected: false }));
    const fixture = create();
    expect(fixture.nativeElement.textContent).toContain('Acceso revocado');
    expect(fixture.nativeElement.textContent).toContain('Volver a conectar');
    expect(fixture.nativeElement.textContent).not.toContain('Guardar elecciones');
    const ghost = [...fixture.nativeElement.querySelectorAll('button')].find((b: HTMLButtonElement) => b.textContent!.includes('Desconectar')) as HTMLButtonElement;
    ghost.click(); fixture.detectChanges();
    expect(api.disconnect).not.toHaveBeenCalled();
    expect(fixture.nativeElement.textContent).toContain('Tus clases, saldo e historial no cambian');
    const confirm = [...fixture.nativeElement.querySelectorAll('button')].find((b: HTMLButtonElement) => b.textContent!.includes('Sí, desconectar')) as HTMLButtonElement;
    confirm.click();
    expect(api.disconnect).toHaveBeenCalledTimes(1);
  });

  it('el resultado del callback se muestra una vez y errores del servidor salen traducidos, sin texto libre', () => {
    const fixture = create({ calendar: 'scopes' });
    expect(fixture.nativeElement.textContent).toContain('Faltaron permisos necesarios');
    api.update.mockReturnValue(throwError(() => ({ status: 409, error: { error: 'texto libre', code: 'version_conflict', params: {} } })));
    api.status.mockReturnValue(of(connected()));
    fixture.componentInstance.state.set(connected());
    fixture.componentInstance.save();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).not.toContain('texto libre');
    expect(fixture.nativeElement.querySelector('[role=alert]')).not.toBeNull();
  });

  it('con el flag apagado no ofrece conectar', () => {
    const fixture = create({}, false);
    expect(fixture.nativeElement.textContent).toContain('todavía no está disponible');
    expect(fixture.nativeElement.querySelector('button')).toBeNull();
  });

  it('el catálogo EN/ES tiene las mismas claves, todas con prefijo calendar.', () => {
    expect(Object.keys(CALENDAR_MESSAGES.en).sort()).toEqual(Object.keys(CALENDAR_MESSAGES.es).sort());
    expect(Object.keys(CALENDAR_MESSAGES.en).every(key => key.startsWith('calendar.'))).toBe(true);
  });
});
