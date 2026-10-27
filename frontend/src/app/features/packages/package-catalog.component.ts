import { parseMoneyInput, moneyInputValue } from '../../shared/utils/money-input';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule, FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { forkJoin } from 'rxjs';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { I18nService } from '../../core/i18n/i18n.service';
import { EXPECTATION_FIELDS } from '../legal/legal.model';
import { PackagesService } from './packages.service';
import { ClassSettings, PackageTemplate } from './packages.model';
import { PackageOrientationComponent } from './package-orientation.component';
import { DialogModule } from 'primeng/dialog';
import { NgbDropdownModule } from '@ng-bootstrap/ng-bootstrap';
import { IconComponent } from '../../shared/components/icon/icon.component';
import { PilotTheme } from '../../shared/styles/primeng-theme';
import { ConfirmDialogComponent } from '../../shared/components/confirm-dialog/confirm-dialog.component';
import { RestoreFocusDirective } from '../../shared/directives/restore-focus.directive';
const editable = ['nameEn','nameEs','descriptionEn','descriptionEs','modality','groupSize','billing','sessionsCount','minutesPerSession','seatsCovered','priceAmount','currency','validityHours','policyVersionId','hotmartProductId','hotmartOfferCode','hotmartCheckoutUrl'] as const;
@Component({
  selector:'app-package-catalog', standalone:true, imports:[TranslatePipe,FormsModule,ReactiveFormsModule,PackageOrientationComponent,DialogModule,NgbDropdownModule,IconComponent,RestoreFocusDirective,ConfirmDialogComponent],
  templateUrl:'./package-catalog.component.html', styleUrl:'./package-catalog.component.scss'
})
export class PackageCatalogComponent implements OnInit {
  private readonly pilotTheme = inject(PilotTheme);
  private api = inject(PackagesService);
  readonly i18n = inject(I18nService);
  private fb = inject(FormBuilder);
  readonly fields = EXPECTATION_FIELDS;
  readonly locales = ['en','es'] as const;
  readonly textFields = ['nameEn','nameEs'] as const;
  readonly providerFields=['hotmartProductId','hotmartOfferCode','hotmartCheckoutUrl'] as const;
  readonly descriptionFields=['descriptionEn','descriptionEs'] as const;
  readonly numberFields = ['sessionsCount','minutesPerSession'] as const;
  readonly currencies=['USD','ARS','EUR','GBP','BRL','MXN','JPY'];
  currencyName(code:string){try{return new Intl.DisplayNames([this.i18n.intlLocale()],{type:'currency'}).of(code.toUpperCase())||code;}catch{return code;}}
  priceText=signal(''); validityInDays=signal(true);
  priceValid(){return parseMoneyInput(this.priceText(),this.form.get('currency')?.value||'USD')!==null;}
  setPrice(text:string){this.priceText.set(text);this.form.patchValue({priceAmount:parseMoneyInput(text,this.form.get('currency')?.value||'USD')});}
  setCurrency(value:string){this.form.patchValue({currency:value});this.setPrice(this.priceText());}
  validityValue(){const hours=this.form.get('validityHours')?.value;return hours?(this.validityInDays()?hours/24:hours):'';}
  setValidity(value:string){const n=Number(value);this.form.patchValue({validityHours:Number.isSafeInteger(n)&&n>0?n*(this.validityInDays()?24:1):null});}
  statusFilter=signal('all');
  visibleItems=computed(()=>this.items().filter(t=>this.statusFilter()==='all'||t.status===this.statusFilter()).slice().sort((a,b)=>({active:0,draft:1,paused:2,archived:3}[a.status]-{active:0,draft:1,paused:2,archived:3}[b.status])));

  items = signal<PackageTemplate[]>([]);
  settings = signal<ClassSettings|null>(null);
  selected = signal<PackageTemplate|null>(null);
  busy = signal(false);
  private failure = signal<unknown>(null);
  error = computed(()=> this.failure() ? this.api.error(this.failure()) : '');
  saved = signal(false);
  /** `edit` modifica un paquete existente; `create` y `duplicate` abren el mismo editor para un paquete nuevo (nace borrador). */
  mode = signal<'edit'|'create'|'duplicate'|null>(null);
  editorOpen = computed(()=>this.mode()!==null);
  notice = signal(false);
  archiveTarget = signal<PackageTemplate|null>(null);
  closeEditor() { if (!this.busy()) { this.selected.set(null); this.mode.set(null); } }
  readonly form: FormGroup = this.fb.group({
    ...Object.fromEntries(editable.map(k=>[k,['',k.startsWith('name') ? Validators.required : []]])),
    expectations:this.fb.group(Object.fromEntries(this.locales.map(l=>[l,this.fb.group(Object.fromEntries(EXPECTATION_FIELDS.map(k=>[k,['',Validators.maxLength(4000)]])))])))
  });
  ngOnInit() { this.reload(); }
  reload() {
    this.busy.set(true); this.failure.set(null);
    forkJoin({items:this.api.list(),settings:this.api.settings()}).subscribe({next:r=>{this.items.set(r.items);this.settings.set(r.settings);this.busy.set(false);},error:e=>this.fail(e)});
  }
  importInitial() {
    if(this.busy()) return; this.busy.set(true); this.failure.set(null);
    this.api.importInitial().subscribe({next:items=>{this.items.set(items);this.busy.set(false);this.api.settings().subscribe(s=>this.settings.set(s));},error:e=>this.fail(e)});
  }
  /** Plantilla sin versión vigente: no tiene nombre ni condiciones que mostrar (ver `PackageTemplate.current`). */
  incomplete(t: PackageTemplate) { return !t.current; }
  name(t: PackageTemplate) { return !t.current ? t.templateKey : this.i18n.locale()==='es' ? t.current.nameEs : t.current.nameEn; }
  startCreate() { this.openNew('create', null); }
  duplicate(t: PackageTemplate) { this.openNew('duplicate', t); }
  private openNew(mode: 'create'|'duplicate', source: PackageTemplate|null) {
    this.selected.set(null); this.mode.set(mode); this.saved.set(false); this.notice.set(false); this.failure.set(null);
    const blank = Object.fromEntries(this.locales.map(l => [l, Object.fromEntries(this.fields.map(k => [k, '']))]));
    const base = source ? (source.current ?? source.lastVersion) : null;
    this.form.reset();
    if (base) {
      // Se copian producto y link de Hotmart, pero no el código de oferta: cada precio necesita su propia oferta.
      this.form.patchValue({ ...base, nameEn:`${base.nameEn} (copy)`, nameEs:`${base.nameEs} (copia)`,
        hotmartOfferCode:'', policyVersionId:'', expectations: base.expectations ?? blank });
    } else {
      this.form.patchValue({ modality:'individual', groupSize:1, billing:'per_buyer', seatsCovered:1, currency:'USD', expectations: blank });
    }
    this.priceText.set(base?.priceAmount?moneyInputValue(base.priceAmount,base.currency):'');
    this.validityInDays.set(!base?.validityHours||base.validityHours%24===0);
  }
  /** Clave técnica única por docente: slug ASCII del nombre en español más un sufijo corto aleatorio. */
  templateKey(name: string) {
    const slug = name.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,50).replace(/-+$/,'') || 'paquete';
    return `${slug}-${Math.random().toString(36).slice(2,6).padEnd(4,'0')}`;
  }
  askArchive(t: PackageTemplate) { if (!this.busy()) this.archiveTarget.set(t); }
  confirmArchive() { const t=this.archiveTarget(); this.archiveTarget.set(null); if (t) this.status(t,'archived'); }
  edit(t: PackageTemplate) {
    this.selected.set(t); this.mode.set('edit'); this.saved.set(false); this.notice.set(false); this.failure.set(null);
    const blank = Object.fromEntries(this.locales.map(l => [l, Object.fromEntries(this.fields.map(k => [k, '']))]));
    this.form.reset();
    // Sin versión vigente se parte de la última guardada, si la hay; si no, solo de la modalidad individual y el docente
    // completa nombre, importe y duración.
    const base = t.current ?? t.lastVersion;
    this.form.patchValue(base ? { ...base, expectations: base.expectations ?? blank }
      : { modality:'individual', groupSize:1, billing:'per_buyer', seatsCovered:1, currency:'USD', expectations: blank });
    this.priceText.set(base?.priceAmount?moneyInputValue(base.priceAmount,base.currency):'');
    this.validityInDays.set(!base?.validityHours||base.validityHours%24===0);
  }
  private create(retry=true) {
    const body = this.form.getRawValue();
    if (body.policyVersionId == null || body.policyVersionId === '') delete body.policyVersionId;
    for (const k of this.providerFields) if (!body[k]) delete body[k];
    this.api.create({...body,templateKey:this.templateKey(body.nameEs||body.nameEn)}).subscribe({
      next:t=>{this.items.update(items=>[...items,t]);this.mode.set(null);this.notice.set(true);this.busy.set(false);},
      error:e=>{ if ((e as {error?:{code?:string}})?.error?.code==='template_key_conflict' && retry) this.create(false); else this.fail(e); }
    });
  }
  save() {
    if (this.mode()==='create' || this.mode()==='duplicate') {
      if (this.busy() || this.form.invalid || !this.priceValid() || !Number.isSafeInteger(this.form.get('validityHours')?.value) || this.form.get('validityHours')?.value<1) return;
      this.busy.set(true); this.failure.set(null); this.create(); return;
    }
    const t=this.selected(); if(!t || this.busy() || this.form.invalid || !this.priceValid() || !Number.isSafeInteger(this.form.get('validityHours')?.value) || this.form.get('validityHours')?.value<1) return;
    this.busy.set(true); this.failure.set(null); this.saved.set(false);
    const body = this.form.getRawValue();
    if (body.policyVersionId == null || body.policyVersionId === '') delete body.policyVersionId; // el backend usa la política vigente
    // `version: 0` completa una plantilla que quedó sin versión vigente.
    this.api.save(t.id,{...body,version:t.current?.version ?? 0}).subscribe({next:s=>{this.replace(s);this.selected.set(s);this.saved.set(true);this.busy.set(false);},error:e=>this.fail(e)});
  }
  status(t: PackageTemplate, status: string) {
    if(this.busy() || !t.current) return; this.busy.set(true); this.failure.set(null);
    this.api.status(t.id,status,t.current.version).subscribe({next:s=>{this.replace(s);this.busy.set(false);},error:e=>this.fail(e)});
  }
  pause() {
    const s=this.settings(); if(!s || this.busy()) return; this.busy.set(true); this.failure.set(null);
    this.api.pause(!s.salesPausedAt).subscribe({next:s=>{this.settings.set(s);this.busy.set(false);},error:e=>this.fail(e)});
  }
  modality(value: string) {
    const size=Number(value); this.form.patchValue({modality:size===1?'individual':'group',groupSize:size,billing:size===1?'per_buyer':size===2?'per_group':'per_seat',seatsCovered:size===2?2:1});
  }
  private replace(t: PackageTemplate) { this.items.update(items=>items.map(x=>x.id===t.id?t:x)); }
  private fail(e: unknown) { this.failure.set(e); this.busy.set(false); }
}
