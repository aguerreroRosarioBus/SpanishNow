import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Observable, Subscription } from 'rxjs';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { I18nService } from '../../core/i18n/i18n.service';
import { AuthService } from '../../core/services/auth.service';
import { ChatFormat } from '../chat/chat-format';
import { PackagesService } from './packages.service';
import { RefundRequestComponent } from './refund-request.component';
import { ClassPurchase } from './packages.model';
@Component({selector:'app-class-purchases',standalone:true,imports:[FormsModule,RouterLink,TranslatePipe,RefundRequestComponent],template:`
<div class="page-container"><h1>{{ 'packages.purchase.title' | t }}</h1>
@if(error()){<p class="alert alert-danger" role="alert">{{error()}}</p>}
@if(busy()){<p role="status">{{ 'packages.loading' | t }}</p>}
@for(p of items();track p.id){
  <article class="card p-3 mb-3"><h2 class="h4">{{name(p)}}</h2>
    <p>{{('packages.purchase.status.'+p.status)|t}} · {{'packages.offer.teacher'|t:{name:p.snapshot.teacherName} }}</p>
    <p>{{ 'packages.purchase.expiry' | t:{time:instant(p.expiresAt),zone:fmt.timeZone()} }}</p>
    <p>{{ 'packages.summary' | t:{count:p.snapshot.sessionsCount,minutes:p.minutesPerSession,seats:p.seatsCovered,hours:p.snapshot.validityHours} }}</p>
    <dl class="row">@for(bucket of buckets;track bucket){<dt class="col-8">{{('packages.balance.'+bucket)|t}}</dt><dd class="col-4">{{p.balance[bucket]}}</dd>}</dl>
    <div class="d-flex flex-wrap gap-2">
      <a class="btn btn-outline-primary" [routerLink]="['/class-offers',p.offerId]">{{ 'packages.offer.open' | t }}</a>
      @if(!teacher && !id){<a class="btn btn-secondary" [routerLink]="['/class-packages',p.id]">{{ 'packages.purchase.history' | t }}</a>}
      <button class="btn btn-secondary" [disabled]="busy()" (click)="conversation(p,teacher)">{{(teacher?'packages.purchase.renew':'packages.purchase.contact')|t}}</button>
      @if(!teacher && p.buyerId===auth.currentUser()?.id){
        @if(p.status==='active' && p.pauseCount<p.snapshot.policy.maxPauses){<button class="btn btn-secondary" [disabled]="busy()" (click)="change(p,'pause')">{{'packages.purchase.pause'|t}}</button>}
        @if(p.status==='paused'){<button class="btn btn-secondary" [disabled]="busy()" (click)="change(p,'resume')">{{'packages.purchase.resume'|t}}</button>}
        @if(p.status==='active'||p.status==='paused'){
          <button class="btn btn-outline-danger" [disabled]="busy()" (click)="cancelId.set(p.id)">{{'packages.purchase.cancel'|t}}</button>
        }
      }
    </div>
    @if(cancelId()===p.id){
      <p class="mt-3">{{'packages.purchase.cancelNote'|t}}</p><label [for]="'reason-'+p.id" class="form-label">{{'packages.offer.cancelReason'|t}}</label>
      <input [id]="'reason-'+p.id" class="form-control" maxlength="500" [ngModel]="reason()" (ngModelChange)="reason.set($event)">
      <button class="btn btn-danger mt-2" [disabled]="busy()||!reason().trim()" (click)="change(p,'cancel')">{{'packages.purchase.confirmCancel'|t}}</button>
    }
    @if(id && !teacher && p.buyerId===auth.currentUser()?.id){<app-refund-request [purchaseId]="p.id" [hours]="p.snapshot.policy.refundWindowHours" [mode]="p.snapshot.policy.refundMode" />}
    @if(p.ledger){<h3 class="h5 mt-3">{{'packages.purchase.history'|t}}</h3><ol>@for(entry of p.ledger;track entry.id){<li>{{('packages.ledger.'+entry.operation)|t}}: {{entry.units}} · {{instant(entry.createdAt)}} @if(entry.reason){<span>— {{entry.reason}}</span>}</li>}</ol>}
    @if(teacher && (p.balance.available<=1 || untilExpiry(p)<=168)){<p class="mt-2">{{'packages.purchase.renewHint'|t}}</p>}
  </article>
}@empty{<p>{{'packages.purchase.empty'|t}}</p>}
<button class="btn btn-secondary" [disabled]="busy()" (click)="read()">{{'packages.offer.refresh'|t}}</button>
</div>`})
export class PurchasesComponent implements OnInit{
  private api=inject(PackagesService);readonly i18n=inject(I18nService);readonly fmt=inject(ChatFormat);readonly auth=inject(AuthService);
  private route=inject(ActivatedRoute);private router=inject(Router);private destroy=inject(DestroyRef);private requests=new Subscription();
  readonly teacher=this.route.snapshot.data['teacher']===true;id=0;
  readonly buckets=['granted','available','reserved','consumed','expired','refunded'] as const;
  items=signal<ClassPurchase[]>([]);busy=signal(false);cancelId=signal(0);reason=signal('');private failure=signal<unknown>(null);error=computed(()=>this.failure()?this.api.error(this.failure()):'');
  ngOnInit(){this.destroy.onDestroy(()=>this.requests.unsubscribe());this.route.paramMap.pipe(takeUntilDestroyed(this.destroy)).subscribe(p=>{this.requests.unsubscribe();this.requests=new Subscription();this.id=Number(p.get('id'))||0;this.items.set([]);this.cancelId.set(0);this.reason.set('');this.read();});}
  read(){this.busy.set(true);this.failure.set(null);if(this.id)this.watch(this.api.purchase(this.id),p=>{this.items.set([p]);this.busy.set(false);});else this.watch(this.api.purchases(this.teacher),p=>{this.items.set(p);this.busy.set(false);});}
  name(p:ClassPurchase){return this.i18n.locale()==='es'?p.snapshot.nameEs:p.snapshot.nameEn;}
  instant(value:string){return this.i18n.formatInstant(value,this.fmt.timeZone());}
  untilExpiry(p:ClassPurchase){return (Date.parse(p.expiresAt)-Date.now())/3600000;}
  change(p:ClassPurchase,action:string){if(this.busy())return;this.busy.set(true);this.failure.set(null);this.watch(this.api.changePurchase(p,action,action==='cancel'?this.reason():undefined),()=>{this.cancelId.set(0);this.reason.set('');this.read();});}
  conversation(p:ClassPurchase,renew:boolean){if(this.busy())return;this.busy.set(true);this.watch(this.api.offer(p.offerId),o=>void this.router.navigate(renew?['/teacher/class-offers/new']:['/messages',o.conversationId],renew?{queryParams:{conversationId:o.conversationId}}:{}));}
  private watch<T>(source:Observable<T>,next:(r:T)=>void){this.requests.add(source.subscribe({next,error:e=>{this.failure.set(e);this.busy.set(false);}}));}
}
