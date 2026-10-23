import {Component,OnChanges,DestroyRef,inject,input,signal,computed} from '@angular/core';
import {FormsModule} from '@angular/forms';
import {takeUntilDestroyed} from '@angular/core/rxjs-interop';
import {TranslatePipe} from '../../core/i18n/translate.pipe';
import {I18nService} from '../../core/i18n/i18n.service';
import {ChatFormat} from '../chat/chat-format';
import {PackagesService} from './packages.service';
import {RefundPreview} from './packages.model';
@Component({selector:'app-refund-request',standalone:true,imports:[FormsModule,TranslatePipe],template:`
<section class="mt-4"><h3 class="h5">{{'packages.refund.title'|t}}</h3>
@if(error()){<p role="alert" class="alert alert-danger">{{error()}}</p>}
@if(view();as v){
  <p>{{(mode()==='full_unused_then_review'?'packages.refund.policy':'packages.refund.legacy')|t:{hours:hours()} }}</p>
  <p>{{('packages.refund.'+v.classification)|t}}</p>
  <p>{{'packages.refund.amount'|t:{amount:i18n.formatMoney(v.amount,v.currency)} }}</p>
  <p>{{'packages.refund.deadline'|t:{time:i18n.formatInstant(v.deadline,fmt.timeZone()),kind:('packages.refund.'+(v.deadlineVerified?'verified':'calculated')|t)} }}</p>
  <p>{{'packages.refund.breakdown'|t:{available:v.available,reserved:v.reserved,consumed:v.consumed} }}</p>
  @if(v.reservationsPending){<p>{{'packages.refund.reservations'|t}}</p>}
  <p>{{'packages.refund.notReturned'|t}}</p>
  @for(r of v.requests;track r.id){<article class="border p-2"><p>#{{r.id}} · {{('packages.refund.status.'+r.status)|t}}</p><p>{{r.reason}}</p>@for(u of r.updates;track $index){<p>{{i18n.formatInstant(u.createdAt,fmt.timeZone())}} · {{('packages.refund.status.'+u.status)|t}} · {{u.reason}}</p>}</article>}
  @if(v.orderStatus==='refunded'){<p role="status">{{'packages.payment.refunded'|t}} {{i18n.formatMoney(v.refundedAmount,v.currency)}}</p>}
  @else if(!v.requests.length){
    <label for="refundType" class="form-label">{{'packages.refund.type'|t}}</label>
    <select id="refundType" class="form-select" [ngModel]="type()" (ngModelChange)="setType($event)" [disabled]="busy()">@for(t of types;track t){<option [value]="t">{{('packages.refund.type.'+t)|t}}</option>}</select>
    <label for="refundReason" class="form-label">{{'packages.offer.cancelReason'|t}}</label><textarea id="refundReason" class="form-control" maxlength="500" [ngModel]="reason()" (ngModelChange)="reason.set($event)"></textarea>
    <label class="d-block my-2"><input type="checkbox" [ngModel]="confirmed()" (ngModelChange)="confirmed.set($event)"> {{'packages.refund.confirm'|t}}</label>
    <button class="btn btn-outline-danger" [disabled]="busy()||!confirmed()||!reason().trim()" (click)="send()">{{'packages.refund.send'|t}}</button>
  }
}
</section>`})
export class RefundRequestComponent implements OnChanges{
  purchaseId=input.required<number>();hours=input.required<number>();mode=input<string>();readonly i18n=inject(I18nService);readonly fmt=inject(ChatFormat);private api=inject(PackagesService);private destroy=inject(DestroyRef);
  view=signal<RefundPreview|null>(null);type=signal('voluntary');reason=signal('');confirmed=signal(false);busy=signal(false);private key=crypto.randomUUID();private failure=signal<unknown>(null);error=computed(()=>this.failure()?this.api.error(this.failure()):'');
  readonly types=['voluntary','service_unavailable','group_incomplete','other'];
  ngOnChanges(){this.load();}
  setType(type:string){this.type.set(type);this.key=crypto.randomUUID();this.confirmed.set(false);this.load();}
  load(){this.busy.set(true);this.failure.set(null);this.api.refundPreview(this.purchaseId(),this.type()).pipe(takeUntilDestroyed(this.destroy)).subscribe({next:v=>{this.view.set(v);this.busy.set(false);},error:e=>{this.failure.set(e);this.busy.set(false);}});}
  send(){const v=this.view();if(!v||this.busy()||!this.confirmed())return;this.busy.set(true);this.failure.set(null);this.api.requestRefund(this.purchaseId(),{version:v.version,quote:v.quote,type:this.type(),reason:this.reason().trim()},this.key).pipe(takeUntilDestroyed(this.destroy)).subscribe({next:v=>{this.view.set(v);this.busy.set(false);},error:e=>{this.failure.set(e);this.busy.set(false);}});}
}
