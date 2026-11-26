import {TestBed} from '@angular/core/testing';
import {provideRouter,ActivatedRoute,convertToParamMap} from '@angular/router';
import {of,throwError} from 'rxjs';
import {PurchasesComponent} from './purchases.component';
import {OfferDetailComponent} from './offer-detail.component';
import {RefundRequestComponent} from './refund-request.component';
import {PackagesService} from './packages.service';
import {AuthService} from '../../core/services/auth.service';
import {I18N_CATALOGS,I18nService} from '../../core/i18n/i18n.service';
import {PACKAGE_MESSAGES} from './packages.i18n';
import {ChatFormat} from '../chat/chat-format';
const zone={provide:ChatFormat,useValue:{timeZone:()=> 'America/Argentina/Cordoba'}};
const catalogs={provide:I18N_CATALOGS,multi:true,useValue:PACKAGE_MESSAGES};
const snap={nameEn:'Four sessions',nameEs:'Cuatro sesiones',sessionsCount:4,validityHours:2160,templateVersion:1,policyVersion:1,policy:{maxPauses:1,maxPauseHours:720,refundWindowHours:360,refundMode:'x'}};
const base={id:3,offerId:10,buyerId:4,teacherId:2,version:1,status:'active',expiresAt:'2027-02-23T00:00:00Z',paidAt:'2026-10-23T00:00:00Z',pausedAt:null,pauseCount:0,pausedHoursUsed:0,minutesPerSession:50,seatsCovered:1,balance:{granted:4,available:4,reserved:0,consumed:0,expired:0,refunded:0},snapshot:snap};

function purchases(purchase:object,changePurchase=vi.fn((..._a:unknown[])=>of({}))){
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({imports:[PurchasesComponent],providers:[provideRouter([]),catalogs,zone,
    {provide:ActivatedRoute,useValue:{snapshot:{data:{teacher:false}},paramMap:of(convertToParamMap({}))}},{provide:AuthService,useValue:{currentUser:()=>({id:4})}},
    {provide:PackagesService,useValue:{purchases:()=>of([{...base,...purchase}]),changePurchase,error:()=> 'Error'}}]});
  TestBed.inject(I18nService).setLocale('es');
  const f=TestBed.createComponent(PurchasesComponent);f.detectChanges();return {f,changePurchase,text:()=>(f.nativeElement.textContent as string).replace(/ /g,' ')};
}
const click=(f:{nativeElement:HTMLElement;detectChanges:()=>void},label:string)=>{const b=[...f.nativeElement.querySelectorAll('button')].find(x=>x.textContent?.includes(label)) as HTMLButtonElement;b.click();f.detectChanges();};

describe('W21 pausa (D3-DIN-14, D3-DIN-15)',()=>{
  it('pausar pide confirmación con las reglas y no llama hasta confirmar',()=>{
    const {f,changePurchase,text}=purchases({});
    click(f,'Pausar paquete');expect(changePurchase).not.toHaveBeenCalled();
    expect(text()).toContain('Puedes pausar una sola vez, hasta 30 días');expect(text()).toContain('se reanuda solo el');
    click(f,'Confirmar pausa');expect(changePurchase).toHaveBeenCalledTimes(1);
  });
  it('usada la única pausa, la tarjeta lo dice; pausada, explica cuándo se reanuda',()=>{
    expect(purchases({pauseCount:1}).text()).toContain('Ya usaste la pausa de este paquete.');
    const paused=purchases({status:'paused',pauseCount:1,pausedAt:new Date().toISOString()}).text();expect(paused).toContain('Pausado. Se reanuda solo el');expect(paused).not.toContain('Ya usaste la pausa');
  });
  it('si hay sesiones por resolver, se listan junto a la tarjeta con un enlace a la agenda',()=>{
    const changePurchase=vi.fn((..._a:unknown[])=>throwError(()=>({status:409,error:{code:'sessions_pending_resolution',params:{count:1,sessions:[{id:9,startsAt:'2026-12-02T15:00:00Z',status:'proposed'}]}}})));
    const {f,text}=purchases({},changePurchase);click(f,'Pausar paquete');click(f,'Confirmar pausa');
    expect(text()).toContain('Tienes 1 clase(s) por resolver');expect(text()).toContain('2 dic');expect(f.nativeElement.querySelector('a[href="/schedule"]')).toBeTruthy();
    expect(f.nativeElement.querySelector('.alert-danger')).toBeNull(); // no queda el aviso genérico arriba de la pantalla
  });
});

describe('W21 oferta, mensajes y reembolso',()=>{
  const offer=(status:string)=>({id:10,conversationId:9,amount:9000,currency:'USD',sessionsCount:4,minutesPerSession:50,seatsCovered:1,status,expiresAt:'2026-11-24T00:00:00Z',canCheckout:true,snapshot:{...snap,templateVersion:3,policy:{freeCancelHours:24,maxPauseHours:720,maxPauses:1,refundWindowHours:360},legalDocuments:[]}});
  function detail(status:string,order:object|null=null){
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({imports:[OfferDetailComponent],providers:[provideRouter([]),catalogs,zone,{provide:ActivatedRoute,useValue:{paramMap:of(convertToParamMap({id:'10'}))}},
      {provide:PackagesService,useValue:{offer:()=>of(offer(status)),checkoutState:()=>of({offer:offer(status),order,purchaseId:null}),error:()=> 'Error'}}]});
    TestBed.inject(I18nService).setLocale('es');
    const f=TestBed.createComponent(OfferDetailComponent);f.detectChanges();return f.nativeElement as HTMLElement;
  }
  it('D3-DIN-16: cancelada no habla de vencimiento ni ofrece actualizar; vencida lo dice en pasado',()=>{
    const cancelled=detail('cancelled');expect(cancelled.textContent).not.toContain('La oferta vence');expect(cancelled.textContent).not.toContain('Actualizar estado');
    const expired=detail('expired');expect(expired.textContent).toContain('La oferta venció');expect(expired.textContent).not.toContain('La oferta vence:');expect(expired.textContent).not.toContain('Actualizar estado');
    expect(detail('sent').textContent).toContain('Actualizar estado');
  });
  it('D3-DIN-16/21: la etiqueta sigue al pago: pendiente tras ir a pagar y en revisión si llegó con diferencias',()=>{
    expect(detail('sent',{id:1,status:'pending',provider:'fake'}).querySelector('.offer-status')?.textContent?.trim()).toBe('Pago pendiente');
    expect(detail('checkout_pending',{id:1,status:'paid_needs_review',provider:'fake'}).querySelector('.offer-status')?.textContent?.trim()).toBe('Pago en revisión');
    expect(detail('sent').querySelector('.offer-status')?.textContent?.trim()).toBe('Enviada — pendiente de pago');
  });
  it('D3-DIN-12 y D3-DIN-21: mensajes específicos por código',()=>{
    TestBed.configureTestingModule({providers:[catalogs]});TestBed.inject(I18nService).setLocale('es');const api=TestBed.inject(PackagesService);
    const err=(code:string,params={})=>({error:{code,params}});
    expect(api.error(err('insufficient_credit',{bucket:'consumed'}))).toBe('No hay clases consumidas para restaurar en esta compra.');
    expect(api.error(err('insufficient_credit',{bucket:'available'}))).toContain('créditos disponibles para retirar');
    expect(api.error(err('offer_payment_in_review'))).toContain('pago en revisión');
  });
  it('D3-DIN-17: con el reembolso confirmado desaparecen los textos de «a revisar» y la solicitud se identifica por fecha',()=>{
    const view={purchaseId:5,orderId:8,provider:'fake',version:2,amount:5000,currency:'USD',orderStatus:'refunded',refundedAmount:5000,deadline:'2026-11-06T12:00:00Z',deadlineVerified:false,classification:'standard_full_unused',reservationsPending:false,consumed:0,available:0,reserved:0,type:'voluntary',quote:'q',
      requests:[{id:4,type:'voluntary',classification:'standard_full_unused',reason:'Ficticio',createdAt:'2026-11-25T21:30:00Z',amount:5000,currency:'USD',status:'confirmed',updates:[]}]};
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({imports:[RefundRequestComponent],providers:[provideRouter([]),catalogs,zone,{provide:PackagesService,useValue:{refundPreview:()=>of(view),error:()=> 'Error'}}]});
    TestBed.inject(I18nService).setLocale('es');
    const f=TestBed.createComponent(RefundRequestComponent);f.componentRef.setInput('purchaseId',5);f.componentRef.setInput('hours',360);f.detectChanges();
    const text=(f.nativeElement.textContent as string).replace(/ /g,' ');
    expect(text).toContain('Reembolso confirmado por el proveedor. USD 50,00');expect(text).toContain('Solicitud del 25 nov');
    for(const old of ['Importe total de compra a revisar','Corresponde trámite estándar','no significa dinero devuelto','Disponibles: 0','#4'])expect(text).not.toContain(old);
  });
});
