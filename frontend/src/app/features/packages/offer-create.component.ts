import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { forkJoin, of } from 'rxjs';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { I18nService } from '../../core/i18n/i18n.service';
import { ChatService } from '../../core/services/chat.service';
import { PackagesService } from './packages.service';
import { PackageTemplate,ClassCohort } from './packages.model';
import { EXPECTATION_FIELDS } from '../legal/legal.model';
@Component({selector:'app-offer-create',standalone:true,imports:[FormsModule,RouterLink,TranslatePipe],template:`
  <div class="page-container">
    <h1>{{ 'packages.offer.send' | t }}</h1>
    <a [routerLink]="['/messages',conversationId]">{{ 'packages.offer.back' | t }}</a>
    @if (error()) { <p role="alert" class="alert alert-danger">{{ error() }}</p> }
    <p>{{ 'packages.offer.recipient' | t:{name:recipient()} }}</p>
    <label for="packageChoice" class="form-label">{{ 'packages.offer.choose' | t }}</label>
    <select id="packageChoice" class="form-select mb-3" [ngModel]="selectedId()" (ngModelChange)="select($event)">
      <option [ngValue]="0">{{ 'packages.offer.choose' | t }}</option>
      @for (p of items(); track p.id) { <option [ngValue]="p.id">{{ name(p) }}</option> }
    </select>
    @if (selected(); as p) {
      <article class="card p-3">
        <h2>{{ name(p) }}</h2>
        <p>{{ i18n.formatMoney(p.current.priceAmount,p.current.currency) }} · {{ 'packages.summary' | t:{count:p.current.sessionsCount,minutes:p.current.minutesPerSession,seats:p.current.seatsCovered,hours:p.current.validityHours} }}</p>
        <p>{{ 'packages.offer.review' | t }}</p>
        <p>{{'packages.refund.policy'|t:{hours:p.policy?.rules?.refundWindowHours ?? 360} }}</p>
        @if(cohortId){<p>{{'packages.group.paymentScope'|t:{seats:p.current.seatsCovered} }}</p>}
        <dl>@for (field of fields; track field) { <dt>{{ ('packages.expectations.'+field) | t }}</dt><dd>{{ p.current.expectations?.[i18n.locale()]?.[field] }}</dd> }</dl>
        <button class="btn btn-primary align-self-start" [disabled]="busy()" (click)="send()">{{ 'packages.offer.confirmSend' | t }}</button>
      </article>
    } @else if (loaded()) { <p>{{ 'packages.offer.catalogHint' | t }} <a routerLink="/teacher/class-packages">{{ 'packages.nav' | t }}</a></p> }
  </div>
`})
export class OfferCreateComponent implements OnInit {
  private api=inject(PackagesService); private chat=inject(ChatService); private router=inject(Router);
  readonly i18n=inject(I18nService); readonly fields=EXPECTATION_FIELDS;
  readonly conversationId=Number(inject(ActivatedRoute).snapshot.queryParamMap.get('conversationId'));
  readonly replacesOfferId=Number(inject(ActivatedRoute).snapshot.queryParamMap.get('replacesOfferId'))||null;
  items=signal<PackageTemplate[]>([]);selectedId=signal(0);selected=computed(()=>this.items().find(p=>p.id===this.selectedId()));
  recipient=signal('');busy=signal(false);loaded=signal(false);private failure=signal<unknown>(null);error=computed(()=>this.failure()?this.api.error(this.failure()):'');
  readonly cohortId=Number(inject(ActivatedRoute).snapshot.queryParamMap.get('cohortId'))||null;
  private cohort:ClassCohort|null=null;private buyerId=0;private key='';
  ngOnInit(){forkJoin({items:this.api.list(),conversation:this.chat.get(this.conversationId),cohort:this.cohortId?this.api.group(this.cohortId):of(null)}).subscribe({next:r=>{this.cohort=r.cohort;this.buyerId=r.conversation.counterpart.id;this.items.set(r.items.filter(p=>p.status==='active' && (r.cohort?p.current.id===r.cohort.templateVersionId:p.current.modality==='individual')));this.recipient.set(r.conversation.counterpart.name);this.loaded.set(true);if(r.cohort&&this.items().length)this.select(this.items()[0].id);},error:e=>this.failure.set(e)});}
  name(p:PackageTemplate){return this.i18n.locale()==='es'?p.current.nameEs:p.current.nameEn;}
  select(id:number){this.selectedId.set(id);this.key=crypto.randomUUID();}
  send(){const p=this.selected();if(!p || this.busy())return;this.busy.set(true);this.failure.set(null);
    const body={templateVersionId:p.current.id,...(this.cohort?{cohortId:this.cohort.id,beneficiaryIds:p.current.billing==='per_group'?this.cohort.members!.map(m=>m.userId):[this.buyerId]}:{})};
    const request=this.replacesOfferId?this.api.replaceOffer(this.replacesOfferId,body,this.key):this.api.sendOffer(this.conversationId,body,this.key);
    request.subscribe({next:o=>void this.router.navigate(['/class-offers',o.id]),error:e=>{this.busy.set(false);this.failure.set(e);}});
  }
}
