import { provideRouter } from '@angular/router';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { of } from 'rxjs';
import { environment } from '../../../environments/environment';
import { TUTORIAL_MESSAGES } from '../../core/tutorials/tutorial.messages';
import { I18N_CATALOGS, I18nService } from '../../core/i18n/i18n.service';
import { PackageCatalogComponent } from './package-catalog.component';
import { PackagesService } from './packages.service';
import { ClassSettings } from './packages.model';
import { PACKAGE_MESSAGES } from './packages.i18n';

// W11 (#96): el docente puede activar «recibir consultas»; sin esta pantalla nadie aparecía en «Nueva consulta».
describe('W11 catálogo: recibir consultas por chat', () => {
  const settings = (over: Partial<ClassSettings> = {}): ClassSettings => ({ classesEnabledAt: '2026-11-25T00:00:00Z', salesPausedAt: '2026-11-25T00:00:00Z', acceptsInquiries: false, ...over });
  const inquiries = vi.fn();
  function setup(initial: ClassSettings) {
    inquiries.mockReset().mockImplementation((accepts: boolean) => of({ ...initial, acceptsInquiries: accepts }));
    TestBed.configureTestingModule({ imports: [PackageCatalogComponent], providers: [provideRouter([]),
      { provide: I18N_CATALOGS, multi: true, useValue: TUTORIAL_MESSAGES }, { provide: I18N_CATALOGS, multi: true, useValue: PACKAGE_MESSAGES },
      { provide: PackagesService, useValue: { list: () => of([]), settings: () => of(initial), inquiries, error: () => 'Error' } }] });
    TestBed.inject(I18nService).setLocale('es');
    const f = TestBed.createComponent(PackageCatalogComponent); f.detectChanges(); return f;
  }
  const button = (f: { nativeElement: HTMLElement }) => f.nativeElement.querySelector<HTMLButtonElement>('[data-testid="toggle-inquiries"]')!;

  it('activa las consultas con un solo envío y refleja el estado nuevo', () => {
    const f = setup(settings());
    expect(button(f).textContent).toContain('Recibir consultas');
    button(f).click(); f.detectChanges();
    expect(inquiries).toHaveBeenCalledTimes(1);
    expect(inquiries).toHaveBeenCalledWith(true);
    expect(button(f).textContent).toContain('Dejar de recibir consultas');
    expect(f.nativeElement.textContent).toContain('te encuentran en «Nueva consulta»');
  });

  it('las desactiva cuando ya estaban activas', () => {
    const f = setup(settings({ acceptsInquiries: true }));
    button(f).click(); f.detectChanges();
    expect(inquiries).toHaveBeenCalledWith(false);
    expect(button(f).textContent).toContain('Recibir consultas');
  });

  it('queda deshabilitado mientras un administrador no habilite al docente', () => {
    const f = setup(settings({ classesEnabledAt: null }));
    expect(button(f).disabled).toBe(true);
    button(f).click();
    expect(inquiries).not.toHaveBeenCalled();
  });
});

describe('W11 servicio: PATCH de consultas', () => {
  it('envía solo acceptsInquiries y no toca la pausa de ventas', () => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    const http = TestBed.inject(HttpTestingController);
    TestBed.inject(PackagesService).inquiries(true).subscribe();
    const req = http.expectOne(`${environment.apiUrl}/teacher/class-settings`);
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual({ acceptsInquiries: true });
    req.flush({});
    http.verify();
  });
});
