import { provideRouter } from '@angular/router';
import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { TUTORIAL_MESSAGES } from '../../core/tutorials/tutorial.messages';
import { I18N_CATALOGS } from '../../core/i18n/i18n.service';
import { PackageCatalogComponent } from './package-catalog.component';
import { PackagesService } from './packages.service';
import { PackageTemplate, PackageVersion } from './packages.model';
import { PACKAGE_MESSAGES } from './packages.i18n';

const version = (over: Partial<PackageVersion> = {}): PackageVersion => ({ id: 3, templateId: 1, version: 2, nameEn: 'Four classes', nameEs: 'Cuatro clases ñandú', descriptionEn: '', descriptionEs: '',
  modality: 'individual', groupSize: 1, billing: 'per_buyer', sessionsCount: 4, minutesPerSession: 50, seatsCovered: 1, priceAmount: 100000, currency: 'ARS', validityHours: 2160,
  policyVersionId: 1, hotmartProductId: '123', hotmartOfferCode: 'OFF1', hotmartCheckoutUrl: 'https://pay.hotmart.com/X', expectations: null, ...over });
const archived: PackageTemplate = { id: 1, teacherId: 2, templateKey: 'viejo', status: 'archived', current: version() };
const active: PackageTemplate = { id: 2, teacherId: 2, templateKey: 'activo', status: 'active', current: version({ id: 4, templateId: 2 }) };

describe('W05 catálogo: crear, duplicar y archivar', () => {
  const create = vi.fn(), status = vi.fn(() => of(active));
  function setup(items = [archived, active]) {
    create.mockReset().mockImplementation((b: any) => of({ id: 9, teacherId: 2, templateKey: b.templateKey, status: 'draft', current: version({ id: 9, templateId: 9, version: 1, ...b }) }));
    status.mockClear();
    TestBed.configureTestingModule({ imports: [PackageCatalogComponent], providers: [provideRouter([]), { provide: I18N_CATALOGS, multi: true, useValue: TUTORIAL_MESSAGES }, { provide: I18N_CATALOGS, multi: true, useValue: PACKAGE_MESSAGES },
      { provide: PackagesService, useValue: { list: () => of(items), settings: () => of({ classesEnabledAt: null, salesPausedAt: null, acceptsInquiries: false }), create, status, error: () => 'Error' } }] });
    const f = TestBed.createComponent(PackageCatalogComponent); f.detectChanges(); return f;
  }
  const fill = (c: PackageCatalogComponent) => { c.form.patchValue({ nameEn: 'Group', nameEs: 'Grupo de tres', sessionsCount: 8, minutesPerSession: 60, validityHours: 720 }); c.setPrice('1000'); };

  it('crear envía templateKey generado y la combinación del tipo (grupo de 3)', () => {
    const f = setup(); const c = f.componentInstance; c.startCreate(); f.detectChanges();
    expect(c.editorOpen()).toBe(true); expect(document.querySelector('.pilot-editor[role="dialog"]')).not.toBeNull();
    c.form.patchValue({ currency: 'USD' }); fill(c); c.setPrice('25,50'); c.modality('3'); c.save();
    const body = create.mock.calls[0][0];
    expect(body.templateKey).toMatch(/^grupo-de-tres-[a-z0-9]{4}$/);
    expect(body).toMatchObject({ nameEs: 'Grupo de tres', modality: 'group', groupSize: 3, billing: 'per_seat', seatsCovered: 1, priceAmount: 2550, currency: 'USD' });
    expect(body).not.toHaveProperty('hotmartOfferCode'); expect(c.editorOpen()).toBe(false); expect(c.notice()).toBe(true); expect(c.items().length).toBe(3);
  });
  it('reintenta una vez con otra clave si hay template_key_conflict', () => {
    const f = setup(); const c = f.componentInstance; c.startCreate(); fill(c);
    create.mockReset().mockReturnValueOnce(throwError(() => ({ error: { code: 'template_key_conflict' } }))).mockImplementation(() => of({ ...active, id: 10 }));
    c.save(); expect(create).toHaveBeenCalledTimes(2); expect(create.mock.calls[0][0].templateKey).not.toBe(create.mock.calls[1][0].templateKey);
  });
  it('duplicar desde archivado: sin código de oferta, copia producto y link, POST de creación', () => {
    const f = setup(); const c = f.componentInstance; c.duplicate(archived); f.detectChanges();
    expect(c.form.get('hotmartOfferCode')!.value).toBe(''); expect(c.form.get('hotmartProductId')!.value).toBe('123');
    expect(c.form.get('nameEs')!.value).toBe('Cuatro clases ñandú (copia)'); expect(c.form.get('nameEn')!.value).toBe('Four classes (copy)');
    expect(c.priceText()).toBe('1000.00'); expect(document.body.textContent).toMatch(/its own offer|propia oferta/) ;
    c.save(); const body = create.mock.calls[0][0];
    expect(body.templateKey).toMatch(/^cuatro-clases-nandu-copia-[a-z0-9]{4}$/);
    expect(body).toMatchObject({ priceAmount: 100000, currency: 'ARS', hotmartProductId: '123', hotmartCheckoutUrl: 'https://pay.hotmart.com/X' });
    expect(body).not.toHaveProperty('hotmartOfferCode'); expect(archived.status).toBe('archived');
  });
  it('el botón Duplicar existe también en archivados', () => {
    const f = setup(); const text = [...f.nativeElement.querySelectorAll('.package-card.is-archived button')].map((b: HTMLElement) => b.textContent);
    expect(text.some((t: string) => /Duplic/.test(t))).toBe(true);
  });
  it('archivar pide confirmación y cancelar no llama a la API', () => {
    const f = setup(); const c = f.componentInstance; c.askArchive(active); f.detectChanges();
    expect(c.archiveTarget()).toBe(active); expect(status).not.toHaveBeenCalled();
    c.archiveTarget.set(null); f.detectChanges(); expect(status).not.toHaveBeenCalled();
    c.askArchive(active); c.confirmArchive(); expect(status).toHaveBeenCalledWith(2, 'archived', 2);
  });
  it('el precio se escribe en unidades mayores y se convierte según la moneda', () => {
    const f = setup(); const c = f.componentInstance; c.startCreate();
    c.form.patchValue({ currency: 'ARS' }); c.setPrice('1000'); expect(c.form.get('priceAmount')!.value).toBe(100000);
    c.setPrice('1000,50'); expect(c.form.get('priceAmount')!.value).toBe(100050);
    c.setCurrency('JPY'); c.setPrice('1500'); expect(c.form.get('priceAmount')!.value).toBe(1500);
    c.setCurrency('USD'); c.setPrice('9.99'); expect(c.form.get('priceAmount')!.value).toBe(999); expect(c.priceValid()).toBe(true);
  });
  it('el editor abre como diálogo modal con título y el botón de edición marca cuál paquete se edita', () => {
    const f = setup(); const c = f.componentInstance; c.edit(active); f.detectChanges();
    const dialog = document.querySelector('.pilot-editor[role="dialog"]') as HTMLElement;
    expect(dialog).not.toBeNull(); expect(dialog.getAttribute('aria-modal')).toBe('true');
    const btn = f.nativeElement.querySelector('.package-card[data-status="active"] [data-tour="catalog-edit"]') as HTMLElement;
    expect(btn.getAttribute('aria-expanded')).toBe('true'); expect(btn.classList).toContain('is-editing');
    expect(document.querySelector('[data-tour="catalog-editor"]')).not.toBeNull();
  });
});
