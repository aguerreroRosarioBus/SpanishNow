import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { switchMap } from 'rxjs';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { I18nService } from '../../core/i18n/i18n.service';
import { ChatFormat } from '../chat/chat-format';
import { PackagesService } from './packages.service';
import { ClassOffer } from './packages.model';
import { EXPECTATION_FIELDS } from '../legal/legal.model';
@Component({selector:'app-offer-detail',standalone:true,imports:[RouterLink,TranslatePipe],templateUrl:'./offer-detail.component.html'})
export class OfferDetailComponent implements OnInit {
  readonly api=inject(PackagesService); readonly i18n=inject(I18nService); readonly fmt=inject(ChatFormat);
  private route=inject(ActivatedRoute); private destroyRef=inject(DestroyRef);
  readonly fields=EXPECTATION_FIELDS; offer=signal<ClassOffer|null>(null);
  private failure=signal<unknown>(null);error=computed(()=>this.failure()?this.api.error(this.failure()):'');
  readonly name=computed(()=>{const o=this.offer();return o?(this.i18n.locale()==='es'?o.snapshot.nameEs:o.snapshot.nameEn):'';});
  ngOnInit(){this.route.paramMap.pipe(switchMap(p=>this.api.offer(Number(p.get('id')))),takeUntilDestroyed(this.destroyRef)).subscribe({next:o=>this.offer.set(o),error:e=>this.failure.set(e)});}
  instant(value:string){return this.i18n.formatInstant(value,this.fmt.timeZone());}
  reload(){const o=this.offer();if(o)this.api.offer(o.id).subscribe({next:o=>this.offer.set(o),error:e=>this.failure.set(e)});}
}
