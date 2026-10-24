import {TestBed} from '@angular/core/testing';
import {provideRouter,ActivatedRoute,Router} from '@angular/router';
import {of,Subject,throwError} from 'rxjs';
import {RefundRequestComponent} from './refund-request.component';
import {CommerceAdminComponent} from './commerce-admin.component';
import {OfferCreateComponent} from './offer-create.component';
import {PackagesService} from './packages.service';
import {ChatService} from '../../core/services/chat.service';
import {AuthService} from '../../core/services/auth.service';
import {I18N_CATALOGS,I18nService} from '../../core/i18n/i18n.service';
import {PACKAGE_MESSAGES} from './packages.i18n';
import {RefundPreview,PackageTemplate} from './packages.model';
const preview:RefundPreview={purchaseId:5,orderId:8,provider:'fake',version:2,amount:9000,currency:'USD',orderStatus:'paid',refundedAmount:0,deadline:'2026-11-06T12:00:00Z',deadlineVerified:false,classification:'standard_full_unused',reservationsPending:false,consumed:0,available:4,reserved:0,type:'voluntary',quote:'server-quote',requests:[]};
const providers=[provideRouter([]),{provide:I18N_CATALOGS,multi:true,useValue:PACKAGE_MESSAGES}];
describe('W05 solicitud de reembolso',()=>{
 it('confirma desglose, conserva razón/cotización al cambiar idioma y reintenta con la misma clave sin mostrar dinero devuelto',()=>{
  const pending=new Subject<RefundPreview>();const requestRefund=vi.fn((..._args:unknown[])=>pending);TestBed.configureTestingModule({imports:[RefundRequestComponent],providers:[...providers,{provide:PackagesService,useValue:{refundPreview:()=>of(preview),requestRefund,error:()=> 'Error'}}]});
  const f=TestBed.createComponent(RefundRequestComponent);f.componentRef.setInput('purchaseId',5);f.componentRef.setInput('hours',360);f.componentRef.setInput('mode','full_unused_then_review');f.detectChanges();const c=f.componentInstance;
  c.reason.set('Consulta humana original');c.send();expect(requestRefund).not.toHaveBeenCalled();c.confirmed.set(true);c.send();c.send();expect(requestRefund).toHaveBeenCalledTimes(1);
  const body=requestRefund.mock.calls[0];expect(body[1]).toMatchObject({quote:'server-quote',version:2,reason:'Consulta humana original'});TestBed.inject(I18nService).setLocale('es');f.detectChanges();expect(c.reason()).toBe('Consulta humana original');expect(f.nativeElement.textContent).toContain('sin verificar con Hotmart');
  pending.error({error:{code:'network_error'}});c.send();expect(requestRefund.mock.calls[1][2]).toBe(body[2]);
 });
 it('seguimiento distingue solicitud, aprobación y confirmación del proveedor',()=>{
  const request={id:9,reason:'Motivo original',createdAt:'2026-10-22T12:00:00Z',type:'voluntary',classification:'standard_full_unused',amount:9000,currency:'USD',status:'queued',updates:[]};
  TestBed.configureTestingModule({imports:[RefundRequestComponent],providers:[...providers,{provide:PackagesService,useValue:{refundPreview:()=>of({...preview,requests:[request]}),error:()=> 'Error'}}]});const f=TestBed.createComponent(RefundRequestComponent);f.componentRef.setInput('purchaseId',5);f.componentRef.setInput('hours',360);f.detectChanges();expect(f.nativeElement.querySelector('textarea')).toBeNull();expect(f.nativeElement.textContent).toContain(TestBed.inject(I18nService).t('packages.refund.status.queued'));
 });
});
describe('W05 ofertas grupales',()=>{
 it('grupo de dos envía ambas identidades y comprador elegido sin editar precio',()=>{
  const item={id:1,status:'active',current:{id:11,modality:'group',billing:'per_group',seatsCovered:2,priceAmount:3000,currency:'USD'},policy:{rules:{refundWindowHours:360}}} as PackageTemplate;const sendOffer=vi.fn((..._args:unknown[])=>of({id:4}));
  TestBed.configureTestingModule({imports:[OfferCreateComponent],providers:[...providers,{provide:ActivatedRoute,useValue:{snapshot:{queryParamMap:new Map([['conversationId','7'],['cohortId','3']])}}},{provide:PackagesService,useValue:{list:()=>of([item]),group:()=>of({id:3,templateVersionId:11,members:[{userId:2},{userId:9}]}),sendOffer,error:()=>''}},{provide:ChatService,useValue:{get:()=>of({counterpart:{id:2,name:'Comprador ficticio'}})}}]});
  vi.spyOn(TestBed.inject(Router),'navigate').mockResolvedValue(true);const f=TestBed.createComponent(OfferCreateComponent);f.detectChanges();f.componentInstance.send();expect(sendOffer.mock.calls[0][1]).toEqual({templateVersionId:11,cohortId:3,beneficiaryIds:[2,9]});
 });
});
describe('W05 revisión comercial',()=>{
 it('requiere confirmación y motivo; reserva impide aprobación en la pantalla',()=>{
  const reviewRefund=vi.fn((..._args:unknown[])=>of(preview));TestBed.configureTestingModule({imports:[CommerceAdminComponent],providers:[...providers,{provide:AuthService,useValue:{currentUser:()=>null,hasPermission:(key:string)=>key==='class_payments.review'}},{provide:PackagesService,useValue:{providerState:()=>throwError(()=>({status:403})),refundRequests:()=>of([{...preview,reservationsPending:true,requests:[{id:3,status:'requested',reason:'Ficticio',updates:[]}]}]),paymentList:()=>of({items:[],events:[]}),paymentJobs:()=>of([]),reviewRefund,error:()=>''}}]});
  const f=TestBed.createComponent(CommerceAdminComponent);f.detectChanges();const c=f.componentInstance;c.reviewRefund(preview,3,'approve');expect(reviewRefund).not.toHaveBeenCalled();f.nativeElement.querySelector('#adminReason').value='Revisión ficticia';f.nativeElement.querySelector('#adminReason').dispatchEvent(new Event('input'));c.confirmed=true;f.changeDetectorRef.markForCheck();f.detectChanges();const approve=[...f.nativeElement.querySelectorAll('button')].find((b:any)=>b.textContent.includes(TestBed.inject(I18nService).t('packages.admin.approve'))) as HTMLButtonElement;expect(approve.disabled).toBe(true);
  c.reviewRefund(preview,3,'needs_information');expect(reviewRefund.mock.calls[0]).toEqual([3,{action:'needs_information',reason:'Revisión ficticia',quote:'server-quote'}]);
 });
});
describe('W05 proveedor verificado y órdenes congeladas',()=>{
 const frozen={id:21,offerId:1,provider:'hotmart',status:'paid_needs_review',amount:9000,currency:'USD',reviewReason:'refund_amount_review',frozenFromStatus:'active',purchaseStatus:'active',unitsAvailable:3,unitsReserved:1,unitsConsumed:2};
 const setup=(opts:{state?:unknown;orders?:unknown[];perms?:string[];providerError?:boolean}={})=>{
  const api={providerState:vi.fn(()=>opts.providerError?throwError(()=>({status:403})):of(opts.state)),verifyProvider:vi.fn((..._a:unknown[])=>of({})),revokeProvider:vi.fn((..._a:unknown[])=>of({})),resolvePayment:vi.fn((..._a:unknown[])=>of({})),
   refundRequests:()=>of([]),paymentList:()=>of({items:opts.orders||[],events:[]}),paymentJobs:()=>of([]),error:()=>''};
  TestBed.configureTestingModule({imports:[CommerceAdminComponent],providers:[...providers,{provide:AuthService,useValue:{currentUser:()=>null,hasPermission:(k:string)=>(opts.perms||['class_payments.review']).includes(k)}},{provide:PackagesService,useValue:api}]});
  const f=TestBed.createComponent(CommerceAdminComponent);f.detectChanges();return {f,c:f.componentInstance,api,el:f.nativeElement as HTMLElement,t:(k:string,p?:Record<string,string|number>)=>TestBed.inject(I18nService).t(k,p)};
 };
 it('muestra los tres modos y oculta la tarjeta si el estado da 403',()=>{
  const fake=setup({state:{mode:'fake',verification:null,lastRevocation:null}});expect(fake.el.querySelector('[data-test=provider-mode]')!.textContent).toContain(fake.t('packages.admin.provider.mode.fake'));
  TestBed.resetTestingModule();const blocked=setup({state:{mode:'blocked',verification:null,lastRevocation:{id:1,revokedAt:'2026-10-20T12:00:00Z',revokedBy:{id:2,name:'Ana'},reason:'Cambio de cuenta',verifiedAt:'2026-10-10T12:00:00Z'}}});
  expect(blocked.el.querySelector('[data-test=provider-mode]')!.textContent).toContain(blocked.t('packages.admin.provider.mode.blocked'));expect(blocked.el.querySelector('[data-test=provider-revoked]')!.textContent).toContain('Ana');expect(blocked.el.querySelector('[data-test=provider-revoked]')!.textContent).toContain('Cambio de cuenta');
  TestBed.resetTestingModule();const ver=setup({state:{mode:'verified',verification:{id:3,verifiedAt:'2026-10-21T12:00:00Z',verifiedBy:{id:2,name:'Ana'},guaranteeDays:21,checks:{},reason:'Todo revisado'},lastRevocation:null}});
  const txt=ver.el.querySelector('[data-test=provider-card]')!.textContent!;expect(txt).toContain('Ana');expect(txt).toContain('21');expect(txt).toContain('Todo revisado');expect(txt).toContain(ver.t('packages.admin.provider.revokeOpen'));expect(txt).not.toContain(ver.t('packages.admin.provider.verifyOpen'));
  TestBed.resetTestingModule();const none=setup({providerError:true});expect(none.el.querySelector('[data-test=provider-card]')).toBeNull();
 });
 it('verificar exige 4 casillas, garantía y motivo, y envía el cuerpo exacto',()=>{
  const {c,api}=setup({state:{mode:'blocked',verification:null,lastRevocation:null}});c.verifyOpen.set(true);
  c.verifyProvider();expect(api.verifyProvider).not.toHaveBeenCalled();
  c.vChecks={account:true,format:true,guarantee:true,mapping:false};c.vDays=15;c.vReason='ok';c.verifyProvider();expect(api.verifyProvider).not.toHaveBeenCalled();
  c.vChecks['mapping']=true;c.vDays=null;expect(c.verifyReady()).toBe(false);c.vDays=15;c.vReason='  ';expect(c.verifyReady()).toBe(false);
  c.vReason='  Cuenta revisada  ';c.verifyProvider();expect(api.verifyProvider).toHaveBeenCalledTimes(1);
  expect(api.verifyProvider.mock.calls[0][0]).toEqual({checks:{account:true,format:true,guarantee:true,mapping:true},guaranteeDays:15,reason:'Cuenta revisada'});
 });
 it('revocar exige motivo y confirmación',()=>{
  const {c,api}=setup({state:{mode:'verified',verification:{id:3,verifiedAt:'2026-10-21T12:00:00Z',verifiedBy:{id:2,name:'Ana'},guaranteeDays:7,checks:{},reason:'x'},lastRevocation:null}});
  c.revokeProvider();c.rReason='Motivo';c.revokeProvider();expect(api.revokeProvider).not.toHaveBeenCalled();c.rConfirmed=true;c.revokeProvider();expect(api.revokeProvider.mock.calls[0]).toEqual(['Motivo']);
 });
 it('orden congelada ofrece confirmar y descongelar con el cuerpo correcto; sin frozenFromStatus no descongela',()=>{
  const {c,api,el,t}=setup({state:{mode:'fake',verification:null,lastRevocation:null},orders:[frozen,{...frozen,id:22,frozenFromStatus:null},{id:23,provider:'hotmart',status:'paid_needs_review',amount:5000,currency:'USD',reviewReason:'manual'}]});
  const txt=el.textContent!;expect(txt).toContain(t('packages.admin.provider.frozen.refund_amount_review'));expect(txt).toContain(t('packages.admin.provider.purchaseStatus.active'));expect(txt).toContain('3');expect(txt).toContain(t('packages.admin.provider.unfreezeLegacy'));
  const btn=(label:string)=>[...el.querySelectorAll('button')].filter(b=>b.textContent!.includes(label)) as HTMLButtonElement[];
  expect(btn(t('packages.admin.provider.confirmRefund')).length).toBe(2);expect(btn(t('packages.admin.provider.unfreeze')).length).toBe(2);expect(btn(t('packages.admin.credit')).length).toBe(1);
  expect(btn(t('packages.admin.provider.unfreeze'))[1].disabled).toBe(true);
  const o=c.orders()[0];c.reason='Falsa alarma';c.confirmed=true;
  c.resolve(o,'unfreeze');expect(api.resolvePayment.mock.calls[0]).toEqual([21,'unfreeze','Falsa alarma']);
  c.confirmed=true;c.confirmRefund(o);expect(api.resolvePayment.mock.calls[1]).toEqual([21,'confirm_refund','Falsa alarma',undefined]);
  c.confirmed=true;c.refundInputs[21]='45,50';c.confirmRefund(o);expect(api.resolvePayment.mock.calls[2]).toEqual([21,'confirm_refund','Falsa alarma',4550]);
  c.confirmed=true;c.refundInputs[21]='90.01';expect(c.refundInvalid(o)).toBe(true);c.refundInputs[21]='0';expect(c.refundInvalid(o)).toBe(true);
 });
});
