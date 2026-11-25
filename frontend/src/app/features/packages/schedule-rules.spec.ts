import { provideRouter } from '@angular/router';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { of, throwError } from 'rxjs';
import { environment } from '../../../environments/environment';
import { TUTORIAL_MESSAGES } from '../../core/tutorials/tutorial.messages';
import { I18N_CATALOGS, I18nService } from '../../core/i18n/i18n.service';
import { PackageCatalogComponent } from './package-catalog.component';
import { PackagesService } from './packages.service';
import { ClassSettings } from './packages.model';
import { PACKAGE_MESSAGES } from './packages.i18n';

// W06: descanso entre clases y anticipación mínima las configura el docente (antes solo existían en la base).
describe('W06 catálogo: reglas de agenda del docente', () => {
  const initial: ClassSettings = { classesEnabledAt: '2026-11-25T00:00:00Z', salesPausedAt: null, acceptsInquiries: true, sessionBufferMinutes: 10, minLeadTimeHours: 24 };
  const schedule = vi.fn();
  async function setup(save: (rules: { sessionBufferMinutes: number; minLeadTimeHours: number }) => unknown = rules => of({ ...initial, ...rules })) {
    schedule.mockReset().mockImplementation(save);
    TestBed.configureTestingModule({ imports: [PackageCatalogComponent], providers: [provideRouter([]),
      { provide: I18N_CATALOGS, multi: true, useValue: TUTORIAL_MESSAGES }, { provide: I18N_CATALOGS, multi: true, useValue: PACKAGE_MESSAGES },
      { provide: PackagesService, useValue: { list: () => of([]), settings: () => of(initial), schedule, error: () => 'Error de prueba' } }] });
    TestBed.inject(I18nService).setLocale('es');
    const f = TestBed.createComponent(PackageCatalogComponent); f.detectChanges(); await f.whenStable(); f.detectChanges(); return f;
  }
  const root = (f: { nativeElement: unknown }) => f.nativeElement as HTMLElement;
  const field = (f: { nativeElement: unknown }, id: string) => root(f).querySelector<HTMLInputElement>(`#${id}`)!;
  const save = (f: { nativeElement: unknown }) => root(f).querySelector<HTMLButtonElement>('[data-testid="save-schedule"]')!;
  async function type(f: { detectChanges(): void; whenStable(): Promise<unknown> }, input: HTMLInputElement, value: string) {
    input.value = value; input.dispatchEvent(new Event('input')); f.detectChanges(); await f.whenStable(); f.detectChanges();
  }

  it('muestra los valores vigentes y no deja guardar sin cambios', async () => {
    const f = await setup();
    expect(field(f, 'sessionBuffer').value).toBe('10'); expect(field(f, 'minLeadTime').value).toBe('24');
    expect(root(f).querySelector('[data-testid="schedule-summary"]')!.textContent).toContain('10 min entre clases · 24 h de anticipación');
    expect(save(f).disabled).toBe(true);
  });

  it('guarda ambos valores en un solo envío y refleja el resultado', async () => {
    const f = await setup();
    await type(f, field(f, 'sessionBuffer'), '15'); await type(f, field(f, 'minLeadTime'), '48');
    expect(save(f).disabled).toBe(false);
    save(f).click(); f.detectChanges();
    expect(schedule).toHaveBeenCalledTimes(1);
    expect(schedule).toHaveBeenCalledWith({ sessionBufferMinutes: 15, minLeadTimeHours: 48 });
    expect(root(f).querySelector('[data-testid="schedule-summary"]')!.textContent).toContain('15 min entre clases · 48 h de anticipación');
    expect(root(f).querySelector('[data-testid="schedule-saved"]')!.textContent).toContain('Guardado');
    expect(save(f).disabled).toBe(true);
  });

  it('acepta 0 y rechaza vacío, decimales, negativos y valores sobre el tope', async () => {
    const f = await setup();
    await type(f, field(f, 'sessionBuffer'), '0');
    expect(save(f).disabled).toBe(false);
    for (const bad of ['', ' ', '1.5', '-5', 'abc', '121', '1e2']) {
      await type(f, field(f, 'sessionBuffer'), bad);
      expect(save(f).disabled, `«${bad}» debería ser inválido`).toBe(true);
      expect(field(f, 'sessionBuffer').getAttribute('aria-invalid')).toBe('true');
      expect(root(f).querySelector('#sessionBufferHint')!.textContent).toContain('0 a 120');
    }
    await type(f, field(f, 'sessionBuffer'), '120'); expect(save(f).disabled).toBe(false);
    await type(f, field(f, 'minLeadTime'), '721'); expect(save(f).disabled).toBe(true);
    await type(f, field(f, 'minLeadTime'), '720'); expect(save(f).disabled).toBe(false);
    expect(schedule).not.toHaveBeenCalled();
  });

  it('si el servidor falla, conserva lo escrito, muestra el error y no declara guardado', async () => {
    const f = await setup(() => throwError(() => ({ error: { code: 'validation_failed' } })));
    await type(f, field(f, 'minLeadTime'), '36');
    save(f).click(); f.detectChanges();
    expect(root(f).querySelector('[role="alert"]')!.textContent).toContain('Error de prueba');
    expect(field(f, 'minLeadTime').value).toBe('36');
    expect(root(f).querySelector('[data-testid="schedule-saved"]')).toBeNull();
    expect(root(f).querySelector('[data-testid="schedule-summary"]')!.textContent).toContain('24 h');
  });

  it('el aviso de guardado desaparece al volver a editar', async () => {
    const f = await setup();
    await type(f, field(f, 'sessionBuffer'), '20'); save(f).click(); f.detectChanges();
    expect(root(f).querySelector('[data-testid="schedule-saved"]')).not.toBeNull();
    await type(f, field(f, 'sessionBuffer'), '25');
    expect(root(f).querySelector('[data-testid="schedule-saved"]')).toBeNull();
  });

  it('en inglés usa los textos en inglés', async () => {
    const f = await setup(); TestBed.inject(I18nService).setLocale('en'); f.detectChanges();
    expect(root(f).querySelector('[data-testid="schedule-summary"]')!.textContent).toContain('10 min between classes · 24 h notice');
    expect(root(f).textContent).toContain('Minimum notice (hours)');
  });
});

describe('W06 servicio: PATCH de reglas de agenda', () => {
  it('envía solo los dos campos de agenda', () => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    const http = TestBed.inject(HttpTestingController);
    TestBed.inject(PackagesService).schedule({ sessionBufferMinutes: 15, minLeadTimeHours: 48 }).subscribe();
    const req = http.expectOne(`${environment.apiUrl}/teacher/class-settings`);
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual({ sessionBufferMinutes: 15, minLeadTimeHours: 48 });
    req.flush({});
    http.verify();
  });
});
