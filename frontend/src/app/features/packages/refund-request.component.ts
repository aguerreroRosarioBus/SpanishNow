import {Component,OnChanges,DestroyRef,inject,input,signal,computed} from '@angular/core';
import {FormsModule} from '@angular/forms';
import {takeUntilDestroyed} from '@angular/core/rxjs-interop';
import {TranslatePipe} from '../../core/i18n/translate.pipe';
import {I18nService} from '../../core/i18n/i18n.service';
import {ChatFormat} from '../chat/chat-format';
import {PackagesService} from './packages.service';
import {RefundPreview} from './packages.model';
import {presentInstant} from '../../core/time/class-time';
@Component({selector:'app-refund-request',standalone:true,imports:[FormsModule,TranslatePipe],styles:[`.refund{margin-top:var(--spacing-md)}.refund p{margin:var(--spacing-xs) 0 0}.refund .muted{font-size:.8125rem;color:var(--color-text-light);overflow-wrap:anywhere}.amount{font-weight:600}.refund-class{margin-top:var(--spacing-sm)!important}.request{margin-top:var(--spacing-sm);padding:var(--spacing-sm) var(--spacing-md);border:1px solid var(--color-border);border-radius:var(--radius-md);background:var(--color-bg-light)}.request-head{display:flex;align-items:flex-start;justify-content:space-between;gap:var(--spacing-sm)}.badge-status{white-space:normal}.status-success{background:var(--color-success-soft);color:var(--color-success-text)}.status-warning{background:var(--color-warning-soft);color:#6b4a00}.status-danger{background:var(--color-danger-soft);color:var(--color-danger)}.refund-form{margin-top:var(--spacing-md)}`],template:`
<details class="refund card-details" [open]="!!view()?.requests?.length"><summary>{{'packages.refund.title'|t}}</summary>
@if(error()){<p role="alert" class="alert alert-danger mt-2">{{error()}}</p>}
@if(view();as v){
  <p class="refund-class">{{('packages.refund.'+v.classification)|t}}</p>
  <p class="amount">{{'packages.refund.amount'|t:{amount:i18n.formatMoney(v.amount,v.currency)} }}</p>
  <p class="muted">{{(mode()==='full_unused_then_review'?'packages.refund.policy':'packages.refund.legacy')|t:{hours:hours()} }}</p>
  <p class="muted">{{'packages.refund.deadline'|t:{time:when(v.deadline),kind:('packages.refund.'+(v.deadlineVerified?'verified':'calculated')|t)} }}</p>
  <p class="muted">{{'packages.refund.breakdown'|t:{available:v.available,reserved:v.reserved,consumed:v.consumed} }}</p>
  @if(v.reservationsPending){<p class="muted">{{'packages.refund.reservations'|t}}</p>}
  <p class="muted">{{'packages.refund.notReturned'|t}}</p>
  @for(r of v.requests;track r.id){<article class="request"><div class="request-head"><strong>#{{r.id}}</strong><span class="badge-status badge-status--dot status-{{tone(r.status)}}">{{('packages.refund.status.'+r.status)|t}}</span></div><p>{{r.reason}}</p>@for(u of r.updates;track $index){<p class="muted">{{when(u.createdAt)}} · {{('packages.refund.status.'+u.status)|t}} · {{u.reason}}</p>}</article>}
  @if(v.orderStatus==='refunded'){<p role="status">{{'packages.payment.refunded'|t}} {{i18n.formatMoney(v.refundedAmount,v.currency)}}</p>}
  @else if(!v.requests.length){
    <div class="refund-form">
    <label for="refundType" class="form-label">{{'packages.refund.type'|t}}</label>
    <select id="refundType" class="form-select" [ngModel]="type()" (ngModelChange)="setType($event)" [disabled]="busy()">@for(t of types;track t){<option [value]="t">{{('packages.refund.type.'+t)|t}}</option>}</select>
    <label for="refundReason" class="form-label mt-2">{{'packages.offer.cancelReason'|t}}</label><textarea id="refundReason" class="form-control" maxlength="500" [ngModel]="reason()" (ngModelChange)="reason.set($event)"></textarea>
    <label class="d-block my-2"><input type="checkbox" [ngModel]="confirmed()" (ngModelChange)="confirmed.set($event)"> {{'packages.refund.confirm'|t}}</label>
    <button type="button" class="btn btn-outline-danger" [disabled]="busy()||!confirmed()||!reason().trim()" (click)="send()">{{'packages.refund.send'|t}}</button>
    </div>
  }
}
</details>`})
export class RefundRequestComponent implements OnChanges{
  purchaseId=input.required<number>();hours=input.required<number>();mode=input<string>();readonly i18n=inject(I18nService);readonly fmt=inject(ChatFormat);private api=inject(PackagesService);private destroy=inject(DestroyRef);
  view=signal<RefundPreview|null>(null);type=signal('voluntary');reason=signal('');confirmed=signal(false);busy=signal(false);private key=crypto.randomUUID();private failure=signal<unknown>(null);error=computed(()=>this.failure()?this.api.error(this.failure()):'');
  readonly types=['voluntary','service_unavailable','group_incomplete','other'];
  tone(status:string){return status==='confirmed'?'success':['rejected','denied','failed'].includes(status)?'danger':'warning';}
  /** Fecha compacta con hora, zona IANA y desplazamiento (TZ-07); sin formateo manual. */
  when(value:string){try{const t=presentInstant(value,this.fmt.timeZone(),this.i18n.locale());return `${t.day} ${t.time} · ${t.timeZone} · ${t.offsetLabel}`;}catch{return '';}}
  ngOnChanges(){this.load();}
  setType(type:string){this.type.set(type);this.key=crypto.randomUUID();this.confirmed.set(false);this.load();}
  load(){this.busy.set(true);this.failure.set(null);this.api.refundPreview(this.purchaseId(),this.type()).pipe(takeUntilDestroyed(this.destroy)).subscribe({next:v=>{this.view.set(v);this.busy.set(false);},error:e=>{this.failure.set(e);this.busy.set(false);}});}
  send(){const v=this.view();if(!v||this.busy()||!this.confirmed())return;this.busy.set(true);this.failure.set(null);this.api.requestRefund(this.purchaseId(),{version:v.version,quote:v.quote,type:this.type(),reason:this.reason().trim()},this.key).pipe(takeUntilDestroyed(this.destroy)).subscribe({next:v=>{this.view.set(v);this.busy.set(false);},error:e=>{this.failure.set(e);this.busy.set(false);}});}
}
