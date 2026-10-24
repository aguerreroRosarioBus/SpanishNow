import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { of, Subject } from 'rxjs';
import { environment } from '../../../environments/environment';
import { PackageCatalogComponent } from './package-catalog.component';
import { PackagesService } from './packages.service';
import { CompleteTemplate, PackageTemplate } from './packages.model';
import { I18N_CATALOGS, I18nService } from '../../core/i18n/i18n.service';
import { PACKAGE_MESSAGES } from './packages.i18n';
const item: CompleteTemplate = {id:1,teacherId:2,templateKey:'individual-4x50',status:'draft',current:{id:3,templateId:1,version:7,nameEn:'Four classes',nameEs:'Cuatro clases',descriptionEn:'',descriptionEs:'',modality:'individual',groupSize:1,billing:'per_buyer',sessionsCount:4,minutesPerSession:50,seatsCovered:1,priceAmount:9000,currency:'USD',validityHours:2160,policyVersionId:1,hotmartProductId:null,hotmartOfferCode:null,hotmartCheckoutUrl:null,expectations:null}};
describe('W05 catálogo de paquetes',()=>{
  const save = vi.fn();
  const status = vi.fn(()=>of(item));
  beforeEach(()=>TestBed.configureTestingModule({imports:[PackageCatalogComponent],providers:[{provide:I18N_CATALOGS,multi:true,useValue:PACKAGE_MESSAGES},{provide:PackagesService,useValue:{list:()=>of([item]),settings:()=>of({classesEnabledAt:null,salesPausedAt:'2026-10-22T00:00:00Z',acceptsInquiries:false}),save,status,error:()=> 'Error'}}]}));
  it('catálogos simétricos packages; idioma conserva importe y borrador',()=>{
    expect(Object.keys(PACKAGE_MESSAGES.en).sort()).toEqual(Object.keys(PACKAGE_MESSAGES.es).sort());
    expect(Object.keys(PACKAGE_MESSAGES.en).every(k=>k.startsWith('packages.'))).toBe(true);
    const f=TestBed.createComponent(PackageCatalogComponent); f.detectChanges(); const c=f.componentInstance; c.edit(item);
    c.form.get('nameEs')!.setValue('Borrador propio'); const data=c.form.getRawValue();
    TestBed.inject(I18nService).setLocale('es'); f.detectChanges();
    expect(c.form.getRawValue()).toEqual(data); expect(c.name(item)).toBe('Cuatro clases');
    expect(f.nativeElement.textContent).toContain('USD'); expect(c.form.get('priceAmount')!.value).toBe(9000);
  });
  it('activar envía la versión comercial que el docente vio',()=>{
    status.mockClear();const f=TestBed.createComponent(PackageCatalogComponent);f.detectChanges();f.componentInstance.status(item,'active');
    expect(status).toHaveBeenCalledWith(item.id,'active',item.current.version);
  });
  it('guarda revisión vista e impide doble envío mientras espera',()=>{
    const pending=new Subject<PackageTemplate>(); save.mockReset().mockReturnValue(pending);
    const f=TestBed.createComponent(PackageCatalogComponent); f.detectChanges(); const c=f.componentInstance; c.edit(item); c.save(); c.save();
    expect(save).toHaveBeenCalledTimes(1); expect(save.mock.calls[0][1]).toMatchObject({version:7,priceAmount:9000,currency:'USD',expectations:{es:{audience:''}}});
    pending.next({...item,current:{...item.current,version:8}}); expect(c.selected()!.current!.version).toBe(8); expect(c.busy()).toBe(false);
  });
});

describe('Tanda B: catálogo con plantilla sin versión (current null)',()=>{
  const broken: PackageTemplate = {id:1,teacherId:2,templateKey:'individual-1x30',status:'draft',current:null,policy:undefined};
  const settings = {classesEnabledAt:null,salesPausedAt:'2026-10-22T00:00:00Z',acceptsInquiries:false};
  const save = vi.fn();
  const status = vi.fn();
  const importInitial = vi.fn();
  const list = vi.fn();
  beforeEach(()=>{
    save.mockReset().mockReturnValue(of({...item,id:1}));status.mockReset();importInitial.mockReset().mockReturnValue(of([{...item,id:1}]));list.mockReset().mockReturnValue(of([broken]));
    TestBed.configureTestingModule({imports:[PackageCatalogComponent],providers:[{provide:I18N_CATALOGS,multi:true,useValue:PACKAGE_MESSAGES},{provide:PackagesService,useValue:{list,settings:()=>of(settings),save,status,importInitial,error:()=> 'Error'}}]});
    TestBed.inject(I18nService).setLocale('es');
  });
  it('muestra la tarjeta con qué falta y las acciones en lugar de lanzar TypeError',()=>{
    const f=TestBed.createComponent(PackageCatalogComponent);
    expect(()=>f.detectChanges()).not.toThrow();
    const text=f.nativeElement.textContent as string;
    expect(text).toContain('individual-1x30');
    expect(text).toContain('no tiene versión vigente');
    const buttons=Array.from<HTMLButtonElement>(f.nativeElement.querySelectorAll('article button')).map(b=>b.textContent!.trim());
    expect(buttons).toEqual(['Completar datos','Reparar con el catálogo inicial']);
    expect(f.componentInstance.name(broken)).toBe('individual-1x30');
  });
  it('«Reparar» reimporta el catálogo inicial y la tarjeta pasa a mostrar la versión',()=>{
    const f=TestBed.createComponent(PackageCatalogComponent);f.detectChanges();
    const repair=Array.from<HTMLButtonElement>(f.nativeElement.querySelectorAll('article button')).find(b=>b.textContent!.includes('Reparar'))!;
    repair.click();f.detectChanges();
    expect(importInitial).toHaveBeenCalledTimes(1);
    expect(f.nativeElement.textContent).toContain('Cuatro clases');expect(f.nativeElement.textContent).not.toContain('no tiene versión vigente');
  });
  it('«Completar datos» abre el formulario y guarda con version 0 sin enviar política vacía',()=>{
    const f=TestBed.createComponent(PackageCatalogComponent);f.detectChanges();const c=f.componentInstance;
    c.edit(broken);f.detectChanges();
    expect(c.form.get('modality')!.value).toBe('individual');
    expect(f.nativeElement.textContent).toContain('Este paquete se quedó sin versión');
    // Nada se inventa: sin nombre, importes ni duración el formulario no es válido.
    expect(c.form.invalid).toBe(true);
    c.form.patchValue({nameEn:'One class',nameEs:'Una clase',sessionsCount:1,minutesPerSession:30,priceAmount:1500,validityHours:720});
    c.save();
    expect(save).toHaveBeenCalledTimes(1);
    const body=save.mock.calls[0][1];
    expect(body).toMatchObject({version:0,nameEs:'Una clase',sessionsCount:1,currency:'USD',groupSize:1,billing:'per_buyer'});
    expect('policyVersionId' in body).toBe(false);
  });
  it('si quedó una versión guardada (plantilla creada por script sin vínculo), «Completar datos» parte de ella y guarda con version 0',()=>{
    const orphan: PackageTemplate = {...broken,lastVersion:item.current!};
    const f=TestBed.createComponent(PackageCatalogComponent);f.detectChanges();const c=f.componentInstance;
    c.edit(orphan);expect(c.form.get('nameEs')!.value).toBe('Cuatro clases');expect(c.form.get('priceAmount')!.value).toBe(9000);expect(c.form.valid).toBe(true);
    c.save();expect(save.mock.calls[0][1]).toMatchObject({version:0,nameEs:'Cuatro clases',priceAmount:9000,policyVersionId:1});
  });
  it('no intenta activar ni archivar una plantilla sin versión',()=>{
    const f=TestBed.createComponent(PackageCatalogComponent);f.detectChanges();
    f.componentInstance.status(broken,'active');
    expect(status).not.toHaveBeenCalled();
  });
});
describe('Tanda B: URLs que usa la pantalla del catálogo',()=>{
  it('solo llama a /teacher/class-packages y /teacher/class-settings (nunca a /api/class-packages)',()=>{
    TestBed.configureTestingModule({imports:[PackageCatalogComponent],providers:[provideHttpClient(),provideHttpClientTesting(),{provide:I18N_CATALOGS,multi:true,useValue:PACKAGE_MESSAGES}]});
    const http=TestBed.inject(HttpTestingController);
    const f=TestBed.createComponent(PackageCatalogComponent);f.detectChanges();
    const urls=http.match(()=>true).map(r=>r.request.url).sort();
    expect(urls).toEqual([`${environment.apiUrl}/teacher/class-packages`,`${environment.apiUrl}/teacher/class-settings`]);
  });
});
describe('Tanda C: catálogo vacío',()=>{
  const setup=(items:CompleteTemplate[])=>{
    const importInitial=vi.fn(()=>of([item]));
    TestBed.configureTestingModule({imports:[PackageCatalogComponent],providers:[{provide:I18N_CATALOGS,multi:true,useValue:PACKAGE_MESSAGES},{provide:PackagesService,useValue:{list:()=>of(items),settings:()=>of({classesEnabledAt:null,salesPausedAt:null,acceptsInquiries:false}),importInitial,error:()=>''}}]});
    TestBed.inject(I18nService).setLocale('es');
    const f=TestBed.createComponent(PackageCatalogComponent);f.detectChanges();return {f,importInitial};
  };
  it('sin paquetes explica qué hacer y ofrece una única acción con nombre para importar el catálogo inicial',()=>{
    const {f,importInitial}=setup([]);
    const empty=f.nativeElement.querySelector('[data-testid="catalog-empty"]') as HTMLElement;
    expect(empty).toBeTruthy();expect(empty.textContent).toContain('Empiezan pausadas');
    const buttons=Array.from<HTMLButtonElement>(f.nativeElement.querySelectorAll('button')).filter(b=>b.textContent!.includes('Importar catálogo inicial'));
    expect(buttons).toHaveLength(1);buttons[0].click();expect(importInitial).toHaveBeenCalled();
  });
  it('con paquetes no hay estado vacío y cada acción lleva el nombre del paquete para lectores de pantalla',()=>{
    const {f}=setup([item]);
    expect(f.nativeElement.querySelector('[data-testid="catalog-empty"]')).toBeNull();
    const labels=Array.from<HTMLElement>(f.nativeElement.querySelectorAll('article button')).map(b=>b.getAttribute('aria-label')||'');
    expect(labels.every(l=>l.includes('Cuatro clases'))).toBe(true);
  });
});
