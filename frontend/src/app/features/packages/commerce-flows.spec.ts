import {TestBed} from '@angular/core/testing';
import {provideRouter,ActivatedRoute,Router} from '@angular/router';
import {of,Subject} from 'rxjs';
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
  const reviewRefund=vi.fn((..._args:unknown[])=>of(preview));TestBed.configureTestingModule({imports:[CommerceAdminComponent],providers:[...providers,{provide:AuthService,useValue:{currentUser:()=>null,hasPermission:(key:string)=>key==='class_payments.review'}},{provide:PackagesService,useValue:{refundRequests:()=>of([{...preview,reservationsPending:true,requests:[{id:3,status:'requested',reason:'Ficticio',updates:[]}]}]),paymentList:()=>of({items:[],events:[]}),paymentJobs:()=>of([]),reviewRefund,error:()=>''}}]});
  const f=TestBed.createComponent(CommerceAdminComponent);f.detectChanges();const c=f.componentInstance;c.reviewRefund(preview,3,'approve');expect(reviewRefund).not.toHaveBeenCalled();f.nativeElement.querySelector('#adminReason').value='Revisión ficticia';f.nativeElement.querySelector('#adminReason').dispatchEvent(new Event('input'));c.confirmed=true;f.changeDetectorRef.markForCheck();f.detectChanges();const approve=[...f.nativeElement.querySelectorAll('button')].find((b:any)=>b.textContent.includes(TestBed.inject(I18nService).t('packages.admin.approve'))) as HTMLButtonElement;expect(approve.disabled).toBe(true);
  c.reviewRefund(preview,3,'needs_information');expect(reviewRefund.mock.calls[0]).toEqual([3,{action:'needs_information',reason:'Revisión ficticia',quote:'server-quote'}]);
 });
});
