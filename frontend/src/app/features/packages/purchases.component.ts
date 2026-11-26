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
import { PackageOrientationComponent } from './package-orientation.component';
import { formatPackageValidity } from './package-validity';
import { isClosedPurchase, purchaseStatusKey, purchaseTone, refundKind } from './purchase-state';
import { toastFrom } from '../../core/services/toast.service';
@Component({selector:'app-class-purchases',standalone:true,imports:[FormsModule,RouterLink,TranslatePipe,RefundRequestComponent,PackageOrientationComponent],styleUrl:'./purchases.component.scss',template:`
<div class="page-container"><h1>{{ 'packages.purchase.title' | t }}</h1>
@if(teacher){<app-package-orientation section="purchases" />}
@if(error()){<div class="d-flex justify-content-end"><button type="button" class="btn btn-secondary btn-sm" [disabled]="busy()" (click)="read()">{{'packages.purchase.retry'|t}}</button></div>}
@if(busy()){<p role="status">{{ 'packages.loading' | t }}</p>}
@if(!id && items().length){<div class="purchase-filters" role="search">
<label for="purchaseSearch">{{(teacher?'refine.searchPurchases':'refine.searchPackages')|t}}<input id="purchaseSearch" type="search" class="form-control" [ngModel]="search()" (ngModelChange)="search.set($event)"></label>
<label for="purchaseStatus">{{'student.status'|t}}<select id="purchaseStatus" class="form-select" [ngModel]="statusFilter()" (ngModelChange)="statusFilter.set($event)"><option value="all">{{'refine.all'|t}}</option><option value="available">{{'refine.available'|t}}</option>@for(s of purchaseStatuses;track s){<option [value]="s">{{('packages.purchase.status.'+s)|t}}</option>}</select></label>
</div>}
@for(p of visibleItems();track p.id){
  <article class="purchase-card" [class.is-inactive]="inactive(p)" [class.is-teacher]="teacher">
    <div class="card-head">
      <div class="card-title"><h2>{{name(p)}}</h2>
        @if(teacher && p.buyerName){<p class="buyer">{{p.buyerName}}</p>}
        @if(!teacher && p.snapshot.teacherName){<p class="muted">{{'packages.offer.teacher'|t:{name:p.snapshot.teacherName} }}</p>}
      </div>
      <span class="badge-status badge-status--dot status-{{stateTone(p)}}">{{stateKey(p)|t}}</span>
      @if(refundKind(p)==='requested'){<span class="badge-status badge-status--dot status-warning">{{'packages.purchase.refund.requested'|t}}</span>}
    </div>
    <div class="purchase-meta">@if(closedNote(p);as note){<p class="balance-closed">{{note}}</p>}@else{<p class="balance"><strong class="balance-num">{{p.balance.available}}</strong> {{'packages.purchase.availableOf'|t:{count:p.balance.available,granted:p.balance.granted} }}</p>
    @if(adjustNote(p);as adjusted){<p class="muted">{{adjusted}}</p>}}
    @if(others(p);as extra){<p class="muted">{{extra}}</p>}
    @if(!closedNote(p)&&expiry(p);as e){
      <p class="expiry">{{(p.status==='expired'?'packages.purchase.expiredOn':'packages.purchase.expires')|t:{day:e.day} }}</p>
      <p class="muted">{{'packages.purchase.expiryExact'|t:{time:e.time,zone:e.timeZone,offset:e.offsetLabel} }}</p>
    }
    @if(p.status==='paused'){<p class="muted">{{'packages.purchase.pausedNote'|t:{date:pauseResume(p)} }}</p>}
    </div><div class="card-actions primary-action">      @if(primary(p)==='schedule'){<a class="btn btn-primary" routerLink="/schedule" [attr.aria-label]="label(teacher?'packages.purchase.scheduleTeacher':'packages.purchase.scheduleStudent',p)">{{(teacher?'packages.purchase.scheduleTeacher':'packages.purchase.scheduleStudent')|t}}</a>}
      @else{<button type="button" class="btn btn-primary" [disabled]="busy()" [attr.aria-label]="label(teacher?'packages.purchase.renew':'packages.purchase.contact',p)" (click)="conversation(p,teacher)">{{(teacher?'packages.purchase.renew':'packages.purchase.contact')|t}}</button>}
</div>
    <details class="purchase-conditions" [open]="!!id"><summary>{{'refine.conditions'|t}}</summary><p class="muted conditions">{{conditions(p)}}</p>
    @if(teacher && renewSuggested(p)){<p class="muted">{{'packages.purchase.renewHint'|t}}</p>}
    <div class="card-actions">
      <a class="btn btn-secondary" [routerLink]="['/class-offers',p.offerId]" [attr.aria-label]="label('packages.offer.open',p)">{{ 'packages.offer.open' | t }}</a>
      @if(!teacher && !id){<a class="btn btn-secondary" [routerLink]="['/class-packages',p.id]" [attr.aria-label]="label('packages.purchase.history',p)">{{ 'packages.purchase.history' | t }}</a>}
      @if(primary(p)==='schedule'){<button type="button" class="btn btn-secondary" [disabled]="busy()" [attr.aria-label]="label(teacher?'packages.purchase.renew':'packages.purchase.contact',p)" (click)="conversation(p,teacher)">{{(teacher?'packages.purchase.renew':'packages.purchase.contact')|t}}</button>}
      @if(!teacher && p.buyerId===auth.currentUser()?.id){
        @if(p.status==='active' && p.pauseCount<p.snapshot.policy.maxPauses){<button type="button" class="btn btn-secondary" [disabled]="busy()" (click)="pauseId.set(p.id);cancelId.set(0);blocked.set(null)">{{'packages.purchase.pause'|t}}</button>}
        @if(p.status==='active' && p.snapshot.policy.maxPauses>0 && p.pauseCount>=p.snapshot.policy.maxPauses){<p class="muted">{{'packages.purchase.pauseUsed'|t}}</p>}
        @if(p.status==='paused'){<button type="button" class="btn btn-secondary" [disabled]="busy()" (click)="change(p,'resume')">{{'packages.purchase.resume'|t}}</button>}
        @if(p.status==='active'||p.status==='paused'){
          <button type="button" class="btn btn-ghost card-actions-end" [disabled]="busy()" (click)="cancelId.set(p.id);pauseId.set(0);blocked.set(null)">{{'packages.purchase.cancel'|t}}</button>
        }
      }
    </div>
    </details>
    @if(pauseId()===p.id){
      <div class="confirm"><p>{{'packages.purchase.pauseNote'|t:{limit:pauseLimit(p),date:pauseUntil(p)} }}</p>
      <button type="button" class="btn btn-primary btn-sm mt-2" [disabled]="busy()" (click)="change(p,'pause')">{{'packages.purchase.pauseConfirm'|t}}</button>
      <button type="button" class="btn btn-ghost btn-sm mt-2" [disabled]="busy()" (click)="pauseId.set(0)">{{'common.cancel'|t}}</button></div>
    }
    @if(blocked();as b){@if(b.id===p.id){<div class="alert alert-warning" role="alert"><p>{{(b.sessions.length?'packages.purchase.blocked':'packages.purchase.blockedReserved')|t:{count:b.count} }}</p>
      @if(b.sessions.length){<ul>@for(s of b.sessions;track s.id){<li>{{instant(s.startsAt)}}</li>}</ul>}
      <a class="btn btn-secondary btn-sm" routerLink="/schedule">{{'packages.purchase.openSchedule'|t}}</a></div>}}
    @if(cancelId()===p.id){
      <div class="confirm"><p>{{'packages.purchase.cancelNote'|t}}</p><label [for]="'reason-'+p.id" class="form-label mt-2">{{'packages.offer.cancelReason'|t}}</label>
      <input [id]="'reason-'+p.id" class="form-control" maxlength="500" [ngModel]="reason()" (ngModelChange)="reason.set($event)">
      <button type="button" class="btn btn-danger btn-sm mt-2" [disabled]="busy()||!reason().trim()" (click)="change(p,'cancel')">{{'packages.purchase.confirmCancel'|t}}</button></div>
    }
    @if(id && !teacher && p.buyerId===auth.currentUser()?.id){<app-refund-request [purchaseId]="p.id" [hours]="p.snapshot.policy.refundWindowHours" [mode]="p.snapshot.policy.refundMode" />}
    @if(p.ledger){<details class="card-details" open><summary>{{'packages.purchase.history'|t}}</summary><ol class="ledger">@for(entry of p.ledger;track entry.id){<li>{{ledgerText(entry)}} · {{instant(entry.createdAt)}} @if(entry.reason){<span>— {{entry.reason}}</span>}</li>}</ol></details>}
  </article>
}@empty{@if(!busy()){<p role="status">{{(items().length?'refine.noResults':'packages.purchase.empty')|t}}</p>}}
</div>`})
export class PurchasesComponent implements OnInit{
  constructor() { toastFrom(() => this.error()); }
  private api=inject(PackagesService);readonly i18n=inject(I18nService);readonly fmt=inject(ChatFormat);readonly auth=inject(AuthService);
  private route=inject(ActivatedRoute);private router=inject(Router);private destroy=inject(DestroyRef);private requests=new Subscription();
  readonly teacher=this.route.snapshot.data['teacher']===true;id=0;
  search=signal(''); statusFilter=signal('all');
  readonly purchaseStatuses=['active','paused','exhausted','expired','cancelled'];
  visibleItems=computed(()=>{
    const query=this.search().trim().toLocaleLowerCase(this.i18n.intlLocale());
    const status=this.statusFilter();
    return this.items().filter(p=>(!query || [p.buyerName,this.name(p),p.snapshot.teacherName].some(v=>v?.toLocaleLowerCase(this.i18n.intlLocale()).includes(query))) && (status==='all'||status==='available' ? status==='all'||p.status==='active'&&p.balance.available>0 : p.status===status))
      .slice().sort((a,b)=>Number(b.status==='active'&&b.balance.available>0)-Number(a.status==='active'&&a.balance.available>0)||Date.parse(a.expiresAt)-Date.parse(b.expiresAt)||a.id-b.id);
  });
  readonly extras=['reserved','consumed','expired','refunded'] as const;
  items=signal<ClassPurchase[]>([]);busy=signal(false);cancelId=signal(0);pauseId=signal(0);blocked=signal<{id:number;count:number;sessions:{id:number;startsAt:string;status:string}[]}|null>(null);reason=signal('');private failure=signal<unknown>(null);error=computed(()=>this.failure()?this.api.error(this.failure()):'');
  ngOnInit(){this.destroy.onDestroy(()=>this.requests.unsubscribe());this.route.paramMap.pipe(takeUntilDestroyed(this.destroy)).subscribe(p=>{this.requests.unsubscribe();this.requests=new Subscription();this.id=Number(p.get('id'))||0;this.items.set([]);this.cancelId.set(0);this.pauseId.set(0);this.blocked.set(null);this.reason.set('');this.read();});}
  read(){this.busy.set(true);this.failure.set(null);if(this.id)this.watch(this.api.purchase(this.id),p=>{this.items.set([p]);this.busy.set(false);});else this.watch(this.api.purchases(this.teacher),p=>{this.items.set(p);this.busy.set(false);});}
  tone(status:string){return status==='active'?'success':status==='paused'?'warning':status==='cancelled'?'danger':'neutral';}
  inactive(p:ClassPurchase){return p.status==='expired'||isClosedPurchase(p);}
  readonly refundKind=refundKind;
  stateKey(p:ClassPurchase){return purchaseStatusKey(p);}
  stateTone(p:ClassPurchase){return purchaseTone(p);}
  /** Compra cerrada (cancelada o con reembolso aprobado o hecho): se explica en una frase en lugar de mostrar saldo y vencimiento como si valieran (D3-DIN-04). */
  closedNote(p:ClassPurchase){
    if(!isClosedPurchase(p))return '';const kind=refundKind(p);
    if(kind==='refunded')return this.i18n.t('packages.purchase.closedRefunded',{amount:this.i18n.formatMoney(p.refund?.refundedAmount||p.refund?.amount||0,p.refund?.currency||'USD')});
    if(kind==='processing')return this.i18n.t('packages.purchase.closedProcessing',{amount:this.i18n.formatMoney(p.refund?.amount||0,p.refund?.currency||'USD')});
    return this.i18n.t('packages.purchase.closedCancelled');
  }
  /** Créditos sumados o restados a mano: se muestran aparte de lo comprado (D3-DIN-09). */
  adjustNote(p:ClassPurchase){const n=p.adjustedUnits||0;return n>0?this.i18n.t('packages.purchase.adjustedUp',{count:n}):n<0?this.i18n.t('packages.purchase.adjustedDown',{count:-n}):'';}
  ledgerText(e:NonNullable<ClassPurchase['ledger']>[number]){
    if(e.operation==='adjust'){const kind=e.fromBucket==='none'?'add':e.toBucket==='none'?'remove':'restore';return this.i18n.t('packages.ledger.adjust_'+kind,{units:e.units});}
    return this.i18n.t('packages.ledger.'+e.operation)+': '+e.units;
  }
  /** Reservadas, utilizadas, vencidas y reembolsadas solo cuando son distintas de 0. */
  others(p:ClassPurchase){return this.extras.filter(b=>p.balance[b]>0).map(b=>this.i18n.t('packages.balance.'+b)+' '+p.balance[b]).join(' · ');}
  /** Instante del vencimiento: fecha compacta y, aparte, hora exacta con zona IANA y desplazamiento (TZ-07). */
  expiry(p:ClassPurchase){try{return presentInstant(p.expiresAt,this.fmt.timeZone(),this.i18n.locale());}catch{return null;}}
  /** La vigencia son horas reales transcurridas (TZ-16); los días son solo una ayuda cuando son múltiplo exacto de 24 h. */
  conditions(p:ClassPurchase){const hours=p.snapshot.validityHours;const base={sessions:p.snapshot.sessionsCount,minutes:p.minutesPerSession,seats:p.seatsCovered,hours};return hours%24===0&&hours>0?this.i18n.t('packages.purchase.conditionsDays',{...base,days:hours/24}):this.i18n.t('packages.purchase.conditions',base);}
  renewSuggested(p:ClassPurchase){return p.balance.available<=1||this.untilExpiry(p)<=168;}
  /** Una acción principal por tarjeta: agendar mientras haya saldo; si no, renovar (docente) o hablar con la docente (alumna). */
  primary(p:ClassPurchase):'schedule'|'other'{return p.status==='active'&&p.balance.available>0?'schedule':'other';}
  label(key:string,p:ClassPurchase){return this.i18n.t('packages.purchase.actionFor',{action:this.i18n.t(key),name:this.name(p)});}
  name(p:ClassPurchase){return this.i18n.locale()==='es'?p.snapshot.nameEs:p.snapshot.nameEn;}
  instant(value:string){try{const t=presentInstant(value,this.fmt.timeZone(),this.i18n.locale());return t.day+' '+t.time;}catch{return '';}}
  untilExpiry(p:ClassPurchase){return (Date.parse(p.expiresAt)-Date.now())/3600000;}
  /** Horas que le quedan de pausa a la compra y cuándo se reanudaría sola si se pausara ahora (D3-DIN-14). */
  private pauseHoursLeft(p:ClassPurchase){return Math.max(0,p.snapshot.policy.maxPauseHours-(p.pausedHoursUsed||0));}
  pauseLimit(p:ClassPurchase){return formatPackageValidity(this.i18n,this.pauseHoursLeft(p));}
  private day(ms:number){try{const t=presentInstant(new Date(ms).toISOString(),this.fmt.timeZone(),this.i18n.locale());return t.day+' '+t.time;}catch{return '';}}
  pauseUntil(p:ClassPurchase){return this.day(Date.now()+this.pauseHoursLeft(p)*3600000);}
  pauseResume(p:ClassPurchase){return this.day(Date.parse(p.pausedAt||new Date().toISOString())+this.pauseHoursLeft(p)*3600000);}
  change(p:ClassPurchase,action:string){
    if(this.busy())return;this.busy.set(true);this.failure.set(null);this.blocked.set(null);
    this.requests.add(this.api.changePurchase(p,action,action==='cancel'?this.reason():undefined).subscribe({
      next:()=>{this.cancelId.set(0);this.pauseId.set(0);this.reason.set('');this.read();},
      error:e=>{
        const body=(e as {error?:{code?:string;params?:{sessions?:{id:number;startsAt:string;status:string}[];count?:number}}})?.error;
        // Lo que impide pausar o cancelar se dice junto a la tarjeta, con las sesiones a resolver (D3-DIN-15).
        if(body?.code==='sessions_pending_resolution')this.blocked.set({id:p.id,count:body.params?.count??0,sessions:body.params?.sessions??[]});else this.failure.set(e);
        this.busy.set(false);
      }}));
  }
  conversation(p:ClassPurchase,renew:boolean){if(this.busy())return;this.busy.set(true);this.watch(this.api.offer(p.offerId),o=>void this.router.navigate(renew?['/teacher/class-offers/new']:['/messages',o.conversationId],renew?{queryParams:{conversationId:o.conversationId}}:{}));}
  private watch<T>(source:Observable<T>,next:(r:T)=>void){this.requests.add(source.subscribe({next,error:e=>{this.failure.set(e);this.busy.set(false);}}));}
}
