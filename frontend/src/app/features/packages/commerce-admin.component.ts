import {Component,OnInit,DestroyRef,computed,inject,signal} from '@angular/core';
import {FormsModule} from '@angular/forms';
import {Observable} from 'rxjs';
import {takeUntilDestroyed} from '@angular/core/rxjs-interop';
import {TranslatePipe} from '../../core/i18n/translate.pipe';
import {I18nService} from '../../core/i18n/i18n.service';
import {AuthService} from '../../core/services/auth.service';
import {ChatFormat} from '../chat/chat-format';
import {PackagesService} from './packages.service';
import {ClassOrder,ClassPurchase,ClassSettings,RefundPreview,PaymentJob} from './packages.model';
@Component({selector:'app-commerce-admin',standalone:true,imports:[FormsModule,TranslatePipe],template:`
<div class="page-container"><h1>{{'packages.admin.title'|t}}</h1>
<p>{{'packages.admin.realBlocked'|t}}</p>
@if(error()){<p class="alert alert-danger" role="alert">{{error()}}</p>}
@if(saved()){<p role="status">{{'packages.admin.saved'|t}}</p>}
@if(can('class_payments.review')||can('class_credits.adjust')){
  <label for="adminReason" class="form-label">{{'packages.offer.cancelReason'|t}}</label><textarea id="adminReason" class="form-control" maxlength="500" [(ngModel)]="reason"></textarea>
  <label class="d-block my-2"><input type="checkbox" [(ngModel)]="confirmed"> {{'packages.admin.confirm'|t}}</label>
}
@if(can('class_payments.review')){
<h2 class="h4 mt-4">{{'packages.refund.title'|t}}</h2>
@for(v of refunds();track v.purchaseId){@for(r of v.requests;track r.id){<article class="card p-3 mb-2">
  <h3 class="h5">#{{r.id}} · {{'packages.admin.purchase'|t}} #{{v.purchaseId}}</h3>
  <p>{{'packages.refund.amount'|t:{amount:i18n.formatMoney(v.amount,v.currency)} }}</p><p>{{('packages.refund.'+v.classification)|t}}</p>
  <p>{{'packages.refund.deadline'|t:{time:i18n.formatInstant(v.deadline,fmt.timeZone()),kind:('packages.refund.'+(v.deadlineVerified?'verified':'calculated')|t)} }}</p>
  <p>{{'packages.refund.breakdown'|t:{available:v.available,reserved:v.reserved,consumed:v.consumed} }}</p>
  <p>{{('packages.refund.type.'+r.type)|t}}: {{r.reason}} · {{('packages.refund.status.'+r.status)|t}}</p>
  @for(u of r.updates;track $index){<p>{{i18n.formatInstant(u.createdAt,fmt.timeZone())}} · {{('packages.refund.status.'+u.status)|t}} · {{u.reason}}</p>}
  @if(v.reservationsPending){<p>{{'packages.refund.reservations'|t}}</p>}
  @if(r.status!=='confirmed'){
    <button class="btn btn-outline-danger me-2" [disabled]="!ready()||v.reservationsPending||r.status==='queued'||r.status==='manual_hotmart'" (click)="reviewRefund(v,r.id,'approve')">{{'packages.admin.approve'|t}}</button>
    <button class="btn btn-secondary me-2" [disabled]="!ready()" (click)="reviewRefund(v,r.id,'needs_information')">{{'packages.admin.information'|t}}</button>
    <button class="btn btn-secondary" [disabled]="!ready()" (click)="reviewRefund(v,r.id,'manual_update')">{{'packages.admin.followup'|t}}</button>
    @if(r.status==='queued'&&v.provider==='fake'){<p>{{'packages.payment.fakeNote'|t}}</p><button class="btn btn-secondary" [disabled]="busy()" (click)="fake(v.orderId)">{{'packages.admin.fakeRefund'|t}}</button>}
  }
</article>}}
<h2 class="h4 mt-4">{{'packages.admin.payments'|t}}</h2>
<label for="paymentFilter">{{'packages.admin.filter'|t}}</label><select id="paymentFilter" class="form-select" [(ngModel)]="filter" (ngModelChange)="loadPayments()">@for(s of statuses;track s){<option [value]="s">{{('packages.payment.'+s)|t}}</option>}</select>
@for(o of orders();track o.id){<article class="border p-2 my-2"><p>#{{o.id}} · {{i18n.formatMoney(o.amount,o.currency)}} · {{('packages.payment.'+o.status)|t}}</p><p>{{o.reviewReason}}</p>@if(o.reportedAmount!=null&&o.reportedCurrency){<p>{{'packages.admin.reported'|t:{amount:i18n.formatMoney(o.reportedAmount!,o.reportedCurrency!)} }}</p>}<p>{{o.providerTransactionId}} · {{o.providerProductId}} · {{o.providerOfferCode}}</p><span>{{'packages.offer.open'|t}} #{{o.offerId}}</span>
@if(o.status==='paid_needs_review'){<button class="btn btn-primary ms-2" [disabled]="!ready()" (click)="resolve(o,'credit')">{{'packages.admin.credit'|t}}</button>}
@if(o.status==='paid'||o.status==='paid_needs_review'){<button class="btn btn-outline-danger ms-2" [disabled]="!ready()" (click)="resolve(o,'refund')">{{'packages.admin.approve'|t}}</button>}
</article>}
@for(e of events();track e.id){<p>{{'packages.admin.unmatched'|t}} #{{e.id}} · {{e.eventType}} · {{i18n.formatInstant(e.createdAt,fmt.timeZone())}}</p>}
<h2 class="h4 mt-4">{{'packages.admin.jobs'|t}}</h2>@if(jobsFailed()){<p class="alert alert-danger" role="alert">{{'packages.admin.jobsError'|t}}</p>}@for(j of jobs();track j.id){<article class="border p-2 my-2"><p>#{{j.id}} · {{j.topic}} · #{{j.aggregateId}} · {{('packages.admin.job.'+j.status)|t}} ({{j.attempts}})</p><p>{{j.lastError}}</p>@for(id of j.purchaseIds;track id){<button class="btn btn-secondary me-2" (click)="purchaseId=id;loadPurchase()">{{'packages.admin.purchase'|t}} #{{id}}</button>}@if(j.topic.startsWith('review.')){<button class="btn btn-secondary" [disabled]="!ready()" (click)="acknowledge(j.id)">{{'packages.admin.acknowledge'|t}}</button>}@if(j.status==='failed'){<button class="btn btn-secondary" [disabled]="!ready()" (click)="retry(j.id)">{{'packages.admin.retry'|t}}</button>}</article>}@empty{@if(!jobsFailed()){<p>{{'packages.admin.jobsEmpty'|t}}</p>}}
}
@if(can('class_teachers.manage')){<h2 class="h4 mt-4">{{'packages.admin.teachers'|t}}</h2>@for(t of teachers();track t.id){<p>{{t.name}} · {{(t.settings?.classesEnabledAt?'packages.admin.enabled':'packages.admin.disabled')|t}} <button class="btn btn-secondary ms-2" [disabled]="busy()" (click)="enable(t.id,!t.settings?.classesEnabledAt)">{{(t.settings?.classesEnabledAt?'packages.admin.disable':'packages.admin.enable')|t}}</button></p>}}
@if(can('class_packages.manage_all')&&policy();as p){<h2 class="h4 mt-4">{{'packages.admin.policy'|t}} · v{{p.version}}</h2><p>{{'packages.catalog.immutable'|t}}</p>
<label for="policyHours">{{'packages.admin.guarantee'|t}}</label><input id="policyHours" class="form-control" type="number" min="360" step="1" [(ngModel)]="refundHours">
<label for="policyPause">{{'packages.admin.pauseHours'|t}}</label><input id="policyPause" class="form-control" type="number" min="0" step="1" [(ngModel)]="pauseHours">
<label for="policyTtl">{{'packages.admin.ttl'|t}}</label><input id="policyTtl" class="form-control" type="number" min="1" step="1" [(ngModel)]="ttlHours">
<button class="btn btn-primary mt-2" [disabled]="busy()" (click)="publishPolicy()">{{'packages.save'|t}}</button>}
@if(can('class_credits.adjust')||can('class_payments.review')){<h2 class="h4 mt-4">{{'packages.admin.adjust'|t}}</h2>
<label for="adjustPurchase">{{'packages.admin.purchase'|t}}</label><input id="adjustPurchase" class="form-control" type="number" min="1" [(ngModel)]="purchaseId"><button class="btn btn-secondary mt-2" [disabled]="busy()" (click)="loadPurchase()">{{'packages.admin.load'|t}}</button>
@if(purchase();as p){<p>#{{p.id}} · {{'packages.refund.breakdown'|t:{available:p.balance.available,reserved:p.balance.reserved,consumed:p.balance.consumed} }}</p>
@if(can('class_payments.review')){<label for="verifiedDeadline">{{'packages.admin.verifiedDeadline'|t}}</label><input id="verifiedDeadline" class="form-control" placeholder="2026-11-30T14:00:00Z" [(ngModel)]="deadline"><button class="btn btn-secondary my-2" [disabled]="!ready()||!deadline.trim()" (click)="verifyDeadline()">{{'packages.admin.verifyDeadline'|t}}</button>}
@if(can('class_credits.adjust')){<label for="adjustDirection">{{'packages.admin.direction'|t}}</label><select id="adjustDirection" class="form-select" [(ngModel)]="direction">@for(d of directions;track d){<option [value]="d">{{('packages.admin.adjust.'+d)|t}}</option>}</select><label for="adjustUnits">{{'packages.admin.units'|t}}</label><input id="adjustUnits" class="form-control" type="number" min="1" [(ngModel)]="units"><button class="btn btn-outline-danger mt-2" [disabled]="!ready()||units<1" (click)="adjust()">{{'packages.admin.confirmAdjust'|t}}</button>}}
}
<button class="btn btn-secondary mt-4" [disabled]="busy()" (click)="load()">{{'packages.offer.refresh'|t}}</button>
</div>`})
export class CommerceAdminComponent implements OnInit{
  private api=inject(PackagesService);private auth=inject(AuthService);private destroy=inject(DestroyRef);readonly i18n=inject(I18nService);readonly fmt=inject(ChatFormat);
  refunds=signal<RefundPreview[]>([]);orders=signal<ClassOrder[]>([]);events=signal<{id:number;orderId:number|null;eventType:string;createdAt:string}[]>([]);jobs=signal<PaymentJob[]>([]);jobsFailed=signal(false);teachers=signal<{id:number;name:string;settings:ClassSettings|null}[]>([]);policy=signal<{version:number;rules:Record<string,unknown>}|null>(null);purchase=signal<ClassPurchase|null>(null);
  busy=signal(false);saved=signal(false);private failure=signal<unknown>(null);error=computed(()=>this.failure()?this.api.error(this.failure()):'');
  reason='';deadline='';confirmed=false;filter='paid_needs_review';refundHours=360;pauseHours=720;ttlHours=168;purchaseId=0;direction='add';units=1;private adjustKey=crypto.randomUUID();private adjustAttempt='';
  readonly statuses=['paid_needs_review','paid','partially_refunded','refunded','pending','failed'];readonly directions=['add','remove','restore'];
  ngOnInit(){this.load();}can(p:string){return this.auth.hasPermission(p);}ready(){return !this.busy()&&this.confirmed&&Boolean(this.reason.trim());}
  private read<T>(o:Observable<T>,next:(v:T)=>void){o.pipe(takeUntilDestroyed(this.destroy)).subscribe({next,error:e=>this.failure.set(e)});}
  load(){if(this.can('class_payments.review')){this.read(this.api.refundRequests(),v=>this.refunds.set(v));this.loadPayments();this.jobsFailed.set(false);this.api.paymentJobs().pipe(takeUntilDestroyed(this.destroy)).subscribe({next:v=>this.jobs.set(v),error:()=>this.jobsFailed.set(true)});}if(this.can('class_teachers.manage'))this.read(this.api.teachers(),v=>this.teachers.set(v));if(this.can('class_packages.manage_all'))this.read(this.api.policies(),v=>{this.policy.set(v[0]||null);if(v[0]){this.refundHours=Math.max(360,Number(v[0].rules['refundWindowHours']));this.pauseHours=Number(v[0].rules['maxPauseHours']);this.ttlHours=Number(v[0].rules['offerTtlHours']);}});}
  loadPayments(){this.read(this.api.paymentList(this.filter),v=>{this.orders.set(v.items);this.events.set(v.events);});}
  private act<T>(o:Observable<T>,done?:(v:T)=>void){if(this.busy())return;this.busy.set(true);this.saved.set(false);this.failure.set(null);o.pipe(takeUntilDestroyed(this.destroy)).subscribe({next:v=>{done?.(v);this.busy.set(false);this.saved.set(true);this.confirmed=false;this.load();},error:e=>{this.busy.set(false);this.failure.set(e);}});}
  reviewRefund(v:RefundPreview,id:number,action:string){if(this.ready())this.act(this.api.reviewRefund(id,{action,reason:this.reason.trim(),quote:v.quote}));}
  resolve(o:ClassOrder,action:string){if(this.ready())this.act(this.api.resolvePayment(o.id,action,this.reason.trim()));}
  acknowledge(id:number){if(this.ready())this.act(this.api.acknowledgePaymentJob(id,this.reason.trim()));}
  verifyDeadline(){const p=this.purchase();if(p&&this.ready())this.act(this.api.verifyRefundDeadline(p.id,this.deadline.trim(),this.reason.trim()));}
  retry(id:number){if(this.ready())this.act(this.api.retryPaymentJob(id,this.reason.trim()));}
  fake(id:number){this.act(this.api.fakeRefundComplete(id));}
  enable(id:number,enabled:boolean){this.act(this.api.enableTeacher(id,enabled));}
  publishPolicy(){const p=this.policy();if(p)this.act(this.api.createPolicy({version:p.version+1,rules:{...p.rules,refundMode:'full_unused_then_review',refundWindowHours:this.refundHours,maxPauseHours:this.pauseHours,offerTtlHours:this.ttlHours}}));}
  loadPurchase(){this.purchase.set(null);this.read(this.api.adjustmentPurchase(this.purchaseId),p=>{this.purchase.set(p);this.adjustKey=crypto.randomUUID();this.adjustAttempt='';});}
  adjust(){const p=this.purchase();if(!p||!this.ready())return;const body={version:p.version,units:this.units,direction:this.direction,reason:this.reason.trim()};const request=JSON.stringify(body);if(this.adjustAttempt&&this.adjustAttempt!==request)this.adjustKey=crypto.randomUUID();this.adjustAttempt=request;this.act(this.api.adjustPurchase(p.id,body,this.adjustKey),v=>{this.purchase.set(v);this.adjustKey=crypto.randomUUID();this.adjustAttempt='';});}
}
