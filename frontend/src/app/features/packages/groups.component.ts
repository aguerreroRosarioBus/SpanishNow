import {Component,OnInit,DestroyRef,computed,inject,signal} from '@angular/core';
import {FormsModule} from '@angular/forms';
import {Router,RouterLink} from '@angular/router';
import {takeUntilDestroyed} from '@angular/core/rxjs-interop';
import {TranslatePipe} from '../../core/i18n/translate.pipe';
import {I18nService} from '../../core/i18n/i18n.service';
import {ChatService} from '../../core/services/chat.service';
import {Conversation} from '../../core/models/chat.model';
import {PackagesService} from './packages.service';
import {ClassCohort,CompleteTemplate,hasVersion} from './packages.model';
@Component({selector:'app-package-groups',standalone:true,imports:[FormsModule,RouterLink,TranslatePipe],template:`
<div class="page-container"><h1>{{'packages.group.manage'|t}}</h1>
@if(error()){<p class="alert alert-danger" role="alert">{{error()}}</p>}
<p>{{'packages.group.agreement'|t}}</p>
<label for="groupPackage" class="form-label">{{'packages.offer.choose'|t}}</label><select id="groupPackage" class="form-select" [ngModel]="selectedId()" (ngModelChange)="selectedId.set($event)"><option [ngValue]="0">{{'packages.offer.choose'|t}}</option>@for(p of templates();track p.id){<option [ngValue]="p.id">{{name(p)}} · {{i18n.formatMoney(p.current.priceAmount,p.current.currency)}}</option>}</select>
<label for="groupInstant" class="form-label mt-3">{{'packages.group.instantInput'|t}}</label><input id="groupInstant" class="form-control" placeholder="2026-11-01T14:00:00-03:00" [ngModel]="startsAt()" (ngModelChange)="startsAt.set($event)">
<fieldset class="mt-3"><legend class="h5">{{'packages.group.members'|t}}</legend>@for(c of conversations();track c.id){<label class="d-block"><input type="checkbox" [checked]="invited().includes(c.counterpart.id)" (change)="toggle(c.counterpart.id)"> {{c.counterpart.name}}</label>}</fieldset>
@if(cursor()){<button class="btn btn-secondary my-2" [disabled]="busy()" (click)="loadConversations()">{{'packages.group.more'|t}}</button>}
<button class="btn btn-primary my-3 d-block" [disabled]="busy()||!selectedId()||!startsAt().trim()" (click)="create()">{{'packages.group.create'|t}}</button>
<h2 class="h4">{{'packages.group.existing'|t}}</h2>@for(c of groups();track c.id){<p><a [routerLink]="['/class-cohorts',c.id]">#{{c.id}} · {{('packages.group.status.'+c.status)|t}} · {{c.acceptedCount}}/{{c.groupSize}}</a></p>}
</div>`})
export class GroupsComponent implements OnInit{
  private api=inject(PackagesService);private chat=inject(ChatService);private router=inject(Router);private destroy=inject(DestroyRef);readonly i18n=inject(I18nService);
  templates=signal<CompleteTemplate[]>([]);groups=signal<ClassCohort[]>([]);conversations=signal<Conversation[]>([]);cursor=signal<string|null>(null);selectedId=signal(0);startsAt=signal('');invited=signal<number[]>([]);busy=signal(false);
  private failure=signal<unknown>(null);error=computed(()=>this.failure()?this.api.error(this.failure()):'');
  ngOnInit(){this.api.list().pipe(takeUntilDestroyed(this.destroy)).subscribe({next:r=>this.templates.set(r.filter(hasVersion).filter(p=>p.status==='active'&&p.current.modality==='group')),error:e=>this.failure.set(e)});this.api.groups().pipe(takeUntilDestroyed(this.destroy)).subscribe({next:r=>this.groups.set(r),error:e=>this.failure.set(e)});this.loadConversations();}
  name(p:CompleteTemplate){return this.i18n.locale()==='es'?p.current.nameEs:p.current.nameEn;}
  toggle(id:number){this.invited.update(ids=>ids.includes(id)?ids.filter(i=>i!==id):[...ids,id]);}
  loadConversations(){this.busy.set(true);this.chat.list(this.cursor()).pipe(takeUntilDestroyed(this.destroy)).subscribe({next:r=>{this.conversations.update(rows=>[...rows,...r.items.filter(c=>!rows.some(x=>x.id===c.id))]);this.cursor.set(r.nextCursor);this.busy.set(false);},error:e=>{this.failure.set(e);this.busy.set(false);}});}
  create(){const p=this.templates().find(p=>p.id===this.selectedId());if(!p||this.busy())return;this.busy.set(true);this.failure.set(null);this.api.createGroup({templateVersionId:p.current.id,tentativeStartsAt:this.startsAt().trim(),invitedIds:this.invited()}).pipe(takeUntilDestroyed(this.destroy)).subscribe({next:c=>void this.router.navigate(['/class-cohorts',c.id]),error:e=>{this.failure.set(e);this.busy.set(false);}});}
}
