import { TestBed } from '@angular/core/testing';
import { of, Subject } from 'rxjs';
import { PackageCatalogComponent } from './package-catalog.component';
import { PackagesService } from './packages.service';
import { PackageTemplate } from './packages.model';
import { I18N_CATALOGS, I18nService } from '../../core/i18n/i18n.service';
import { PACKAGE_MESSAGES } from './packages.i18n';
const item: PackageTemplate = {id:1,teacherId:2,templateKey:'individual-4x50',status:'draft',current:{id:3,templateId:1,version:7,nameEn:'Four classes',nameEs:'Cuatro clases',descriptionEn:'',descriptionEs:'',modality:'individual',groupSize:1,billing:'per_buyer',sessionsCount:4,minutesPerSession:50,seatsCovered:1,priceAmount:9000,currency:'USD',validityHours:2160,policyVersionId:1,hotmartProductId:null,hotmartOfferCode:null,hotmartCheckoutUrl:null,expectations:null}};
describe('W05 catálogo de paquetes',()=>{
  const save = vi.fn();
  beforeEach(()=>TestBed.configureTestingModule({imports:[PackageCatalogComponent],providers:[{provide:I18N_CATALOGS,multi:true,useValue:PACKAGE_MESSAGES},{provide:PackagesService,useValue:{list:()=>of([item]),settings:()=>of({classesEnabledAt:null,salesPausedAt:'2026-10-22T00:00:00Z',acceptsInquiries:false}),save,error:()=> 'Error'}}]}));
  it('catálogos simétricos packages; idioma conserva importe y borrador',()=>{
    expect(Object.keys(PACKAGE_MESSAGES.en).sort()).toEqual(Object.keys(PACKAGE_MESSAGES.es).sort());
    expect(Object.keys(PACKAGE_MESSAGES.en).every(k=>k.startsWith('packages.'))).toBe(true);
    const f=TestBed.createComponent(PackageCatalogComponent); f.detectChanges(); const c=f.componentInstance; c.edit(item);
    c.form.get('nameEs')!.setValue('Borrador propio'); const data=c.form.getRawValue();
    TestBed.inject(I18nService).setLocale('es'); f.detectChanges();
    expect(c.form.getRawValue()).toEqual(data); expect(c.name(item)).toBe('Cuatro clases');
    expect(f.nativeElement.textContent).toContain('USD'); expect(c.form.get('priceAmount')!.value).toBe(9000);
  });
  it('guarda revisión vista e impide doble envío mientras espera',()=>{
    const pending=new Subject<PackageTemplate>(); save.mockReset().mockReturnValue(pending);
    const f=TestBed.createComponent(PackageCatalogComponent); f.detectChanges(); const c=f.componentInstance; c.edit(item); c.save(); c.save();
    expect(save).toHaveBeenCalledTimes(1); expect(save.mock.calls[0][1]).toMatchObject({version:7,priceAmount:9000,currency:'USD',expectations:{es:{audience:''}}});
    pending.next({...item,current:{...item.current,version:8}}); expect(c.selected()!.current.version).toBe(8); expect(c.busy()).toBe(false);
  });
});
