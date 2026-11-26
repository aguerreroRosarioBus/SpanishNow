import { ToastService } from '../../core/services/toast.service';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { vi } from 'vitest';
import { AuthService } from '../../core/services/auth.service';
import { I18N_CATALOGS, I18nService } from '../../core/i18n/i18n.service';
import { ClassCommerceComponent } from './class-commerce.component';
import { PACKAGE_MESSAGES } from './packages.i18n';
import { ClassHotmartSetup, PackageTemplate } from './packages.model';
import { PackagesService } from './packages.service';

const empty: ClassHotmartSetup = {
  verifiedAt: null, webhookUrl: null, pending: false, approval: 'blocked', approvedPackageIds: null, classesEnabled: true, salesPaused: false,
};
const pending = { ...empty, webhookUrl: 'https://example.test/hotmart/class-packages', pending: true };
const connected = { ...pending, verifiedAt: '2026-11-25T18:00:00Z', pending: false };
const draft = {id:8,status:'draft',current:{version:3,nameEs:'Cuatro clases',nameEn:'Four classes',priceAmount:8000,currency:'USD'}} as PackageTemplate;
const mapped = {...draft,current:{...draft.current!,hotmartProductId:'123',hotmartOfferCode:'H4',hotmartCheckoutUrl:'https://pay.hotmart.com/X'}} as PackageTemplate;

function render(opts:{setup?:ClassHotmartSetup;items?:PackageTemplate[];query?:Record<string,string>}={}) {
  TestBed.resetTestingModule();
  const api = {
    hotmartSetup:vi.fn(() => of(opts.setup ?? empty)),
    saveHotmartKey:vi.fn((_key:string) => of(pending)),
    list:vi.fn(() => of(opts.items ?? [draft])),
    linkHotmart:vi.fn((_id:number, _body:unknown) => of(mapped)),
    classSales:vi.fn(() => of({items:[],next:null})),
    settings:vi.fn(() => of({sessionBufferMinutes:10,minLeadTimeHours:24,classesEnabledAt:'2026-11-01T00:00:00Z',salesPausedAt:null,acceptsInquiries:true})),
    error:vi.fn(() => 'Error'),
  };
  TestBed.configureTestingModule({
    imports:[ClassCommerceComponent],
    providers:[provideRouter([]),...(opts.query?[{provide:ActivatedRoute,useValue:{snapshot:{queryParamMap:convertToParamMap(opts.query)}}}]:[]),{provide:I18N_CATALOGS,multi:true,useValue:PACKAGE_MESSAGES},
      {provide:AuthService,useValue:{currentUser:()=>null}},{provide:PackagesService,useValue:api}],
  });
  const i18n = TestBed.inject(I18nService);
  i18n.setLocale('es');
  const fixture = TestBed.createComponent(ClassCommerceComponent);
  fixture.detectChanges();
  return {api,i18n,fixture,component:fixture.componentInstance,root:fixture.nativeElement as HTMLElement};
}

describe('Cobros de paquetes para docentes', () => {
  it('ofrece un inicio claro y diferencia una clave guardada de la recepción de la prueba', () => {
    const {api, i18n, fixture, component, root} = render();
    expect(root.textContent).toContain('Conectar mi cuenta de Hotmart');
    expect(root.querySelector('input[type="checkbox"]')).toBeNull();
    component.start();
    fixture.detectChanges();
    expect(root.querySelector('a[href="https://app.hotmart.com/tools/webhook"]')).toBeTruthy();
    expect(root.querySelector('img[src="help/hotmart/authentication.webp"]')).toBeTruthy();
    component.key.set('clave ficticia');
    component.saveKey();
    expect(api.saveHotmartKey).toHaveBeenCalledWith('clave ficticia');
    expect(component.key()).toBe('');
    expect(component.step()).toBe('address');
    component.go('test');
    api.hotmartSetup.mockReturnValueOnce(of(pending));
    component.checkTest();
    expect(TestBed.inject(ToastService).getToasts().map(t => t.message)).toContain(i18n.t('packages.commerce.testWaiting'));
    api.hotmartSetup.mockReturnValueOnce(of(connected));
    component.checkTest();
    fixture.detectChanges();
    expect(root.textContent).toContain('Activa los avisos de venta');
    expect(component.ready()).toBe(false);
  });

  it('usa el código del enlace, conserva lo escrito al cambiar idioma y pide aprobación antes de cobrar', () => {
    const {api,i18n,component,fixture,root} = render();
    component.setup.set(connected);
    component.go('package');
    component.selectPackage(8);
    component.setLink('https://pay.hotmart.com.ejemplo.invalid/x?off=H4');
    expect(component.checkoutPreview()).toBeNull();
    component.setLink('https://pay.hotmart.com/X?off=H4&sck=privado');
    component.productId.set('123');
    i18n.setLocale('en');
    expect(component.checkoutPreview()).toBe('https://pay.hotmart.com/X?off=H4');
    component.savePackage();
    expect(api.linkHotmart).not.toHaveBeenCalled();
    component.checkoutOpened.set(true);
    component.priceConfirmed.set(true);
    component.savePackage();
    expect(api.linkHotmart).toHaveBeenCalledWith(8,expect.objectContaining({version:3,productId:'123',offerCode:'H4'}));
    expect(component.setupState()).toBe('review');
    fixture.detectChanges();
    expect(root.textContent).toContain('Your package is prepared');
    component.setup.set({...connected,approval:'connected',approvedPackageIds:[8]});
    expect(component.setupState()).toBe('publish');
    component.items.set([{...mapped,status:'active'}]);
    expect(component.setupState()).toBe('ready');
  });

  it('exige abrir la página de pago y confirmar el precio antes de guardar, y con la cuenta aprobada no queda pendiente', () => {
    const {api,component,fixture,root} = render();
    component.setup.set({...connected,approval:'connected',approvedPackageIds:[]});
    component.selectPackage(8);
    component.setLink('https://pay.hotmart.com/X?off=H4');
    component.productId.set('123');
    component.go('preview');
    fixture.detectChanges();
    const save = () => [...root.querySelectorAll('button')].find(b => b.textContent?.includes('Guardar')) as HTMLButtonElement;
    const box = root.querySelector('#class-hotmart-confirm') as HTMLInputElement;
    expect(save().disabled).toBe(true);
    expect(box.checked).toBe(false);
    expect(root.textContent).toMatch(/USD\s80,00/);
    box.click();
    fixture.detectChanges();
    expect(save().disabled).toBe(true);
    (root.querySelector('a[target="_blank"]') as HTMLAnchorElement).addEventListener('click', e => e.preventDefault());
    (root.querySelector('a[target="_blank"]') as HTMLAnchorElement).click();
    fixture.detectChanges();
    expect(save().disabled).toBe(false);
    component.setLink('https://pay.hotmart.com/Y?off=H4');
    expect(component.checkoutOpened()).toBe(false);
    expect(component.priceConfirmed()).toBe(false);
    component.setLink('https://pay.hotmart.com/X?off=H4');
    component.checkoutOpened.set(true);
    component.priceConfirmed.set(true);
    component.savePackage();
    expect(api.linkHotmart).toHaveBeenCalledOnce();
    expect(component.setup()?.approvedPackageIds).toEqual([8]);
    expect(component.packageReviewPending()).toBe(false);
  });

  it('carga ventas propias al abrir la sección de Ventas', () => {
    const {api,component,fixture,root} = render();
    expect(api.classSales).not.toHaveBeenCalled();
    component.chooseTab('sales');
    fixture.detectChanges();
    expect(api.classSales).toHaveBeenCalledOnce();
    expect(root.textContent).toContain('Tus ventas de paquetes');
  });

  const approved = {...connected,approval:'connected' as const,approvedPackageIds:[8]};
  const active = {...mapped,status:'active'} as PackageTemplate;

  it('abre «Paquetes» si la venta ya está habilitada y «Configurar cobros» si falta algo', () => {
    expect(render({setup:approved,items:[active]}).component.tab()).toBe('packages');
    expect(render({setup:approved,items:[mapped]}).component.tab()).toBe('packages');
    expect(render({setup:{...approved,salesPaused:true},items:[active]}).component.tab()).toBe('packages');
    expect(render().component.tab()).toBe('setup');
    expect(render({setup:{...approved,classesEnabled:false},items:[active]}).component.tab()).toBe('setup');
  });

  it('no pisa la pestaña elegida a mano y respeta ?tab= de la URL', () => {
    const manual = render({setup:approved,items:[active]});
    manual.component.chooseTab('sales');
    manual.component.load();
    expect(manual.component.tab()).toBe('sales');
    expect(render({setup:approved,items:[active],query:{tab:'setup'}}).component.tab()).toBe('setup');
  });

  it('con ?package= abre el paso de vincular con ese paquete elegido', () => {
    const {component} = render({setup:approved,items:[draft],query:{tab:'setup',package:'8'}});
    expect(component.step()).toBe('package');
    expect(component.selectedId()).toBe(8);
  });

  it('«Vincular con Hotmart» desde la lista lleva al paso de vincular con el paquete', () => {
    const {component} = render({setup:approved,items:[draft]});
    component.linkPackage(8);
    expect(component.tab()).toBe('setup');
    expect(component.step()).toBe('package');
    expect(component.selectedId()).toBe(8);
  });
});
