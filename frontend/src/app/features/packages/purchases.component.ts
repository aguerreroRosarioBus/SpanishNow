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
import { presentInstant } from '../../core/time/class-time';
@Component({selector:'app-class-purchases',standalone:true,imports:[FormsModule,RouterLink,TranslatePipe,RefundRequestComponent],styleUrl:'./purchases.component.scss',template:`
<div class="page-container"><h1>{{ 'packages.purchase.title' | t }}</h1>
@if(error()){<div class="alert alert-danger d-flex justify-content-between align-items-center gap-2" role="alert">{{error()}}<button type="button" class="btn btn-secondary btn-sm" [disabled]="busy()" (click)="read()">{{'packages.purchase.retry'|t}}</button></div>}
@if(busy()){<p role="status">{{ 'packages.loading' | t }}</p>}
@for(p of items();track p.id){
  <article class="purchase-card" [class.is-inactive]="inactive(p)">
    <div class="card-head">
      <div class="card-title"><h2>{{name(p)}}</h2>
        @if(teacher && p.buyerName){<p class="buyer">{{p.buyerName}}</p>}
        @if(!teacher && p.snapshot.teacherName){<p class="muted">{{'packages.offer.teacher'|t:{name:p.snapshot.teacherName} }}</p>}
      </div>
      <span class="badge-status badge-status--dot status-{{tone(p.status)}}">{{('packages.purchase.status.'+p.status)|t}}</span>
    </div>
    <p class="balance"><strong class="balance-num">{{p.balance.available}}</strong> {{'packages.purchase.availableOf'|t:{count:p.balance.available,granted:p.balance.granted} }}</p>
    @if(others(p);as extra){<p class="muted">{{extra}}</p>}
    @if(expiry(p);as e){
      <p class="expiry">{{(p.status==='expired'?'packages.purchase.expiredOn':'packages.purchase.expires')|t:{day:e.day} }}</p>
      <p class="muted">{{'packages.purchase.expiryExact'|t:{time:e.time,zone:e.timeZone,offset:e.offsetLabel} }}</p>
    }
    <p class="muted conditions">{{conditions(p)}}</p>
    @if(teacher && renewSuggested(p)){<p class="muted">{{'packages.purchase.renewHint'|t}}</p>}
    <div class="card-actions">
      @if(primary(p)==='schedule'){<a class="btn btn-primary" routerLink="/schedule" [attr.aria-label]="label(teacher?'packages.purchase.scheduleTeacher':'packages.purchase.scheduleStudent',p)">{{(teacher?'packages.purchase.scheduleTeacher':'packages.purchase.scheduleStudent')|t}}</a>}
      @else{<button type="button" class="btn btn-primary" [disabled]="busy()" [attr.aria-label]="label(teacher?'packages.purchase.renew':'packages.purchase.contact',p)" (click)="conversation(p,teacher)">{{(teacher?'packages.purchase.renew':'packages.purchase.contact')|t}}</button>}
      <a class="btn btn-secondary" [routerLink]="['/class-offers',p.offerId]" [attr.aria-label]="label('packages.offer.open',p)">{{ 'packages.offer.open' | t }}</a>
      @if(!teacher && !id){<a class="btn btn-secondary" [routerLink]="['/class-packages',p.id]" [attr.aria-label]="label('packages.purchase.history',p)">{{ 'packages.purchase.history' | t }}</a>}
      @if(primary(p)==='schedule'){<button type="button" class="btn btn-secondary" [disabled]="busy()" [attr.aria-label]="label(teacher?'packages.purchase.renew':'packages.purchase.contact',p)" (click)="conversation(p,teacher)">{{(teacher?'packages.purchase.renew':'packages.purchase.contact')|t}}</button>}
      @if(!teacher && p.buyerId===auth.currentUser()?.id){
        @if(p.status==='active' && p.pauseCount<p.snapshot.policy.maxPauses){<button type="button" class="btn btn-secondary" [disabled]="busy()" (click)="change(p,'pause')">{{'packages.purchase.pause'|t}}</button>}
        @if(p.status==='paused'){<button type="button" class="btn btn-secondary" [disabled]="busy()" (click)="change(p,'resume')">{{'packages.purchase.resume'|t}}</button>}
        @if(p.status==='active'||p.status==='paused'){
          <button type="button" class="btn btn-ghost card-actions-end" [disabled]="busy()" (click)="cancelId.set(p.id)">{{'packages.purchase.cancel'|t}}</button>
        }
      }
    </div>
    @if(cancelId()===p.id){
      <div class="confirm"><p>{{'packages.purchase.cancelNote'|t}}</p><label [for]="'reason-'+p.id" class="form-label mt-2">{{'packages.offer.cancelReason'|t}}</label>
      <input [id]="'reason-'+p.id" class="form-control" maxlength="500" [ngModel]="reason()" (ngModelChange)="reason.set($event)">
      <button type="button" class="btn btn-danger btn-sm mt-2" [disabled]="busy()||!reason().trim()" (click)="change(p,'cancel')">{{'packages.purchase.confirmCancel'|t}}</button></div>
    }
    @if(id && !teacher && p.buyerId===auth.currentUser()?.id){<app-refund-request [purchaseId]="p.id" [hours]="p.snapshot.policy.refundWindowHours" [mode]="p.snapshot.policy.refundMode" />}
    @if(p.ledger){<details class="card-details" open><summary>{{'packages.purchase.history'|t}}</summary><ol class="ledger">@for(entry of p.ledger;track entry.id){<li>{{('packages.ledger.'+entry.operation)|t}}: {{entry.units}} · {{instant(entry.createdAt)}} @if(entry.reason){<span>— {{entry.reason}}</span>}</li>}</ol></details>}
  </article>
}@empty{@if(!busy()){<p>{{'packages.purchase.empty'|t}}</p>}}
</div>`})
export class PurchasesComponent implements OnInit{
  private api=inject(PackagesService);readonly i18n=inject(I18nService);readonly fmt=inject(ChatFormat);readonly auth=inject(AuthService);
  private route=inject(ActivatedRoute);private router=inject(Router);private destroy=inject(DestroyRef);private requests=new Subscription();
  readonly teacher=this.route.snapshot.data['teacher']===true;id=0;
  readonly extras=['reserved','consumed','expired','refunded'] as const;
  items=signal<ClassPurchase[]>([]);busy=signal(false);cancelId=signal(0);reason=signal('');private failure=signal<unknown>(null);error=computed(()=>this.failure()?this.api.error(this.failure()):'');
  ngOnInit(){this.destroy.onDestroy(()=>this.requests.unsubscribe());this.route.paramMap.pipe(takeUntilDestroyed(this.destroy)).subscribe(p=>{this.requests.unsubscribe();this.requests=new Subscription();this.id=Number(p.get('id'))||0;this.items.set([]);this.cancelId.set(0);this.reason.set('');this.read();});}
  read(){this.busy.set(true);this.failure.set(null);if(this.id)this.watch(this.api.purchase(this.id),p=>{this.items.set([p]);this.busy.set(false);});else this.watch(this.api.purchases(this.teacher),p=>{this.items.set(p);this.busy.set(false);});}
  tone(status:string){return status==='active'?'success':status==='paused'?'warning':status==='cancelled'?'danger':'neutral';}
  inactive(p:ClassPurchase){return p.status==='expired'||p.status==='cancelled';}
  /** Reservadas, utilizadas, vencidas y reembolsadas solo cuando son distintas de 0. */
  others(p:ClassPurchase){return this.extras.filter(b=>p.balance[b]>0).map(b=>this.i18n.t('packages.balance.'+b)+' '+p.balance[b]).join(' · ');}
  /** Instante del vencimiento: fecha compacta y, aparte, hora exacta con zona IANA y desplazamiento (TZ-07). */
  expiry(p:ClassPurchase){try{return presentInstant(p.expiresAt,this.fmt.timeZone(),this.i18n.locale());}catch{return null;}}
  /** La vigencia son horas reales transcurridas (TZ-16); los días son solo una ayuda cuando son múltiplo exacto de 24 h. */
  conditions(p:ClassPurchase){const hours=p.snapshot.validityHours;const base={sessions:p.snapshot.sessionsCount,minutes:p.minutesPerSession,seats:p.seatsCovered,hours};return hours%24===0&&hours>0?this.i18n.t('packages.purchase.conditionsDays',{...base,days:hours/24}):this.i18n.t('packages.purchase.conditions',base);}
  renewSuggested(p:ClassPurchase){return p.balance.available<=1||this.untilExpiry(p)<=168;}
  /** Una acción principal por tarjeta: agendar mientras haya saldo; si no, renovar (docente) o hablar con la docente (alumna). */
  primary(p:ClassPurchase):'schedule'|'other'{return this.teacher?(this.renewSuggested(p)?'other':'schedule'):(p.status==='active'&&p.balance.available>0?'schedule':'other');}
  label(key:string,p:ClassPurchase){return this.i18n.t('packages.purchase.actionFor',{action:this.i18n.t(key),name:this.name(p)});}
  name(p:ClassPurchase){return this.i18n.locale()==='es'?p.snapshot.nameEs:p.snapshot.nameEn;}
  instant(value:string){try{const t=presentInstant(value,this.fmt.timeZone(),this.i18n.locale());return t.day+' '+t.time;}catch{return '';}}
  untilExpiry(p:ClassPurchase){return (Date.parse(p.expiresAt)-Date.now())/3600000;}
  change(p:ClassPurchase,action:string){if(this.busy())return;this.busy.set(true);this.failure.set(null);this.watch(this.api.changePurchase(p,action,action==='cancel'?this.reason():undefined),()=>{this.cancelId.set(0);this.reason.set('');this.read();});}
  conversation(p:ClassPurchase,renew:boolean){if(this.busy())return;this.busy.set(true);this.watch(this.api.offer(p.offerId),o=>void this.router.navigate(renew?['/teacher/class-offers/new']:['/messages',o.conversationId],renew?{queryParams:{conversationId:o.conversationId}}:{}));}
  private watch<T>(source:Observable<T>,next:(r:T)=>void){this.requests.add(source.subscribe({next,error:e=>{this.failure.set(e);this.busy.set(false);}}));}
}
