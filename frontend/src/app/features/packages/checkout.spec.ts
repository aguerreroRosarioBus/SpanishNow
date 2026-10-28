import {TestBed} from '@angular/core/testing';
import {ActivatedRoute,convertToParamMap,provideRouter} from '@angular/router';
import {of,Subject,throwError} from 'rxjs';
import {OfferDetailComponent} from './offer-detail.component';
import {PackagesService} from './packages.service';
import {ChatFormat} from '../chat/chat-format';
import {I18N_CATALOGS,I18nService} from '../../core/i18n/i18n.service';
import {PACKAGE_MESSAGES} from './packages.i18n';
import {LEGAL_SALES_MESSAGES} from '../legal/legal-messages';
const offer={id:10,conversationId:9,buyerId:4,canCheckout:true,amount:9000,currency:'USD',sessionsCount:4,minutesPerSession:50,seatsCovered:1,status:'sent',expiresAt:'2026-11-05T00:00:00Z',snapshot:{nameEn:'Four sessions',nameEs:'Cuatro sesiones',teacherName:'Docente ficticio',templateVersion:3,policyVersion:1,validityHours:2160,policy:{freeCancelHours:24,maxPauseHours:720,maxPauses:1,refundWindowHours:360,refundMode:'full_unused_then_review'},legalDocuments:[{documentKey:'terms',version:'3',content:{en:{title:'Terms',body:'text'},es:{title:'Términos',body:'texto'}}}]}};
function fixture(api:unknown){TestBed.configureTestingModule({imports:[OfferDetailComponent],providers:[provideRouter([]),{provide:I18N_CATALOGS,multi:true,useValue:PACKAGE_MESSAGES},{provide:I18N_CATALOGS,multi:true,useValue:LEGAL_SALES_MESSAGES},{provide:ActivatedRoute,useValue:{paramMap:of(convertToParamMap({id:'10'}))}},{provide:ChatFormat,useValue:{timeZone:()=> 'America/Argentina/Cordoba'}},{provide:PackagesService,useValue:api}]});const f=TestBed.createComponent(OfferDetailComponent);f.detectChanges();return f;}
describe('checkout W05',()=>{
 it('una oferta incompleta no rompe la pantalla, no inventa versiones y no permite pagar',()=>{
   const checkout=vi.fn();
   const partial={...offer,snapshot:{...offer.snapshot,policy:undefined,templateVersion:undefined,policyVersion:undefined}};
   const f=fixture({offer:()=>of(partial),checkoutState:()=>of({offer:partial,order:null,purchaseId:null}),checkout,error:()=> 'Error'});
   TestBed.inject(I18nService).setLocale('es'); f.detectChanges();
   expect(f.nativeElement.querySelector('[data-testid="incomplete-offer"]')).toBeTruthy();
   expect(f.nativeElement.textContent).not.toContain('undefined');
   expect(f.nativeElement.textContent).not.toContain('{hours}');
   expect(f.nativeElement.textContent).toContain('Actualizar estado');
   f.componentInstance.accepted.set(true); f.componentInstance.pay(); expect(checkout).not.toHaveBeenCalled();
 });
 it('retorno solo lee estado; requiere aceptación y simular confirmación es otra acción',()=>{
   const pending=new Subject<any>();const checkout=vi.fn<(...args:any[])=>any>(()=>pending);const fakeComplete=vi.fn(()=>of({offer:{...offer,status:'paid'},order:{id:1,provider:'fake',status:'paid'},purchaseId:77}));
   const f=fixture({offer:()=>of(offer),checkoutState:()=>of({offer,order:null,purchaseId:null}),checkout,fakeComplete,error:()=> 'Error'});const c=f.componentInstance;
   expect(fakeComplete).not.toHaveBeenCalled();c.pay();expect(checkout).not.toHaveBeenCalled();
   c.accepted.set(true);c.pay();c.pay();expect(checkout).toHaveBeenCalledTimes(1);expect(checkout.mock.calls[0][2]).toMatchObject({legalConsent:{accepted:true,documents:[{documentKey:'terms',documentVersion:'3'}]}});
   pending.next({order:{id:1,provider:'fake',status:'pending'},checkoutUrl:'http://localhost:4200/class-offers/10?checkout=fake'});c.completeFake();f.detectChanges();
   expect(c.purchaseId()).toBe(77);expect(c.payable()).toBe(false);expect(f.nativeElement.querySelector('a[href="/class-packages/77"]')).toBeTruthy();
 });
 it('red fallida e idioma conservan la clave de checkout y el snapshot aceptado',()=>{
   const checkout=vi.fn<(...args:any[])=>any>(()=>throwError(()=>new Error('network')));const f=fixture({offer:()=>of(offer),checkoutState:()=>of({offer,order:null,purchaseId:null}),checkout,error:()=> 'Error'});const c=f.componentInstance;
   c.accepted.set(true);c.pay();TestBed.inject(I18nService).setLocale('es');c.pay();expect(checkout.mock.calls[0][1]).toBe(checkout.mock.calls[1][1]);expect(c.offer()!.amount).toBe(9000);expect(c.accepted()).toBe(true);
 });
 it('AC03: mientras la compra está en curso el botón se deshabilita, muestra carga y un segundo clic no lanza otra compra',()=>{
   const pending=new Subject<any>();const checkout=vi.fn<(...args:any[])=>any>(()=>pending);
   const f=fixture({offer:()=>of(offer),checkoutState:()=>of({offer,order:null,purchaseId:null}),checkout,error:()=> 'Error'});const c=f.componentInstance;const root:HTMLElement=f.nativeElement;
   const button=()=>root.querySelector<HTMLButtonElement>('[data-testid="pay-button"]')!;
   c.accepted.set(true);f.detectChanges();expect(button().disabled).toBe(false);expect(root.querySelector('[data-testid="pay-loading"]')).toBeNull();
   button().click();f.detectChanges();
   expect(button().disabled).toBe(true);expect(button().getAttribute('aria-busy')).toBe('true');expect(root.querySelector('[data-testid="pay-loading"]')).toBeTruthy();
   button().click();c.pay();expect(checkout).toHaveBeenCalledTimes(1);
   pending.next({order:{id:1,provider:'fake',status:'pending'},checkoutUrl:null});f.detectChanges();
   expect(button().disabled).toBe(false);expect(root.querySelector('[data-testid="pay-loading"]')).toBeNull();
 });
 it('un link de pago vencido devuelve el intento como fallido y el siguiente clic usa una clave nueva',()=>{
   const checkout=vi.fn<(...args:any[])=>any>(()=>of({order:{id:1,provider:'hotmart',status:'failed'},checkoutUrl:null}));
   const f=fixture({offer:()=>of(offer),checkoutState:()=>of({offer,order:null,purchaseId:null}),checkout,error:()=> 'Error'});const c=f.componentInstance;
   c.accepted.set(true);c.pay();c.pay();expect(checkout).toHaveBeenCalledTimes(2);expect(checkout.mock.calls[0][1]).not.toBe(checkout.mock.calls[1][1]);
 });
});
