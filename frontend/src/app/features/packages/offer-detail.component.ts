import { DOCUMENT } from '@angular/common';
import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Subject, switchMap, takeUntil } from 'rxjs';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { I18nService } from '../../core/i18n/i18n.service';
import { ChatFormat } from '../chat/chat-format';
import { PackagesService } from './packages.service';
import { ClassOffer, ClassOrder, CheckoutState } from './packages.model';
import { EXPECTATION_FIELDS } from '../legal/legal.model';
import { LegalConsentComponent } from '../legal/legal-consent/legal-consent.component';
import { consentFor } from '../legal/legal.service';
import { IconComponent } from '../../shared/components/icon/icon.component';
@Component({selector:'app-offer-detail',standalone:true,imports:[FormsModule,RouterLink,TranslatePipe,LegalConsentComponent,IconComponent],templateUrl:'./offer-detail.component.html',styleUrl:'./offer-detail.component.scss'})
export class OfferDetailComponent implements OnInit {
  readonly api=inject(PackagesService); readonly i18n=inject(I18nService); readonly fmt=inject(ChatFormat);
  private route=inject(ActivatedRoute); private destroyRef=inject(DestroyRef);private document=inject(DOCUMENT);
  readonly fields=EXPECTATION_FIELDS; offer=signal<ClassOffer|null>(null);order=signal<ClassOrder|null>(null);purchaseId=signal<number|null>(null);
  private failure=signal<unknown>(null);error=computed(()=>this.failure()?this.api.error(this.failure()):'');
  readonly name=computed(()=>{const o=this.offer();return o?(this.i18n.locale()==='es'?o.snapshot.nameEs:o.snapshot.nameEn):'';});
  readonly documents=computed(()=>(this.offer()?.snapshot.legalDocuments||[]).map(d=>({documentKey:d.documentKey,version:d.version,title:d.content[this.i18n.locale()].title})));
  readonly needsConsent=computed(()=>this.documents().some(d=>d.documentKey!=='privacy'));
  readonly policyDetails = computed(() => {
    const policy = this.offer()?.snapshot.policy;
    return policy && ['freeCancelHours','maxPauseHours','maxPauses','refundWindowHours'].every(key => Number.isFinite(policy[key as keyof typeof policy])) ? policy : null;
  });
  readonly versionsAvailable = computed(() => Number.isInteger(this.offer()?.snapshot.templateVersion) && Number.isInteger(this.offer()?.snapshot.policyVersion));
  readonly conditionsComplete = computed(() => !!this.policyDetails() && this.versionsAvailable() && Number.isFinite(this.offer()?.snapshot.validityHours));
  readonly expectationEntries = computed(() => {
    const expectations = this.offer()?.snapshot.expectations;
    const locale = this.i18n.locale();
    return this.fields.flatMap(field => {
      const own = expectations?.[locale]?.[field]?.trim();
      const fallback = expectations?.[locale === 'es' ? 'en' : 'es']?.[field]?.trim();
      const text = own || (fallback ? `${fallback} [${locale === 'es' ? 'EN' : 'ES'}]` : '');
      return text ? [{ field, text }] : [];
    });
  });
  readonly payable=computed(()=>Boolean(this.offer()?.canCheckout&&['sent','checkout_pending'].includes(this.offer()!.status)&&(!this.order()||['pending','failed'].includes(this.order()!.status))));
  accepted=signal(false);busy=signal(false);reason=signal('');private key=crypto.randomUUID();private routeChanges=new Subject<void>();
  ngOnInit(){this.route.paramMap.pipe(switchMap(p=>{this.routeChanges.next();this.busy.set(false);this.failure.set(null);this.offer.set(null);this.order.set(null);this.purchaseId.set(null);this.accepted.set(false);this.key=crypto.randomUUID();return this.api.offer(Number(p.get('id')));}),takeUntilDestroyed(this.destroyRef)).subscribe({next:o=>{this.offer.set(o);if(o.canCheckout)this.loadState(o.id);},error:e=>this.failure.set(e)});}
  instant(value:string){return this.i18n.formatInstant(value,this.fmt.timeZone());}
  private loadState(id:number){this.api.checkoutState(id).pipe(takeUntil(this.routeChanges),takeUntilDestroyed(this.destroyRef)).subscribe({next:s=>this.apply(s),error:e=>this.failure.set(e)});}
  private apply(s:CheckoutState){if(s.offer.id!==this.offer()?.id)return;this.offer.set(s.offer);this.order.set(s.order);this.purchaseId.set(s.purchaseId);}
  reload(){const o=this.offer();if(!o)return;if(o.canCheckout)this.loadState(o.id);else this.api.offer(o.id).pipe(takeUntil(this.routeChanges),takeUntilDestroyed(this.destroyRef)).subscribe({next:o=>this.offer.set(o),error:e=>this.failure.set(e)});}
  pay(){const o=this.offer();if(!o||!this.conditionsComplete()||!this.payable()||this.busy()||this.needsConsent()&&!this.accepted())return;this.busy.set(true);this.failure.set(null);
    const docs=o.snapshot.legalDocuments;
    this.api.checkout(o.id,this.key,{locale:this.i18n.locale(),...(this.needsConsent()?{legalConsent:consentFor(docs)}:{})}).pipe(takeUntil(this.routeChanges),takeUntilDestroyed(this.destroyRef)).subscribe({next:r=>{
      if(this.offer()?.id!==o.id)return;this.order.set(r.order);this.busy.set(false);if(r.order.status==='failed')this.key=crypto.randomUUID();
      if(r.order.provider==='hotmart'&&r.order.status==='pending'&&r.checkoutUrl){const url=new URL(r.checkoutUrl);if(url.protocol==='https:'&&url.hostname==='pay.hotmart.com')this.document.defaultView?.location.assign(url.toString());}
    },error:e=>{this.failure.set(e);this.busy.set(false);}});
  }
  completeFake(){const o=this.offer();if(!o||this.order()?.provider!=='fake'||this.busy())return;this.busy.set(true);this.failure.set(null);this.api.fakeComplete(o.id).pipe(takeUntil(this.routeChanges),takeUntilDestroyed(this.destroyRef)).subscribe({next:s=>{this.apply(s);this.busy.set(false);},error:e=>{this.failure.set(e);this.busy.set(false);}});}
  cancel(){const o=this.offer();if(!o||!o.canManage||!this.reason().trim()||this.busy())return;this.busy.set(true);this.api.cancelOffer(o.id,this.reason().trim()).pipe(takeUntil(this.routeChanges),takeUntilDestroyed(this.destroyRef)).subscribe({next:s=>{this.offer.set({...s,canManage:true});this.busy.set(false);},error:e=>{this.failure.set(e);this.busy.set(false);}});}
}
