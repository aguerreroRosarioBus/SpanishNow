import { NgbTooltip } from '@ng-bootstrap/ng-bootstrap';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { CouponService } from '../../../core/services/coupon.service';
import { CourseService } from '../../../core/services/course.service';
import { ToastService } from '../../../core/services/toast.service';
import { Course } from '../../../core/models/course.model';
import { Coupon, CouponInput } from '../../../core/models/sales.model';
import { IconComponent } from '../../../shared/components/icon/icon.component';
import { ConfirmDialogComponent } from '../../../shared/components/confirm-dialog/confirm-dialog.component';
import { applyDiscount, normalizeCouponCode } from '../../../shared/utils/coupon-price';
import { I18nService } from '../../../core/i18n/i18n.service';
import { TranslatePipe } from '../../../core/i18n/translate.pipe';

type DiscountKind = 'percent' | 'amount';

/** Cupones del docente: lista, alta y edición, desactivar, borrar y link de venta con el cupón. */
@Component({
  selector: 'app-teacher-coupons',
  standalone: true,
  imports: [NgbTooltip, ReactiveFormsModule, IconComponent, ConfirmDialogComponent, TranslatePipe],
  templateUrl: './teacher-coupons.component.html',
  styleUrl: './teacher-coupons.component.scss'
})
export class TeacherCouponsComponent implements OnInit {
  private service = inject(CouponService);
  private courseService = inject(CourseService);
  private toast = inject(ToastService);
  private i18n = inject(I18nService);

  readonly currencies = [
    { code: 'usd', label: 'USD' },
    { code: 'eur', label: 'EUR' },
    { code: 'gbp', label: 'GBP' }
  ];

  coupons = signal<Coupon[]>([]);
  courses = signal<Course[]>([]);
  isLoading = signal(true);
  private loadFailed = signal(false);
  errorMessage = computed(() => this.loadFailed() ? this.i18n.t('teacherPromotions.couponsError') : '');

  // Formulario (modal) crear/editar
  showForm = signal(false);
  editing = signal<Coupon | null>(null);
  isSaving = signal(false);
  private formFailure = signal<{key: string; error?: unknown} | null>(null);
  formError = computed(() => { const f = this.formFailure(); return f ? this.i18n.errorMessage(f.error, f.key) : ''; });
  kind = signal<DiscountKind>('percent');
  /** Con usos, el código y el descuento no se pueden cambiar. */
  locked = computed(() => (this.editing()?.redemptions ?? 0) > 0);

  form = inject(FormBuilder).group({
    code: ['', [Validators.required, Validators.pattern(/^[A-Z0-9-]{1,40}$/)]],
    percentOff: [10 as number | null, [Validators.min(1), Validators.max(100)]],
    amountOff: [null as number | null, [Validators.min(0.01)]],
    currency: ['usd'],
    courseId: [null as number | null],
    maxRedemptions: [null as number | null, [Validators.min(1)]],
    expiresAt: [''],
    active: [true]
  });

  // Confirmación de borrado
  toDelete = signal<Coupon | null>(null);
  /** Curso elegido para el link de un cupón válido para todos los cursos. */
  linkCourse = signal<Record<number, number>>({});

  /** Ejemplo de precio para el curso elegido (solo orientativo; el servidor calcula el real). */
  example = computed(() => {
    const course = this.courses().find(c => c.id === this.formCourseId());
    if (!course || !course.price) return '';
    const rule = this.currentRule();
    const result = rule ? applyDiscount(course.price, course.currency || 'usd', rule) : null;
    if (!result) return rule?.amountOff != null ? this.i18n.t('teacherPromotions.currencyMismatch') : '';
    const currency = course.currency || 'usd';
    return this.i18n.t('teacherPromotions.example', {
      title: course.title, original: this.i18n.formatMoney(result.originalAmount, currency), final: this.i18n.formatMoney(result.amount, currency)
    });
  });
  private formVersion = signal(0);
  private formCourseId = computed(() => { this.formVersion(); return this.form.controls.courseId.value; });
  private currentRule() {
    this.formVersion();
    const v = this.form.getRawValue();
    if (this.kind() === 'percent') return v.percentOff ? { percentOff: Number(v.percentOff), amountOff: null } : null;
    return v.amountOff ? { percentOff: null, amountOff: Math.round(Number(v.amountOff) * 100), currency: v.currency } : null;
  }

  constructor() {
    this.form.valueChanges.subscribe(() => this.formVersion.update(n => n + 1));
  }

  ngOnInit(): void {
    this.courseService.getCourses().subscribe({ next: list => this.courses.set(list), error: () => { /* el select de curso queda vacío */ } });
    this.load();
  }

  load(): void {
    this.isLoading.set(true);
    this.loadFailed.set(false);
    this.service.list().subscribe({
      next: list => { this.coupons.set(list); this.isLoading.set(false); },
      error: () => { this.loadFailed.set(true); this.isLoading.set(false); }
    });
  }

  // ===== Presentación =====

  discountLabel(c: Coupon): string {
    return c.percentOff != null ? this.i18n.formatNumber(c.percentOff / 100, {style: 'percent'}) : this.i18n.formatMoney(c.amountOff ?? 0, c.currency || 'usd');
  }
  courseLabel(c: Coupon): string {
    if (c.courseId == null) return this.i18n.t('teacherPromotions.allCourses');
    return c.course?.title ?? this.courses().find(x => x.id === c.courseId)?.title ?? this.i18n.t('teacherPromotions.courseNumber', {id: c.courseId});
  }
  usageLabel(c: Coupon): string {
    const used = this.i18n.formatNumber(c.redemptions);
    return c.maxRedemptions != null ? `${used}/${this.i18n.formatNumber(c.maxRedemptions)}` : used;
  }
  /** El vencimiento se elige como día de calendario (se guarda a 00:00 UTC): se muestra en UTC para no correrlo de día. */
  date(value: string): string { return this.i18n.formatInstant(value, 'UTC', {dateStyle: 'medium'}); }
  isExpired(c: Coupon): boolean { return !!c.expiresAt && new Date(c.expiresAt).getTime() < Date.now(); }
  coursesWithSlug = computed(() => this.courses().filter(c => !!c.slug));

  // ===== Formulario =====

  openCreate(): void {
    this.editing.set(null);
    this.kind.set('percent');
    this.form.reset({ code: '', percentOff: 10, amountOff: null, currency: 'usd', courseId: null, maxRedemptions: null, expiresAt: '', active: true });
    this.enableAll();
    this.formFailure.set(null);
    this.showForm.set(true);
  }

  openEdit(c: Coupon): void {
    this.editing.set(c);
    this.kind.set(c.percentOff != null ? 'percent' : 'amount');
    this.form.reset({
      code: c.code,
      percentOff: c.percentOff,
      amountOff: c.amountOff != null ? c.amountOff / 100 : null,
      currency: c.currency || 'usd',
      courseId: c.courseId,
      maxRedemptions: c.maxRedemptions,
      expiresAt: c.expiresAt ? c.expiresAt.slice(0, 10) : '',
      active: c.active
    });
    this.enableAll();
    if (c.redemptions > 0) {
      for (const name of ['code', 'percentOff', 'amountOff', 'currency', 'courseId'] as const) this.form.controls[name].disable();
    }
    this.formFailure.set(null);
    this.showForm.set(true);
  }

  private enableAll(): void { Object.values(this.form.controls).forEach(c => c.enable()); }

  closeForm(): void { if (!this.isSaving()) this.showForm.set(false); }

  setKind(kind: DiscountKind): void { if (!this.locked()) this.kind.set(kind); }

  onCodeInput(): void {
    const control = this.form.controls.code;
    const normalized = normalizeCouponCode(control.value);
    if (normalized !== control.value) control.setValue(normalized);
  }

  /** Valida lo mismo que la API antes de enviar. Devuelve la clave del error o '' si está bien. */
  private validate(): string {
    const v = this.form.getRawValue();
    if (!this.locked() && !/^[A-Z0-9-]{1,40}$/.test(v.code ?? '')) return 'teacherPromotions.codeError';
    if (!this.locked()) {
      if (this.kind() === 'percent') {
        const p = Number(v.percentOff);
        if (!Number.isInteger(p) || p < 1 || p > 100) return 'teacherPromotions.percentError';
      } else {
        const a = Number(v.amountOff);
        if (!(a > 0)) return 'teacherPromotions.amountError';
        if (!v.currency) return 'teacherPromotions.selectCurrency';
      }
    }
    if (v.maxRedemptions != null && (!Number.isInteger(Number(v.maxRedemptions)) || Number(v.maxRedemptions) < 1)) return 'teacherPromotions.maxError';
    return '';
  }

  save(): void {
    const error = this.validate();
    if (error) { this.formFailure.set({key: error}); return; }
    const v = this.form.getRawValue();
    const maxRedemptions = v.maxRedemptions != null && `${v.maxRedemptions}` !== '' ? Number(v.maxRedemptions) : null;
    const expiresAt = v.expiresAt ? v.expiresAt : null;
    const editing = this.editing();

    // Con usos solo se pueden cambiar activo, vencimiento y máximo
    const input: Partial<CouponInput> = this.locked()
      ? { active: !!v.active, expiresAt, maxRedemptions }
      : {
          code: v.code!,
          percentOff: this.kind() === 'percent' ? Number(v.percentOff) : null,
          amountOff: this.kind() === 'amount' ? Math.round(Number(v.amountOff) * 100) : null,
          currency: this.kind() === 'amount' ? v.currency : null,
          courseId: v.courseId != null ? Number(v.courseId) : null,
          maxRedemptions, expiresAt, active: !!v.active
        };

    this.isSaving.set(true);
    this.formFailure.set(null);
    const request = editing ? this.service.update(editing.id, input) : this.service.create(input as CouponInput);
    request.subscribe({
      next: () => {
        this.isSaving.set(false);
        this.showForm.set(false);
        this.toast.success(this.i18n.t(editing ? 'teacherPromotions.couponUpdated' : 'teacherPromotions.couponCreated'));
        this.load();
      },
      error: err => {
        this.isSaving.set(false);
        this.formFailure.set({key: 'teacherPromotions.couponSaveError', error: err});
      }
    });
  }

  // ===== Acciones de fila =====

  toggleActive(c: Coupon): void {
    this.service.update(c.id, { active: !c.active }).subscribe({
      next: () => { this.toast.success(this.i18n.t(c.active ? 'teacherPromotions.couponDeactivated' : 'teacherPromotions.couponActivated')); this.load(); },
      error: err => this.toast.error(this.i18n.errorMessage(err, 'teacherPromotions.couponStatusError'))
    });
  }

  askDelete(c: Coupon): void { this.toDelete.set(c); }
  cancelDelete(): void { this.toDelete.set(null); }

  confirmDelete(): void {
    const c = this.toDelete();
    this.toDelete.set(null);
    if (!c) return;
    this.service.remove(c.id).subscribe({
      next: () => { this.toast.success(this.i18n.t('teacherPromotions.couponDeleted')); this.load(); },
      error: err => {
        // 409: ya tiene usos; el servidor lo desactiva en su lugar
        if (err?.status === 409) { this.toast.warning(this.i18n.t('teacherPromotions.couponUsed')); this.load(); }
        else this.toast.error(this.i18n.errorMessage(err, 'teacherPromotions.couponDeleteError'));
      }
    });
  }

  setLinkCourse(c: Coupon, courseId: string): void {
    this.linkCourse.update(m => ({ ...m, [c.id]: +courseId }));
  }

  saleLink(c: Coupon): string | null {
    const courseId = c.courseId ?? this.linkCourse()[c.id];
    const slug = this.courses().find(x => x.id === courseId)?.slug;
    return slug ? `${window.location.origin}/courses/${encodeURIComponent(slug)}?coupon=${encodeURIComponent(c.code)}` : null;
  }

  async copyLink(c: Coupon): Promise<void> {
    const link = this.saleLink(c);
    if (!link) { this.toast.warning(this.i18n.t('teacherPromotions.chooseLinkCourse')); return; }
    try {
      await navigator.clipboard.writeText(link);
      this.toast.success(this.i18n.t('teacherPromotions.linkCopied'));
    } catch {
      window.prompt(this.i18n.t('teacherPromotions.copyPrompt'), link);
    }
  }
}
