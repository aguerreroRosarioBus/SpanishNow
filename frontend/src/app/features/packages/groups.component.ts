import { Component, OnInit, DestroyRef, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { I18nService } from '../../core/i18n/i18n.service';
import { ChatService } from '../../core/services/chat.service';
import { UserPreferencesService } from '../../core/services/user-preferences.service';
import { Conversation } from '../../core/models/chat.model';
import { PackagesService } from './packages.service';
import { ClassCohort, CompleteTemplate, hasVersion } from './packages.model';
import { PackageOrientationComponent } from './package-orientation.component';
import { TimeZoneSelectComponent } from '../../shared/components/time-zone-select/time-zone-select.component';
import { localTimeChoice } from '../../shared/utils/local-time-choice';
import { Disambiguation } from '../../core/time/class-time';

@Component({ selector:'app-package-groups', standalone:true,
imports:[FormsModule,RouterLink,TranslatePipe,PackageOrientationComponent,TimeZoneSelectComponent],
styles:[`
.group-list{display:grid;gap:12px;padding:0;list-style:none}.group-link{display:block;padding:16px;border:1px solid var(--color-border);border-radius:12px;background:var(--color-bg);color:var(--color-text);text-decoration:none}.group-link:hover{border-color:var(--color-primary)}.group-link strong{display:block;margin-bottom:6px}.group-link small{display:block;color:var(--color-text-light);margin-top:4px}.group-editor{max-width:760px;margin:20px 0;padding:20px;border:1px solid var(--color-border);border-radius:12px;background:var(--color-bg)}.group-editor>label{display:block;margin-top:16px}.contacts{max-height:340px;overflow:auto;border:1px solid var(--color-border);border-radius:8px;margin:12px 0}.contact{display:flex;gap:12px;align-items:center;min-height:48px;padding:8px 12px;border-bottom:1px solid var(--color-divider);cursor:pointer}.contact input{width:18px;height:18px;flex:none}.selected-contacts{display:flex;flex-wrap:wrap;gap:8px;margin:12px 0}.selected-contacts button{min-height:44px}.group-preview{padding:12px;background:var(--color-bg-light);border-radius:8px;font-size:.875rem;margin:12px 0}.group-actions{display:flex;gap:8px;flex-wrap:wrap;margin:16px 0}
`],template:`
<div class="page-container">
  <header class="page-header"><div><h1 class="page-title">{{'packages.group.manage'|t}}</h1></div><button type="button" class="btn btn-primary" [attr.aria-expanded]="creating()" (click)="creating.set(!creating())">{{'refine.newGroup'|t}}</button></header>
  <app-package-orientation section="groups" />
  @if(error()){<p class="alert alert-danger" role="alert">{{error()}}</p>}
  @if(creating()){
    @if(templatesLoading()){<p role="status">{{'packages.loading'|t}}</p>}
    @else if(templatesFailed()){<button type="button" class="btn btn-secondary" (click)="ngOnInit()">{{'packages.purchase.retry'|t}}</button>}
    @else if(!templates().length){<div class="state-box"><strong>{{'refine.noPackages'|t}}</strong><p>{{'refine.noPackagesHint'|t}}</p><a class="btn btn-primary" routerLink="/teacher/class-packages">{{'tutorial.packages.catalog.link'|t}}</a></div>}
    @else{
    <section class="group-editor" aria-labelledby="groupEditorTitle"><h2 id="groupEditorTitle" class="h4">{{'refine.newGroup'|t}}</h2><p class="text-secondary-ui">{{'packages.group.agreement'|t}}</p>
      <label for="groupPackage" class="form-label">{{'packages.offer.choose'|t}}</label><select id="groupPackage" class="form-select" [ngModel]="selectedId()" (ngModelChange)="selectPackage($event)"><option [ngValue]="0">{{'packages.offer.choose'|t}}</option>@for(p of templates();track p.id){<option [ngValue]="p.id">{{name(p)}} · {{i18n.formatMoney(p.current.priceAmount,p.current.currency)}}</option>}</select>
      <label for="groupInstant" class="form-label">{{'refine.groupStart'|t}}</label><input id="groupInstant" type="datetime-local" class="form-control" [ngModel]="localStart()" (ngModelChange)="localStart.set($event); resetChoice()">
      <app-time-zone-select inputId="groupZone" [label]="i18n.t('refine.zone')" [value]="zone()" (valueChange)="zoneInput.set($event); resetChoice()" />
      @if(choice().failure){<p role="alert" class="text-danger">{{timeError()}}</p>}
      @if(choice().options.length){<fieldset><legend class="h6">{{'refine.chooseTime'|t}}</legend>@for(o of choice().options;track o.offset;let i=$index){<label class="contact"><input type="radio" name="groupOccurrence" [checked]="offset()===o.offset" (change)="choose(o.offset,i)">UTC{{o.offset}} · {{i18n.formatInstant(o.startsAt,zone())}}</label>}</fieldset>}
      @if(choice().value;as v){<p class="group-preview">{{i18n.formatInstant(v.startsAt,zone())}} · {{zone()}} · UTC{{v.utcOffset}}</p>@if(disambiguation()!=='none'){<button type="button" class="btn btn-ghost btn-sm" (click)="resetChoice()">{{'refine.chooseTime'|t}}</button>}}
      <fieldset class="mt-3"><legend class="h5">{{'packages.group.members'|t}}</legend>
        <label for="contactSearch" class="form-label">{{'refine.searchContacts'|t}}</label><input id="contactSearch" type="search" class="form-control" [ngModel]="search()" (ngModelChange)="search.set($event)">
        <p class="small mt-2" role="status">{{'refine.selected'|t:{count:invited().length,capacity:selectedPackage()?.current?.groupSize||0} }}</p>
        <div class="selected-contacts">@for(c of selectedContacts();track c.counterpart.id){<button type="button" class="btn btn-secondary btn-sm" (click)="toggle(c.counterpart.id)">{{c.counterpart.name}} ×</button>}</div>
        <div class="contacts">@for(c of visibleContacts();track c.id){<label class="contact"><input type="checkbox" [checked]="invited().includes(c.counterpart.id)" [disabled]="!invited().includes(c.counterpart.id)&&!!selectedPackage()&&invited().length>=selectedPackage()!.current.groupSize" (change)="toggle(c.counterpart.id)">{{c.counterpart.name}}</label>}@empty{<p class="p-3">{{'refine.contactsEmpty'|t}}</p>}</div>
      </fieldset>
      @if(cursor()){<button type="button" class="btn btn-secondary" [disabled]="busy()" (click)="loadConversations()">{{'packages.group.more'|t}}</button>}
      <div class="group-actions"><button type="button" class="btn btn-primary" [disabled]="!canCreate()" (click)="create()">{{'packages.group.create'|t}}</button><button type="button" class="btn btn-secondary" (click)="creating.set(false)">{{'common.cancel'|t}}</button></div>
    </section>}
  }
  <h2 class="h4">{{'packages.group.existing'|t}}</h2>
  @if(groupsLoading()){<p role="status">{{'packages.loading'|t}}</p>}
  @else if(groupsFailed()){<button type="button" class="btn btn-secondary" (click)="ngOnInit()">{{'packages.purchase.retry'|t}}</button>}
  @else{<ul class="group-list">@for(c of groups();track c.id){<li><a class="group-link" [routerLink]="['/class-cohorts',c.id]"><strong>{{groupName(c)}}</strong><span>{{('packages.group.status.'+c.status)|t}} · {{c.acceptedCount}}/{{c.groupSize}}</span><small>{{i18n.formatInstant(c.tentativeStartsAt,zone())}} · {{zone()}}</small></a></li>}@empty{<li class="state-box">{{'refine.noGroups'|t}}</li>}</ul>}
</div>`})
export class GroupsComponent implements OnInit {
  private api=inject(PackagesService);private chat=inject(ChatService);private router=inject(Router);private destroy=inject(DestroyRef);private preferences=inject(UserPreferencesService);readonly i18n=inject(I18nService);
  templates=signal<CompleteTemplate[]>([]);groups=signal<ClassCohort[]>([]);conversations=signal<Conversation[]>([]);cursor=signal<string|null>(null);selectedId=signal(0);localStart=signal('');invited=signal<number[]>([]);busy=signal(false);creating=signal(false);templatesLoading=signal(true);groupsLoading=signal(true);templatesFailed=signal(false);groupsFailed=signal(false);search=signal('');
  zoneInput=signal('');zone=computed(()=>this.zoneInput()||this.preferences.preferences()?.timeZone||Intl.DateTimeFormat().resolvedOptions().timeZone||'UTC');offset=signal('');disambiguation=signal<Disambiguation>('none');
  selectedPackage=computed(()=>this.templates().find(p=>p.id===this.selectedId()));
  selectedContacts=computed(()=>this.conversations().filter(c=>this.invited().includes(c.counterpart.id)));
  visibleContacts=computed(()=>this.conversations().filter(c=>c.counterpart.name.toLocaleLowerCase(this.i18n.intlLocale()).includes(this.search().trim().toLocaleLowerCase(this.i18n.intlLocale()))));
  choice=computed(()=>localTimeChoice(this.localStart(),this.zone(),this.selectedPackage()?.current.minutesPerSession||50,this.offset(),this.disambiguation()));
  timeError=computed(()=>this.choice().failure?this.i18n.errorMessage({error:this.choice().failure}):'');
  canCreate=computed(()=>!this.busy()&&!!this.selectedPackage()&&!!this.choice().value&&this.invited().length===this.selectedPackage()!.current.groupSize);
  private failure=signal<unknown>(null);error=computed(()=>this.failure()?this.api.error(this.failure()):'');
  ngOnInit(){
    this.failure.set(null);this.templatesFailed.set(false);this.groupsFailed.set(false);this.templatesLoading.set(true);this.groupsLoading.set(true);
    this.api.list().pipe(takeUntilDestroyed(this.destroy)).subscribe({next:r=>{this.templates.set(r.filter(hasVersion).filter(p=>p.status==='active'&&p.current.modality==='group'));this.templatesLoading.set(false);},error:e=>{this.failure.set(e);this.templatesFailed.set(true);this.templatesLoading.set(false);}});
    this.api.groups().pipe(takeUntilDestroyed(this.destroy)).subscribe({next:r=>{this.groups.set(r);this.groupsLoading.set(false);for(const c of r.filter(c=>!c.members?.length))this.api.group(c.id).pipe(takeUntilDestroyed(this.destroy)).subscribe({next:d=>this.groups.update(rows=>rows.map(g=>g.id===d.id?d:g)),error:()=>{}});},error:e=>{this.failure.set(e);this.groupsFailed.set(true);this.groupsLoading.set(false);}});
    this.loadConversations();
  }
  name(p:CompleteTemplate){return this.i18n.locale()==='es'?p.current.nameEs:p.current.nameEn;}
  groupName(c:ClassCohort){return c.members?.map(m=>m.name).filter(Boolean).join(', ')||this.i18n.t('refine.group')+' · '+this.i18n.formatInstant(c.tentativeStartsAt,this.zone());}
  selectPackage(id:number){this.selectedId.set(id);this.resetChoice();}
  resetChoice(){this.offset.set('');this.disambiguation.set('none');}
  choose(offset:string,i:number){this.offset.set(offset);this.disambiguation.set(i?'later':'earlier');}
  toggle(id:number){this.invited.update(ids=>ids.includes(id)?ids.filter(i=>i!==id):[...ids,id]);}
  loadConversations(){this.busy.set(true);this.chat.list(this.cursor()).pipe(takeUntilDestroyed(this.destroy)).subscribe({next:r=>{this.conversations.update(rows=>[...rows,...r.items.filter(c=>!rows.some(x=>x.counterpart.id===c.counterpart.id))]);this.cursor.set(r.nextCursor);this.busy.set(false);},error:e=>{this.failure.set(e);this.busy.set(false);}});}
  create(){const p=this.selectedPackage(),time=this.choice().value;if(!p||!time||!this.canCreate())return;this.busy.set(true);this.failure.set(null);this.api.createGroup({templateVersionId:p.current.id,tentativeStartsAt:time.startsAt,invitedIds:this.invited()}).pipe(takeUntilDestroyed(this.destroy)).subscribe({next:c=>void this.router.navigate(['/class-cohorts',c.id]),error:e=>{this.failure.set(e);this.busy.set(false);}});}
}
