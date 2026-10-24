import {TestBed} from '@angular/core/testing';
import {provideRouter} from '@angular/router';
import {of,throwError} from 'rxjs';
import {describe,expect,it,vi} from 'vitest';
import {CommerceAdminComponent} from './commerce-admin.component';
import {PackagesService} from './packages.service';
import {AuthService} from '../../core/services/auth.service';
import {I18N_CATALOGS,I18nService} from '../../core/i18n/i18n.service';
import {PACKAGE_MESSAGES} from './packages.i18n';

const order={id:12,offerId:30,provider:'hotmart',status:'paid_needs_review',amount:120,currency:'USD',reviewReason:'Importe distinto',providerTransactionId:'HP1',providerProductId:'55',providerOfferCode:'x7'};
function render(permissions:string[],api:Record<string,unknown>={}){
  const service={providerState:()=>throwError(()=>({status:403})),refundRequests:()=>of([]),paymentList:()=>of({items:[],events:[]}),paymentJobs:()=>of([]),teachers:()=>of([]),policies:()=>of([{version:4,rules:{refundWindowHours:360,maxPauseHours:720,offerTtlHours:168}}]),error:()=>'',...api};
  TestBed.configureTestingModule({imports:[CommerceAdminComponent],providers:[provideRouter([]),{provide:I18N_CATALOGS,multi:true,useValue:PACKAGE_MESSAGES},
    {provide:AuthService,useValue:{currentUser:()=>null,hasPermission:(k:string)=>permissions.includes(k)}},{provide:PackagesService,useValue:service}]});
  TestBed.inject(I18nService).setLocale('es');
  const f=TestBed.createComponent(CommerceAdminComponent);f.detectChanges();return f;
}
const headings=(f:{nativeElement:HTMLElement})=>[...f.nativeElement.querySelectorAll('h2')].map(h=>h.textContent!.trim());
describe('Gestión comercial: jerarquía visual',()=>{
  it('agrupa en secciones con encabezado: ventas y proveedor, trámites, docentes y política',()=>{
    const f=render(['class_payments.review','class_teachers.manage','class_packages.manage_all','class_credits.adjust']);
    expect(headings(f)).toEqual(['Motivo y confirmación','Ventas y proveedor','Trámites y reembolsos','Docentes habilitados para clases','Política para ventas futuras','Ajuste de créditos auditado']);
  });
  it('sin permiso de pagos no muestra ventas ni trámites',()=>{
    const f=render(['class_teachers.manage']);
    expect(headings(f)).toEqual(['Docentes habilitados para clases']);
  });
  it('estados vacíos con una acción que vuelve a cargar',()=>{
    const paymentList=vi.fn(()=>of({items:[],events:[]}));
    const f=render(['class_payments.review','class_teachers.manage'],{paymentList});
    const empties=[...f.nativeElement.querySelectorAll('.empty')] as HTMLElement[];
    expect(empties.map(e=>e.querySelector('p')!.textContent)).toEqual(['No hay pagos con este estado.','No hay solicitudes de reembolso para revisar.','No hay trámites del proveedor ni recuperaciones pendientes.','Todavía no hay docentes para habilitar.']);
    expect(empties.every(e=>e.querySelector('button')?.textContent?.trim()==='Volver a cargar')).toBe(true);
    const before=paymentList.mock.calls.length;
    (empties[0].querySelector('button') as HTMLButtonElement).click();
    expect(paymentList.mock.calls.length).toBe(before+1);
  });
  it('los datos del proveedor van como texto secundario y la versión de la política fuera del encabezado',()=>{
    const f=render(['class_payments.review','class_packages.manage_all'],{paymentList:()=>of({items:[order],events:[]})});
    const meta=f.nativeElement.querySelector('.item .notice') as HTMLElement;
    expect(meta.textContent).toContain('Transacción HP1 · Producto 55 · Oferta x7');
    expect(f.nativeElement.querySelector('.item-head .badge-status')?.textContent).toContain('Para revisar');
    expect(headings(f)).toContain('Política para ventas futuras');
    expect(f.nativeElement.textContent).toContain('Versión 4');
  });
  it('el catálogo EN y ES tiene las mismas claves nuevas de gestión comercial',()=>{
    const keys=(l:'en'|'es')=>Object.keys(PACKAGE_MESSAGES[l]).filter(k=>/^packages\.admin\.(confirmTitle|confirmHint|salesTitle|proceduresTitle|order|refundsEmpty|paymentsEmpty|teachersEmpty|reload|policyVersion|providerIds|jobMeta|job\.title|orderStatus\.)/.test(k)).sort();
    expect(keys('en')).toEqual(keys('es'));expect(keys('en').length).toBe(19);
  });
});
