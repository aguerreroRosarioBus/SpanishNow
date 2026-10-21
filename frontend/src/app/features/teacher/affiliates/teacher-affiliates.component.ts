import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { NgbDropdown, NgbDropdownToggle, NgbDropdownMenu, NgbDropdownItem } from '@ng-bootstrap/ng-bootstrap';
import { AffiliateService } from '../../../core/services/affiliate.service';
import { CourseService } from '../../../core/services/course.service';
import { ToastService } from '../../../core/services/toast.service';
import { Course } from '../../../core/models/course.model';
import { Affiliate, AffiliateOrder, AffiliatePayout, AffiliateStat } from '../../../core/models/community.model';
import { IconComponent } from '../../../shared/components/icon/icon.component';
import { ConfirmDialogComponent } from '../../../shared/components/confirm-dialog/confirm-dialog.component';
import { copyText } from '../../../shared/utils/clipboard';
import { formatPrice } from '../../../shared/utils/money';

const CURRENCIES = [
  { code: 'usd', label: 'USD' },
  { code: 'eur', label: 'EUR' },
  { code: 'gbp', label: 'GBP' }
];

/** Afiliados del docente: lista con estadísticas por moneda, alta y edición, links para copiar, órdenes atribuidas y pagos. */
@Component({
  selector: 'app-teacher-affiliates',
  standalone: true,
  imports: [DatePipe, ReactiveFormsModule, NgbDropdown, NgbDropdownToggle, NgbDropdownMenu, NgbDropdownItem, IconComponent, ConfirmDialogComponent],
  templateUrl: './teacher-affiliates.component.html',
  styleUrl: './teacher-affiliates.component.scss'
})
export class TeacherAffiliatesComponent implements OnInit {
  private service = inject(AffiliateService);
  private courseService = inject(CourseService);
  private toast = inject(ToastService);
  private fb = inject(FormBuilder);

  readonly currencies = CURRENCIES;

  affiliates = signal<Affiliate[]>([]);
  courses = signal<Course[]>([]);
  isLoading = signal(true);
  errorMessage = signal('');

  // Alta / edición
  showForm = signal(false);
  editing = signal<Affiliate | null>(null);
  isSaving = signal(false);
  formError = signal('');
  form = this.fb.group({
    name: ['', [Validators.required, Validators.maxLength(120)]],
    email: ['', [Validators.required, Validators.email]],
    commissionPercent: [20 as number | null, [Validators.required, Validators.min(1), Validators.max(90)]],
    notes: [''],
    active: [true]
  });

  // Links
  linksFor = signal<Affiliate | null>(null);
  linkCourseId = signal<number | null>(null);
  /** Tokens obtenidos al regenerar (la lista no los trae). */
  tokens = signal<Record<number, string>>({});
  coursesWithSlug = computed(() => this.courses().filter(c => !!c.slug && c.isPublished !== false));
  saleLink = computed(() => {
    const a = this.linksFor();
    const slug = this.courses().find(c => c.id === this.linkCourseId())?.slug;
    return a && slug ? `${window.location.origin}/courses/${encodeURIComponent(slug)}?ref=${encodeURIComponent(a.code)}` : '';
  });
  panelLink = computed(() => {
    const a = this.linksFor();
    const token = a ? (this.tokens()[a.id] ?? a.dashboardToken) : '';
    return token ? `${window.location.origin}/affiliate/${encodeURIComponent(token)}` : '';
  });
  /** Link que el navegador no dejó copiar (se muestra para copiarlo a mano). */
  manualLink = signal('');

  // Regenerar token / eliminar
  toRegenerate = signal<Affiliate | null>(null);
  toDelete = signal<Affiliate | null>(null);

  // Detalle
  detail = signal<Affiliate | null>(null);
  detailLoading = signal(false);
  detailError = signal('');
  orders = signal<AffiliateOrder[]>([]);
  payouts = signal<AffiliatePayout[]>([]);
  payoutToDelete = signal<AffiliatePayout | null>(null);
  isPaying = signal(false);
  payoutError = signal('');
  payoutForm = this.fb.group({
    amount: [null as number | null, [Validators.required, Validators.min(0.01)]],
    currency: ['usd'],
    paidAt: [''],
    note: ['', [Validators.maxLength(300)]]
  });

  ngOnInit(): void {
    this.courseService.getCourses().subscribe({ next: list => this.courses.set(list), error: () => { /* los links de venta quedan sin cursos */ } });
    this.load();
  }

  load(): void {
    this.isLoading.set(true);
    this.errorMessage.set('');
    this.service.list().subscribe({
      next: list => {
        this.affiliates.set(list);
        // El detalle abierto toma las cifras nuevas
        const open = this.detail();
        if (open) this.detail.set(list.find(a => a.id === open.id) ?? open);
        this.isLoading.set(false);
      },
      error: () => { this.errorMessage.set('No se pudieron cargar los afiliados.'); this.isLoading.set(false); }
    });
  }

  // ===== Presentación =====

  money(cents: number, currency: string): string { return formatPrice(cents, currency, 'es'); }
  /** Cifras de una columna, una línea por moneda. */
  hasStats(a: Affiliate): boolean { return (a.stats ?? []).length > 0; }
  statValue(s: AffiliateStat, field: 'sales' | 'commission' | 'paid' | 'owed'): string { return this.money(s[field], s.currency); }
  commissionLabel(o: AffiliateOrder): string {
    if (o.commissionStatus === 'void') return 'Anulada';
    return o.commissionStatus === 'pending' ? 'Pendiente' : 'Sin comisión';
  }

  // ===== Alta / edición =====

  openCreate(): void {
    this.editing.set(null);
    this.form.reset({ name: '', email: '', commissionPercent: 20, notes: '', active: true });
    this.formError.set('');
    this.showForm.set(true);
  }

  openEdit(a: Affiliate): void {
    this.editing.set(a);
    this.form.reset({ name: a.name, email: a.email, commissionPercent: a.commissionPercent, notes: a.notes ?? '', active: a.active });
    this.formError.set('');
    this.showForm.set(true);
  }

  closeForm(): void { if (!this.isSaving()) this.showForm.set(false); }

  save(): void {
    const v = this.form.getRawValue();
    const percent = Number(v.commissionPercent);
    if (this.form.controls.name.invalid || !v.name?.trim()) { this.formError.set('Ingresá el nombre del afiliado.'); return; }
    if (this.form.controls.email.invalid) { this.formError.set('Ingresá un email válido.'); return; }
    if (!Number.isInteger(percent) || percent < 1 || percent > 90) { this.formError.set('La comisión debe ser un número entero entre 1 y 90.'); return; }
    const editing = this.editing();
    const input = { name: v.name.trim(), email: v.email!.trim(), commissionPercent: percent, notes: v.notes?.trim() || null };

    this.isSaving.set(true);
    this.formError.set('');
    const request = editing ? this.service.update(editing.id, { ...input, active: !!v.active }) : this.service.create(input);
    request.subscribe({
      next: created => {
        this.isSaving.set(false);
        this.showForm.set(false);
        if (!editing && created?.id) this.rememberToken(created);
        this.toast.success(editing ? 'Afiliado actualizado' : 'Afiliado creado');
        this.load();
      },
      error: err => { this.isSaving.set(false); this.formError.set(err?.error?.error || 'No se pudo guardar el afiliado.'); }
    });
  }

  private rememberToken(a: Affiliate): void {
    if (a.dashboardToken) this.tokens.update(m => ({ ...m, [a.id]: a.dashboardToken! }));
  }

  toggleActive(a: Affiliate): void {
    this.service.update(a.id, { active: !a.active }).subscribe({
      next: () => { this.toast.success(a.active ? 'Afiliado desactivado' : 'Afiliado activado'); this.load(); },
      error: err => this.toast.error(err?.error?.error || 'No se pudo cambiar el estado del afiliado')
    });
  }

  // ===== Links =====

  openLinks(a: Affiliate): void {
    this.manualLink.set('');
    this.linkCourseId.set(this.coursesWithSlug()[0]?.id ?? null);
    this.linksFor.set(a);
  }
  closeLinks(): void { this.linksFor.set(null); }
  onLinkCourse(value: string): void { this.linkCourseId.set(value ? +value : null); }

  async copyLink(link: string): Promise<void> {
    if (!link) return;
    if (await copyText(link)) { this.manualLink.set(''); this.toast.success('Link copiado'); }
    else this.manualLink.set(link);
  }

  askRegenerate(a: Affiliate): void { this.toRegenerate.set(a); }
  cancelRegenerate(): void { this.toRegenerate.set(null); }
  confirmRegenerate(): void {
    const a = this.toRegenerate();
    this.toRegenerate.set(null);
    if (!a) return;
    this.service.regenerateToken(a.id).subscribe({
      next: ({ dashboardToken }) => {
        this.tokens.update(m => ({ ...m, [a.id]: dashboardToken }));
        this.toast.success('Link del panel regenerado. El anterior ya no funciona.');
        if (!this.linksFor()) this.openLinks(a);
      },
      error: err => this.toast.error(err?.error?.error || 'No se pudo regenerar el link del panel')
    });
  }

  // ===== Eliminar =====

  askDelete(a: Affiliate): void { this.toDelete.set(a); }
  cancelDelete(): void { this.toDelete.set(null); }
  confirmDelete(): void {
    const a = this.toDelete();
    this.toDelete.set(null);
    if (!a) return;
    this.service.remove(a.id).subscribe({
      next: () => { this.toast.success('Afiliado eliminado'); this.load(); },
      error: err => {
        // 409: tiene ventas; el servidor lo desactiva en su lugar
        if (err?.status === 409) { this.toast.warning(err?.error?.error || 'El afiliado tiene ventas: se desactivó en lugar de eliminarse.'); this.load(); }
        else this.toast.error(err?.error?.error || 'No se pudo eliminar el afiliado');
      }
    });
  }

  // ===== Detalle: órdenes y pagos =====

  openDetail(a: Affiliate): void {
    this.detail.set(a);
    this.orders.set([]);
    this.payouts.set([]);
    this.detailError.set('');
    this.payoutError.set('');
    this.payoutForm.reset({ amount: null, currency: a.stats?.[0]?.currency ?? 'usd', paidAt: new Date().toISOString().slice(0, 10), note: '' });
    this.detailLoading.set(true);
    let pending = 2;
    const done = () => { if (--pending === 0) this.detailLoading.set(false); };
    const fail = () => { this.detailError.set('No se pudo cargar todo el detalle del afiliado.'); done(); };
    this.service.orders(a.id).subscribe({ next: rows => { this.orders.set(rows); done(); }, error: fail });
    this.service.payouts(a.id).subscribe({ next: rows => { this.payouts.set(rows); done(); }, error: fail });
  }
  closeDetail(): void { if (!this.isPaying()) this.detail.set(null); }

  savePayout(): void {
    const a = this.detail();
    if (!a || this.isPaying()) return;
    const v = this.payoutForm.getRawValue();
    const amount = Math.round(Number(v.amount) * 100);
    if (!(amount > 0)) { this.payoutError.set('Ingresá un monto mayor que 0.'); return; }
    if (!v.paidAt) { this.payoutError.set('Elige la fecha del pago.'); return; }
    this.isPaying.set(true);
    this.payoutError.set('');
    this.service.addPayout(a.id, { amount, currency: v.currency || 'usd', paidAt: v.paidAt, note: v.note?.trim() || null }).subscribe({
      next: () => {
        this.isPaying.set(false);
        this.payoutForm.patchValue({ amount: null, note: '' });
        this.toast.success('Pago registrado');
        this.service.payouts(a.id).subscribe({ next: rows => this.payouts.set(rows) });
        this.load();
      },
      error: err => { this.isPaying.set(false); this.payoutError.set(err?.error?.error || 'No se pudo registrar el pago.'); }
    });
  }

  askDeletePayout(p: AffiliatePayout): void { this.payoutToDelete.set(p); }
  cancelDeletePayout(): void { this.payoutToDelete.set(null); }
  confirmDeletePayout(): void {
    const a = this.detail();
    const p = this.payoutToDelete();
    this.payoutToDelete.set(null);
    if (!a || !p) return;
    this.service.removePayout(a.id, p.id).subscribe({
      next: () => {
        this.payouts.update(list => list.filter(x => x.id !== p.id));
        this.toast.success('Pago eliminado');
        this.load();
      },
      error: err => this.toast.error(err?.error?.error || 'No se pudo eliminar el pago')
    });
  }

}
