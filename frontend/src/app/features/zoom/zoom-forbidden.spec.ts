import { TestBed } from '@angular/core/testing';
import { provideRouter, ActivatedRoute, convertToParamMap } from '@angular/router';
import { of, throwError } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ZoomCardComponent } from './zoom-card.component';
import { ZoomSummaryComponent } from './zoom-summary.component';
import { ZoomApi } from './zoom-api.service';
import { FeaturesService } from '../../core/services/features.service';
import { UserPreferencesService } from '../../core/services/user-preferences.service';
import { I18nService } from '../../core/i18n/i18n.service';

const forbidden = () => throwError(() => ({ status: 403, error: { code: 'forbidden' } }));
const text = (f: { nativeElement: HTMLElement }) => f.nativeElement.textContent ?? '';

describe('D-01: Zoom sin permiso explica en lugar de mostrar un estado vacío', () => {
  let api: { status: ReturnType<typeof vi.fn>; sessions: ReturnType<typeof vi.fn> };
  beforeEach(() => {
    localStorage.clear();
    api = { status: vi.fn(forbidden), sessions: vi.fn(() => of({ items: [] })) };
    TestBed.configureTestingModule({ providers: [provideRouter([]), { provide: ZoomApi, useValue: { ...api, status: api.status, sessions: api.sessions, error: () => 'x' } },
      { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: convertToParamMap({}) } } },
      { provide: FeaturesService, useValue: { load() {}, enabled: () => true } },
      { provide: UserPreferencesService, useValue: { preferences: () => ({ timeZone: 'UTC' }) } }] });
  });

  it('pantalla de Zoom: avisa en ES, oculta «Clases confirmadas» y no pide la lista de clases', () => {
    TestBed.inject(I18nService).setLocale('es');
    const f = TestBed.createComponent(ZoomCardComponent); f.detectChanges();
    expect(f.nativeElement.querySelector('[data-testid="permission-notice"]')).not.toBeNull();
    expect(text(f)).toContain('Tu cuenta no tiene este permiso. Pídelo a quien administra la plataforma.');
    expect(f.nativeElement.querySelector('.zoom-panel')).toBeNull();
    expect(text(f)).not.toContain('No hay clases confirmadas');
    expect(api.status).toHaveBeenCalledTimes(1);
    expect(api.sessions).not.toHaveBeenCalled();
  });

  it('pantalla de Zoom: avisa en EN', () => {
    TestBed.inject(I18nService).setLocale('en');
    const f = TestBed.createComponent(ZoomCardComponent); f.detectChanges();
    expect(text(f)).toContain('Your account does not have this permission. Ask whoever manages the platform for it.');
  });

  it('resumen de integraciones: sin tarjeta ni enlace «Administrar Zoom»', () => {
    TestBed.inject(I18nService).setLocale('es');
    const f = TestBed.createComponent(ZoomSummaryComponent); f.detectChanges();
    expect(f.nativeElement.querySelector('[data-testid="permission-notice"]')).not.toBeNull();
    expect(f.nativeElement.querySelector('[data-testid="zoom-summary"]')).toBeNull();
    expect(f.nativeElement.querySelector('a')).toBeNull();
  });

  it('otro error (no 403) no se presenta como falta de permiso', () => {
    api.status.mockReturnValue(throwError(() => ({ status: 503, error: { code: 'provider_unavailable' } })));
    const f = TestBed.createComponent(ZoomSummaryComponent); f.detectChanges();
    expect(f.nativeElement.querySelector('[data-testid="permission-notice"]')).toBeNull();
    expect(f.nativeElement.querySelector('[data-testid="zoom-summary"]')).not.toBeNull();
  });
});
