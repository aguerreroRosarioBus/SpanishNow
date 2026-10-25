import {Component,OnInit,computed,inject,signal} from '@angular/core';
import {ActivatedRoute,RouterLink} from '@angular/router';
import {TranslatePipe} from '../../core/i18n/translate.pipe';
import {I18nService} from '../../core/i18n/i18n.service';
import {ChatFormat} from '../chat/chat-format';
import {PackagesService} from './packages.service';
import {ClassCohort} from './packages.model';
@Component({selector:'app-cohort-invitation',standalone:true,imports:[TranslatePipe,RouterLink],template:`
  <div class="page-container"><h1>{{ 'packages.group.invitation' | t }}</h1>
  @if (error()) {<p class="alert alert-danger" role="alert">{{ error() }}</p>}
  @if (cohort(); as c) {
    <p>{{ 'packages.group.tentative' | t:{time:instant(c.tentativeStartsAt),zone:fmt.timeZone()} }}</p>
    <p>{{ 'packages.group.deadline' | t:{time:instant(c.formingDeadlineAt),zone:fmt.timeZone()} }}</p>
    <p>{{ 'packages.group.accepted' | t:{count:c.acceptedCount,total:c.groupSize} }}</p>
    <p>{{ 'packages.group.noPayment' | t }}</p>
    @if(c.members){<p>{{'packages.group.teacherHint'|t}}</p>@for(m of c.members;track m.userId){<p>{{m.name}} · {{('packages.group.status.'+m.status)|t}} @if(c.status==='forming'&&c.acceptedCount===c.groupSize&&m.conversationId){<a routerLink="/teacher/class-offers/new" [queryParams]="{conversationId:m.conversationId,cohortId:c.id}">{{'packages.offer.send'|t}}</a>}</p>}}
    <div class="d-flex flex-wrap gap-2 align-items-center my-3"><button class="btn btn-ghost" [disabled]="busy()" (click)="ngOnInit()">{{'packages.offer.refresh'|t}}</button>
    @if (c.invitation?.status==='invited' && c.status==='forming') {
      <button class="btn btn-primary" [disabled]="busy()" (click)="respond(true)">{{ 'packages.group.accept' | t }}</button>
      <button class="btn btn-secondary" [disabled]="busy()" (click)="respond(false)">{{ 'packages.group.decline' | t }}</button>
    } @else {<p>{{ ('packages.group.status.'+(c.invitation?.status ?? c.status)) | t }}</p>}</div>
  }</div>
`})
export class CohortInvitationComponent implements OnInit{
  private api=inject(PackagesService);readonly i18n=inject(I18nService);readonly fmt=inject(ChatFormat);
  private id=Number(inject(ActivatedRoute).snapshot.paramMap.get('id'));
  cohort=signal<ClassCohort|null>(null);busy=signal(false);private failure=signal<unknown>(null);error=computed(()=>this.failure()?this.api.error(this.failure()):'');
  ngOnInit(){this.api.group(this.id).subscribe({next:c=>this.cohort.set(c),error:e=>this.failure.set(e)});}
  instant(value:string){return this.i18n.formatInstant(value,this.fmt.timeZone());}
  respond(accepted:boolean){if(this.busy())return;this.busy.set(true);this.api.respondGroup(this.id,accepted).subscribe({next:c=>{this.cohort.set(c);this.busy.set(false);},error:e=>{this.failure.set(e);this.busy.set(false);}});}
}
