import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { forkJoin, of } from 'rxjs';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { I18nService } from '../../core/i18n/i18n.service';
import { ChatService } from '../../core/services/chat.service';
import { PackagesService } from './packages.service';
import { ClassCohort,CompleteTemplate,hasVersion } from './packages.model';
import { EXPECTATION_FIELDS } from '../legal/legal.model';
import { IconComponent } from '../../shared/components/icon/icon.component';
@Component({
  selector: 'app-offer-create', standalone: true, imports: [FormsModule, RouterLink, TranslatePipe, IconComponent],
  templateUrl: './offer-create.component.html', styleUrl: './offer-create.component.scss'
})
export class OfferCreateComponent implements OnInit {
  private api=inject(PackagesService); private chat=inject(ChatService); private router=inject(Router);
  readonly i18n=inject(I18nService); readonly fields=EXPECTATION_FIELDS;
  readonly conversationId=Number(inject(ActivatedRoute).snapshot.queryParamMap.get('conversationId'));
  readonly replacesOfferId=Number(inject(ActivatedRoute).snapshot.queryParamMap.get('replacesOfferId'))||null;
  items=signal<CompleteTemplate[]>([]);incomplete=signal(0);selectedId=signal(0);selected=computed(()=>this.items().find(p=>p.id===this.selectedId()));
  readonly expectationEntries = computed(() => {
    const expectations = this.selected()?.current.expectations;
    const locale = this.i18n.locale();
    return this.fields.flatMap(field => {
      const own = expectations?.[locale]?.[field]?.trim();
      const fallback = expectations?.[locale === 'es' ? 'en' : 'es']?.[field]?.trim();
      const text = own || (fallback ? `${fallback} [${locale === 'es' ? 'EN' : 'ES'}]` : '');
      return text ? [{ field, text }] : [];
    });
  });
  recipient=signal('');busy=signal(false);loaded=signal(false);private failure=signal<unknown>(null);error=computed(()=>this.failure()?this.api.error(this.failure()):'');
  readonly cohortId=Number(inject(ActivatedRoute).snapshot.queryParamMap.get('cohortId'))||null;
  private cohort:ClassCohort|null=null;private buyerId=0;private key='';
  ngOnInit(){this.reload();}
  reload(){this.busy.set(true);this.failure.set(null);forkJoin({items:this.api.list(),conversation:this.chat.get(this.conversationId),cohort:this.cohortId?this.api.group(this.cohortId):of(null)}).subscribe({next:r=>{this.cohort=r.cohort;this.buyerId=r.conversation.counterpart.id;this.incomplete.set(r.items.filter(p=>!hasVersion(p)).length);this.items.set(r.items.filter(hasVersion).filter(p=>p.status==='active' && (r.cohort?p.current.id===r.cohort.templateVersionId:p.current.modality==='individual')));this.recipient.set(r.conversation.counterpart.name);this.loaded.set(true);this.busy.set(false);if(r.cohort&&this.items().length)this.select(this.items()[0].id);},error:e=>{this.busy.set(false);this.failure.set(e);}});}
  name(p:CompleteTemplate){return this.i18n.locale()==='es'?p.current.nameEs:p.current.nameEn;}
  select(id:number){this.selectedId.set(id);this.key=crypto.randomUUID();}
  send(){const p=this.selected();if(!p || this.busy())return;this.busy.set(true);this.failure.set(null);
    const body={templateVersionId:p.current.id,...(this.cohort?{cohortId:this.cohort.id,beneficiaryIds:p.current.billing==='per_group'?this.cohort.members!.map(m=>m.userId):[this.buyerId]}:{})};
    const request=this.replacesOfferId?this.api.replaceOffer(this.replacesOfferId,body,this.key):this.api.sendOffer(this.conversationId,body,this.key);
    request.subscribe({next:o=>void this.router.navigate(['/class-offers',o.id]),error:e=>{this.busy.set(false);this.failure.set(e);}});
  }
}
