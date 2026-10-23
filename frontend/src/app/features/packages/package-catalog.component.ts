import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule, FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { forkJoin } from 'rxjs';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { I18nService } from '../../core/i18n/i18n.service';
import { EXPECTATION_FIELDS } from '../legal/legal.model';
import { PackagesService } from './packages.service';
import { ClassSettings, PackageTemplate } from './packages.model';
const editable = ['nameEn','nameEs','descriptionEn','descriptionEs','modality','groupSize','billing','sessionsCount','minutesPerSession','seatsCovered','priceAmount','currency','validityHours','policyVersionId','hotmartProductId','hotmartOfferCode','hotmartCheckoutUrl'] as const;
@Component({
  selector:'app-package-catalog', standalone:true, imports:[TranslatePipe,FormsModule,ReactiveFormsModule],
  templateUrl:'./package-catalog.component.html'
})
export class PackageCatalogComponent implements OnInit {
  private api = inject(PackagesService);
  readonly i18n = inject(I18nService);
  private fb = inject(FormBuilder);
  readonly fields = EXPECTATION_FIELDS;
  readonly locales = ['en','es'] as const;
  readonly textFields = ['nameEn','nameEs','descriptionEn','descriptionEs','hotmartProductId','hotmartOfferCode','hotmartCheckoutUrl'] as const;
  readonly numberFields = ['sessionsCount','minutesPerSession','priceAmount','validityHours','policyVersionId'] as const;
  items = signal<PackageTemplate[]>([]);
  settings = signal<ClassSettings|null>(null);
  selected = signal<PackageTemplate|null>(null);
  busy = signal(false);
  private failure = signal<unknown>(null);
  error = computed(()=> this.failure() ? this.api.error(this.failure()) : '');
  saved = signal(false);
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
  edit(t: PackageTemplate) {
    this.selected.set(t); this.saved.set(false); this.failure.set(null);
    const blank = Object.fromEntries(this.locales.map(l => [l, Object.fromEntries(this.fields.map(k => [k, '']))]));
    this.form.reset();
    // Sin versión vigente se parte de la última guardada, si la hay; si no, solo de la modalidad individual y el docente
    // completa nombre, importe y duración.
    const base = t.current ?? t.lastVersion;
    this.form.patchValue(base ? { ...base, expectations: base.expectations ?? blank }
      : { modality:'individual', groupSize:1, billing:'per_buyer', seatsCovered:1, currency:'USD', expectations: blank });
  }
  save() {
    const t=this.selected(); if(!t || this.busy() || this.form.invalid) return;
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
