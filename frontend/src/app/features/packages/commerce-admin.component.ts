import {Component,OnInit,DestroyRef,computed,inject,signal} from '@angular/core';
import {FormsModule} from '@angular/forms';
import {Observable} from 'rxjs';
import {takeUntilDestroyed} from '@angular/core/rxjs-interop';
import {TranslatePipe} from '../../core/i18n/translate.pipe';
import {I18nService} from '../../core/i18n/i18n.service';
import {AuthService} from '../../core/services/auth.service';
import {ChatFormat} from '../chat/chat-format';
import {PackagesService} from './packages.service';
import {ClassOrder,ClassPurchase,ClassSettings,RefundPreview,PaymentJob,ClassProviderState,isFrozenOrder} from './packages.model';
@Component({selector:'app-commerce-admin',standalone:true,imports:[FormsModule,TranslatePipe],
styles:[`.commerce{max-width:960px}.block{margin:var(--spacing-md) 0}.block-title{margin:0 0 var(--spacing-xs);font-size:1.125rem}.sub-title{margin:var(--spacing-md) 0 var(--spacing-sm);font-size:.9375rem;font-weight:700}.notice{margin:var(--spacing-xs) 0 0;font-size:.8125rem;color:var(--color-text-light);overflow-wrap:anywhere}.item{margin:var(--spacing-sm) 0;padding:var(--spacing-md);border:1px solid var(--color-border);border-radius:var(--radius-md);background:var(--color-bg)}.item-head{display:flex;align-items:flex-start;justify-content:space-between;gap:var(--spacing-sm)}.item-head h4,.item-head h3{margin:0;font-size:1rem}.item p{margin:var(--spacing-xs) 0 0}.item-actions{display:flex;flex-wrap:wrap;gap:var(--spacing-sm);margin-top:var(--spacing-sm)}.empty{padding:var(--spacing-md);border:1px dashed var(--color-border);border-radius:var(--radius-md);background:var(--color-bg-light)}.empty p{margin:0 0 var(--spacing-sm)}.badge-status{flex:none;white-space:normal}.status-success{background:var(--color-success-soft);color:var(--color-success-text)}.status-warning{background:var(--color-warning-soft);color:#6b4a00}.status-danger{background:var(--color-danger-soft);color:var(--color-danger)}.status-neutral{background:var(--color-bg-dark);color:var(--color-text-light)}@media (max-width:480px){.item-actions .btn{flex:1 1 auto}}`],
template:`
<div class="page-container commerce"><h1>{{'packages.admin.title'|t}}</h1>
<p class="notice">{{'packages.admin.realBlocked'|t}}</p>
@if(error()){<p class="alert alert-danger mt-3" role="alert">{{error()}}</p>}
@if(saved()){<p class="alert alert-success mt-3" role="status">{{'packages.admin.saved'|t}}</p>}
@if(provider();as pv){
<section class="surface block" aria-labelledby="adminProviderTitle" data-test="provider-card">
  <h2 id="adminProviderTitle" class="block-title">{{'packages.pv.title'|t}}</h2>
  <p data-test="provider-mode"><span class="badge-status badge-status--dot status-{{pv.mode==='verified'?'success':pv.mode==='blocked'?'warning':'neutral'}}">{{('packages.pv.mode.'+pv.mode)|t:{name:pv.verification?.verifiedBy?.name||'—',date:pv.verification?i18n.formatInstant(pv.verification.verifiedAt,fmt.timeZone()):'',days:pv.verification?.guaranteeDays||''} }}</span></p>
  @if(pv.verification){<p class="notice">{{'packages.pv.verifiedReason'|t:{reason:pv.verification.reason} }}</p>}
  @if(pv.lastRevocation;as lr){<p class="notice" data-test="provider-revoked">{{'packages.pv.revoked'|t:{name:revoker(lr),date:i18n.formatInstant(lr.revokedAt,fmt.timeZone()),reason:lr.reason} }}</p>}
  @if(pv.mode!=='verified'&&!verifyOpen()){<div class="item-actions"><button type="button" class="btn btn-primary" (click)="verifyOpen.set(true)">{{'packages.pv.verifyOpen'|t}}</button></div>}
  @if(pv.mode!=='verified'&&verifyOpen()){<form class="item" (ngSubmit)="verifyProvider()" aria-labelledby="providerVerifyTitle">
    <h3 id="providerVerifyTitle" class="sub-title">{{'packages.pv.verifyTitle'|t}}</h3>
    @for(k of checkKeys;track k){<label class="d-block mt-2"><input type="checkbox" [name]="'check_'+k" [(ngModel)]="vChecks[k]"> {{('packages.pv.check.'+k)|t}}</label>}
    <label for="providerDays" class="form-label mt-2">{{'packages.pv.guaranteeDays'|t}}</label><select id="providerDays" name="days" class="form-select" [(ngModel)]="vDays"><option [ngValue]="null">{{'packages.pv.guaranteeChoose'|t}}</option>@for(d of guaranteeOptions;track d){<option [ngValue]="d">{{'packages.pv.days'|t:{days:d} }}</option>}</select>
    <label for="providerReason" class="form-label mt-2">{{'packages.pv.reason'|t}}</label><textarea id="providerReason" name="reason" class="form-control" maxlength="500" [(ngModel)]="vReason"></textarea>
    <p class="notice">{{'packages.pv.verifyWarn'|t}}</p>
    <div class="item-actions"><button type="submit" class="btn btn-primary" [disabled]="!verifyReady()">{{'packages.pv.verifySubmit'|t}}</button><button type="button" class="btn btn-secondary" (click)="verifyOpen.set(false)">{{'packages.pv.cancel'|t}}</button></div>
  </form>}
  @if(pv.mode==='verified'&&!revokeOpen()){<div class="item-actions"><button type="button" class="btn btn-outline-danger" (click)="revokeOpen.set(true)">{{'packages.pv.revokeOpen'|t}}</button></div>}
  @if(pv.mode==='verified'&&revokeOpen()){<form class="item" (ngSubmit)="revokeProvider()" aria-labelledby="providerRevokeTitle">
    <h3 id="providerRevokeTitle" class="sub-title">{{'packages.pv.revokeTitle'|t}}</h3>
    <label for="providerRevokeReason" class="form-label">{{'packages.pv.reason'|t}}</label><textarea id="providerRevokeReason" name="rreason" class="form-control" maxlength="500" [(ngModel)]="rReason"></textarea>
    <label class="d-block mt-2"><input type="checkbox" name="rconfirm" [(ngModel)]="rConfirmed"> {{'packages.pv.revokeConfirm'|t}}</label>
    <p class="notice">{{'packages.pv.revokeWarn'|t}}</p>
    <div class="item-actions"><button type="submit" class="btn btn-outline-danger" [disabled]="!revokeReady()">{{'packages.pv.revokeSubmit'|t}}</button><button type="button" class="btn btn-secondary" (click)="revokeOpen.set(false)">{{'packages.pv.cancel'|t}}</button></div>
  </form>}
</section>
}
@if(can('class_payments.review')||can('class_credits.adjust')){
<section class="surface block" aria-labelledby="adminConfirmTitle">
  <h2 id="adminConfirmTitle" class="block-title">{{'packages.admin.confirmTitle'|t}}</h2>
  <p class="notice">{{'packages.admin.confirmHint'|t}}</p>
  <label for="adminReason" class="form-label mt-2">{{'packages.offer.cancelReason'|t}}</label><textarea id="adminReason" class="form-control" maxlength="500" [(ngModel)]="reason"></textarea>
  <label class="d-block mt-2"><input type="checkbox" [(ngModel)]="confirmed"> {{'packages.admin.confirm'|t}}</label>
</section>
}
@if(can('class_payments.review')){
<section class="surface block" aria-labelledby="adminSalesTitle">
  <h2 id="adminSalesTitle" class="block-title">{{'packages.admin.salesTitle'|t}}</h2>
  <h3 class="sub-title">{{'packages.admin.payments'|t}}</h3>
  <label for="paymentFilter" class="form-label">{{'packages.admin.filter'|t}}</label><select id="paymentFilter" class="form-select" [(ngModel)]="filter" (ngModelChange)="loadPayments()">@for(s of statuses;track s){<option [value]="s">{{('packages.admin.orderStatus.'+s)|t}}</option>}</select>
  @for(o of orders();track o.id){<article class="item">
    <div class="item-head"><h4>{{'packages.admin.order'|t}} #{{o.id}} · {{i18n.formatMoney(o.amount,o.currency)}}</h4><span class="badge-status badge-status--dot status-{{orderTone(o.status)}}">{{('packages.admin.orderStatus.'+o.status)|t}}</span></div>
    @if(frozen(o)){<p data-test="frozen-reason">{{('packages.pv.frozen.'+o.reviewReason)|t}}</p>
      @if(o.frozenFromStatus){<p class="notice">{{'packages.pv.frozenFrom'|t:{status:purchaseStatus(o.frozenFromStatus)} }}</p>}
      <p class="notice">{{'packages.pv.balances'|t:{available:o.unitsAvailable??'—',reserved:o.unitsReserved??'—',consumed:o.unitsConsumed??'—'} }}</p>}
    @else if(o.reviewReason){<p>{{o.reviewReason}}</p>}
    @if(o.reportedAmount!=null&&o.reportedCurrency){<p>{{'packages.admin.reported'|t:{amount:i18n.formatMoney(o.reportedAmount!,o.reportedCurrency!)} }}</p>}
    <p class="notice">{{'packages.admin.providerIds'|t:{transaction:o.providerTransactionId||'—',product:o.providerProductId||'—',offer:o.providerOfferCode||'—'} }} · {{'packages.offer.open'|t}} #{{o.offerId}}</p>
    @if(frozen(o)){
      <p class="notice">{{'packages.pv.confirmRefundHint'|t}}</p>
      <label [for]="'refunded'+o.id" class="form-label mt-2">{{'packages.pv.refundedAmount'|t:{currency:o.currency} }}</label><input [id]="'refunded'+o.id" class="form-control" inputmode="decimal" [ngModel]="refundText(o)" (ngModelChange)="refundInputs[o.id]=$event">
      <p class="notice">{{'packages.pv.refundedPartial'|t}}</p>
      @if(refundInvalid(o)){<p class="notice" role="alert">{{'packages.pv.refundedInvalid'|t}}</p>}
      <div class="item-actions"><button class="btn btn-outline-danger" [disabled]="!ready()||refundInvalid(o)" (click)="confirmRefund(o)">{{'packages.pv.confirmRefund'|t}}</button></div>
      <p class="notice mt-2">{{'packages.pv.unfreezeHint'|t}}</p>
      <div class="item-actions"><button class="btn btn-secondary" [disabled]="!ready()||!o.frozenFromStatus" (click)="resolve(o,'unfreeze')">{{'packages.pv.unfreeze'|t}}</button></div>
      @if(!o.frozenFromStatus){<p class="notice">{{'packages.pv.unfreezeLegacy'|t}}</p>}
    }@else if(o.status==='paid_needs_review'||o.status==='paid'){<div class="item-actions">
      @if(o.status==='paid_needs_review'){<button class="btn btn-primary" [disabled]="!ready()" (click)="resolve(o,'credit')">{{'packages.admin.credit'|t}}</button>}
      <button class="btn btn-outline-danger" [disabled]="!ready()" (click)="resolve(o,'refund')">{{'packages.admin.approve'|t}}</button></div>}
  </article>}@empty{<div class="empty mt-2"><p>{{'packages.admin.paymentsEmpty'|t}}</p><button type="button" class="btn btn-secondary" [disabled]="busy()" (click)="loadPayments()">{{'packages.admin.reload'|t}}</button></div>}
  @for(e of events();track e.id){<p class="notice">{{'packages.admin.unmatched'|t}} #{{e.id}} · {{e.eventType}} · {{i18n.formatInstant(e.createdAt,fmt.timeZone())}}</p>}
</section>
<section class="surface block" aria-labelledby="adminProceduresTitle">
  <h2 id="adminProceduresTitle" class="block-title">{{'packages.admin.proceduresTitle'|t}}</h2>
  <h3 class="sub-title">{{'packages.refund.title'|t}}</h3>
  @for(v of refunds();track v.purchaseId){@for(r of v.requests;track r.id){<article class="item">
    <div class="item-head"><h4>#{{r.id}} · {{'packages.admin.purchase'|t}} #{{v.purchaseId}}</h4></div>
    <p>{{'packages.refund.amount'|t:{amount:i18n.formatMoney(v.amount,v.currency)} }}</p><p>{{('packages.refund.'+v.classification)|t}}</p>
    <p>{{'packages.refund.deadline'|t:{time:i18n.formatInstant(v.deadline,fmt.timeZone()),kind:('packages.refund.'+(v.deadlineVerified?'verified':'calculated')|t)} }}</p>
    <p class="notice">{{'packages.refund.breakdown'|t:{available:v.available,reserved:v.reserved,consumed:v.consumed} }}</p>
    <p>{{('packages.refund.type.'+r.type)|t}}: {{r.reason}} · {{('packages.refund.status.'+r.status)|t}}</p>
    @for(u of r.updates;track $index){<p class="notice">{{i18n.formatInstant(u.createdAt,fmt.timeZone())}} · {{('packages.refund.status.'+u.status)|t}} · {{u.reason}}</p>}
    @if(v.reservationsPending){<p class="notice">{{'packages.refund.reservations'|t}}</p>}
    @if(r.status!=='confirmed'){
      <div class="item-actions">
        <button class="btn btn-outline-danger" [disabled]="!ready()||v.reservationsPending||r.status==='queued'||r.status==='manual_hotmart'" (click)="reviewRefund(v,r.id,'approve')">{{'packages.admin.approve'|t}}</button>
        <button class="btn btn-secondary" [disabled]="!ready()" (click)="reviewRefund(v,r.id,'needs_information')">{{'packages.admin.information'|t}}</button>
        <button class="btn btn-secondary" [disabled]="!ready()" (click)="reviewRefund(v,r.id,'manual_update')">{{'packages.admin.followup'|t}}</button>
      </div>
      @if(r.status==='queued'&&v.provider==='fake'){<p class="notice">{{'packages.payment.fakeNote'|t}}</p><div class="item-actions"><button class="btn btn-secondary" [disabled]="busy()" (click)="fake(v.orderId)">{{'packages.admin.fakeRefund'|t}}</button></div>}
    }
  </article>}}@empty{<div class="empty"><p>{{'packages.admin.refundsEmpty'|t}}</p><button type="button" class="btn btn-secondary" [disabled]="busy()" (click)="load()">{{'packages.admin.reload'|t}}</button></div>}
  <h3 class="sub-title">{{'packages.admin.jobs'|t}}</h3>
  @if(jobsFailed()){<p class="alert alert-danger" role="alert">{{'packages.admin.jobsError'|t}}</p>}
  @for(j of jobs();track j.id){<article class="item">
    <div class="item-head"><h4>{{'packages.admin.job.title'|t}} #{{j.aggregateId}}</h4><span class="badge-status badge-status--dot status-{{jobTone(j.status)}}">{{('packages.admin.job.'+j.status)|t}}</span></div>
    @if(j.lastError){<p>{{j.lastError}}</p>}
    <p class="notice">{{'packages.admin.jobMeta'|t:{id:j.id,topic:j.topic,attempts:j.attempts} }}</p>
    <div class="item-actions">
      @for(id of j.purchaseIds;track id){<button class="btn btn-secondary" (click)="purchaseId=id;loadPurchase()">{{'packages.admin.purchase'|t}} #{{id}}</button>}
      @if(j.topic.startsWith('review.')){<button class="btn btn-secondary" [disabled]="!ready()" (click)="acknowledge(j.id)">{{'packages.admin.acknowledge'|t}}</button>}
      @if(j.status==='failed'){<button class="btn btn-secondary" [disabled]="!ready()" (click)="retry(j.id)">{{'packages.admin.retry'|t}}</button>}
    </div>
  </article>}@empty{@if(!jobsFailed()){<div class="empty"><p>{{'packages.admin.jobsEmpty'|t}}</p><button type="button" class="btn btn-secondary" [disabled]="busy()" (click)="load()">{{'packages.admin.reload'|t}}</button></div>}}
</section>
}
@if(can('class_teachers.manage')){
<section class="surface block" aria-labelledby="adminTeachersTitle">
  <h2 id="adminTeachersTitle" class="block-title">{{'packages.admin.teachers'|t}}</h2>
  @for(t of teachers();track t.id){<article class="item"><div class="item-head"><h3>{{t.name}}</h3><span class="badge-status badge-status--dot status-{{t.settings?.classesEnabledAt?'success':'neutral'}}">{{(t.settings?.classesEnabledAt?'packages.admin.enabled':'packages.admin.disabled')|t}}</span></div>
    <div class="item-actions"><button class="btn" [class.btn-primary]="!t.settings?.classesEnabledAt" [class.btn-secondary]="t.settings?.classesEnabledAt" [disabled]="busy()" (click)="enable(t.id,!t.settings?.classesEnabledAt)" [attr.aria-label]="((t.settings?.classesEnabledAt?'packages.admin.disable':'packages.admin.enable')|t)+' — '+t.name">{{(t.settings?.classesEnabledAt?'packages.admin.disable':'packages.admin.enable')|t}}</button></div></article>}
  @empty{<div class="empty"><p>{{'packages.admin.teachersEmpty'|t}}</p><button type="button" class="btn btn-secondary" [disabled]="busy()" (click)="load()">{{'packages.admin.reload'|t}}</button></div>}
</section>}
@if(can('class_packages.manage_all')&&policy();as p){
<section class="surface block" aria-labelledby="adminPolicyTitle">
  <h2 id="adminPolicyTitle" class="block-title">{{'packages.admin.policy'|t}}</h2>
  <p class="notice">{{'packages.admin.policyVersion'|t:{version:p.version} }} · {{'packages.catalog.immutable'|t}}</p>
  <label for="policyHours" class="form-label mt-2">{{'packages.admin.guarantee'|t}}</label><input id="policyHours" class="form-control" type="number" min="360" step="1" [(ngModel)]="refundHours">
  <label for="policyPause" class="form-label mt-2">{{'packages.admin.pauseHours'|t}}</label><input id="policyPause" class="form-control" type="number" min="0" step="1" [(ngModel)]="pauseHours">
  <label for="policyTtl" class="form-label mt-2">{{'packages.admin.ttl'|t}}</label><input id="policyTtl" class="form-control" type="number" min="1" step="1" [(ngModel)]="ttlHours">
  <div class="item-actions"><button class="btn btn-primary" [disabled]="busy()" (click)="publishPolicy()">{{'packages.save'|t}}</button></div>
</section>}
@if(can('class_credits.adjust')||can('class_payments.review')){
<section class="surface block" aria-labelledby="adminAdjustTitle">
  <h2 id="adminAdjustTitle" class="block-title">{{'packages.admin.adjust'|t}}</h2>
  <label for="adjustPurchase" class="form-label mt-2">{{'packages.admin.purchase'|t}}</label><input id="adjustPurchase" class="form-control" type="number" min="1" [(ngModel)]="purchaseId"><div class="item-actions"><button class="btn btn-secondary" [disabled]="busy()" (click)="loadPurchase()">{{'packages.admin.load'|t}}</button></div>
  @if(purchase();as p){<p class="mt-3">#{{p.id}} · {{'packages.refund.breakdown'|t:{available:p.balance.available,reserved:p.balance.reserved,consumed:p.balance.consumed} }}</p>
  @if(can('class_payments.review')){<label for="verifiedDeadline" class="form-label mt-2">{{'packages.admin.verifiedDeadline'|t}}</label><input id="verifiedDeadline" class="form-control" placeholder="2026-11-30T14:00:00Z" [(ngModel)]="deadline"><div class="item-actions"><button class="btn btn-secondary" [disabled]="!ready()||!deadline.trim()" (click)="verifyDeadline()">{{'packages.admin.verifyDeadline'|t}}</button></div>}
  @if(can('class_credits.adjust')){<label for="adjustDirection" class="form-label mt-2">{{'packages.admin.direction'|t}}</label><select id="adjustDirection" class="form-select" [(ngModel)]="direction">@for(d of directions;track d){<option [value]="d">{{('packages.admin.adjust.'+d)|t}}</option>}</select><label for="adjustUnits" class="form-label mt-2">{{'packages.admin.units'|t}}</label><input id="adjustUnits" class="form-control" type="number" min="1" [(ngModel)]="units"><div class="item-actions"><button class="btn btn-outline-danger" [disabled]="!ready()||units<1" (click)="adjust()">{{'packages.admin.confirmAdjust'|t}}</button></div>}}
</section>}
<button class="btn btn-secondary mt-3" [disabled]="busy()" (click)="load()">{{'packages.offer.refresh'|t}}</button>
</div>`})
export class CommerceAdminComponent implements OnInit{
  private api=inject(PackagesService);private auth=inject(AuthService);private destroy=inject(DestroyRef);readonly i18n=inject(I18nService);readonly fmt=inject(ChatFormat);
  refunds=signal<RefundPreview[]>([]);orders=signal<ClassOrder[]>([]);provider=signal<ClassProviderState|null>(null);verifyOpen=signal(false);revokeOpen=signal(false);events=signal<{id:number;orderId:number|null;eventType:string;createdAt:string}[]>([]);jobs=signal<PaymentJob[]>([]);jobsFailed=signal(false);teachers=signal<{id:number;name:string;settings:ClassSettings|null}[]>([]);policy=signal<{version:number;rules:Record<string,unknown>}|null>(null);purchase=signal<ClassPurchase|null>(null);
  busy=signal(false);saved=signal(false);private failure=signal<unknown>(null);error=computed(()=>this.failure()?this.api.error(this.failure()):'');
  vChecks:Record<string,boolean>={account:false,format:false,guarantee:false,mapping:false};vDays:number|null=null;vReason='';rReason='';rConfirmed=false;refundInputs:Record<number,string>={};
  readonly checkKeys=['account','format','guarantee','mapping'] as const;readonly guaranteeOptions=[7,15,21,30];
  reason='';deadline='';confirmed=false;filter='paid_needs_review';refundHours=360;pauseHours=720;ttlHours=168;purchaseId=0;direction='add';units=1;private adjustKey=crypto.randomUUID();private adjustAttempt='';
  readonly statuses=['paid_needs_review','paid','partially_refunded','refunded','pending','failed'];readonly directions=['add','remove','restore'];
  orderTone(s:string){return s==='paid'?'success':s==='paid_needs_review'||s==='pending'||s==='partially_refunded'?'warning':s==='failed'?'danger':'neutral';}
  jobTone(s:string){return s==='failed'?'danger':s==='attention'||s==='pending'||s==='running'?'warning':s==='done'?'success':'neutral';}
  frozen(o:ClassOrder){return isFrozenOrder(o);}
  purchaseStatus(s:string){const k=`packages.purchase.status.${s}`;return this.i18n.has(k)?this.i18n.t(k):s;}
  revoker(r:{revokedBy:{name:string}|number|null}){const b=r.revokedBy;return b&&typeof b==='object'?b.name:b!=null?`#${b}`:'—';}
  verifyReady(){return !this.busy()&&this.checkKeys.every(k=>this.vChecks[k])&&this.guaranteeOptions.includes(this.vDays as number)&&Boolean(this.vReason.trim());}
  revokeReady(){return !this.busy()&&this.rConfirmed&&Boolean(this.rReason.trim());}
  loadProvider(){this.api.providerState().pipe(takeUntilDestroyed(this.destroy)).subscribe({next:v=>this.provider.set(v),error:()=>this.provider.set(null)});}
  verifyProvider(){if(!this.verifyReady())return;this.act(this.api.verifyProvider({checks:{account:true,format:true,guarantee:true,mapping:true},guaranteeDays:this.vDays as number,reason:this.vReason.trim()}),()=>{this.verifyOpen.set(false);this.vChecks={account:false,format:false,guarantee:false,mapping:false};this.vDays=null;this.vReason='';});}
  revokeProvider(){if(!this.revokeReady())return;this.act(this.api.revokeProvider(this.rReason.trim()),()=>{this.revokeOpen.set(false);this.rReason='';this.rConfirmed=false;});}
  private fractionDigits(c:string){return new Intl.NumberFormat('en',{style:'currency',currency:c.toUpperCase()}).resolvedOptions().maximumFractionDigits??2;}
  refundText(o:ClassOrder){return this.refundInputs[o.id]??(o.amount/10**this.fractionDigits(o.currency)).toFixed(this.fractionDigits(o.currency));}
  /** Convierte lo escrito (unidades mayores) a unidades menores enteras; null si no es un importe válido. */
  refundMinor(o:ClassOrder){const t=this.refundText(o).trim().replace(',','.');const d=this.fractionDigits(o.currency);if(!/^\d+(\.\d+)?$/.test(t))return null;const [,f='']=t.split('.');if(f.length>d)return null;const n=Math.round(Number(t)*10**d);return Number.isSafeInteger(n)&&n>=1&&n<=o.amount?n:null;}
  refundInvalid(o:ClassOrder){return this.refundMinor(o)===null;}
  confirmRefund(o:ClassOrder){const n=this.refundMinor(o);if(n===null||!this.ready())return;this.act(this.api.resolvePayment(o.id,'confirm_refund',this.reason.trim(),n===o.amount?undefined:n));}
  ngOnInit(){this.load();this.loadProvider();}can(p:string){return this.auth.hasPermission(p);}ready(){return !this.busy()&&this.confirmed&&Boolean(this.reason.trim());}
  private read<T>(o:Observable<T>,next:(v:T)=>void){o.pipe(takeUntilDestroyed(this.destroy)).subscribe({next,error:e=>this.failure.set(e)});}
  load(){if(this.can('class_payments.review')){this.read(this.api.refundRequests(),v=>this.refunds.set(v));this.loadPayments();this.jobsFailed.set(false);this.api.paymentJobs().pipe(takeUntilDestroyed(this.destroy)).subscribe({next:v=>this.jobs.set(v),error:()=>this.jobsFailed.set(true)});}if(this.can('class_teachers.manage'))this.read(this.api.teachers(),v=>this.teachers.set(v));if(this.can('class_packages.manage_all'))this.read(this.api.policies(),v=>{this.policy.set(v[0]||null);if(v[0]){this.refundHours=Math.max(360,Number(v[0].rules['refundWindowHours']));this.pauseHours=Number(v[0].rules['maxPauseHours']);this.ttlHours=Number(v[0].rules['offerTtlHours']);}});}
  loadPayments(){this.read(this.api.paymentList(this.filter),v=>{this.orders.set(v.items);this.events.set(v.events);});}
  private act<T>(o:Observable<T>,done?:(v:T)=>void){if(this.busy())return;this.busy.set(true);this.saved.set(false);this.failure.set(null);o.pipe(takeUntilDestroyed(this.destroy)).subscribe({next:v=>{done?.(v);this.busy.set(false);this.saved.set(true);this.confirmed=false;this.load();this.loadProvider();},error:e=>{this.busy.set(false);this.failure.set(e);}});}
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
