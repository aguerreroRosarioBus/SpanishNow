import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { CouponService } from '../../../core/services/coupon.service';
import { CourseService } from '../../../core/services/course.service';
import { ToastService } from '../../../core/services/toast.service';
import { Course } from '../../../core/models/course.model';
import { Coupon, CouponInput } from '../../../core/models/sales.model';
import { IconComponent } from '../../../shared/components/icon/icon.component';
import { ConfirmDialogComponent } from '../../../shared/components/confirm-dialog/confirm-dialog.component';
import { applyDiscount, normalizeCouponCode } from '../../../shared/utils/coupon-price';
import { formatPrice } from '../../../shared/utils/money';

type DiscountKind = 'percent' | 'amount';

/** Cupones del docente: lista, alta y edición, desactivar, borrar y link de venta con el cupón. */
@Component({
  selector: 'app-teacher-coupons',
  standalone: true,
  imports: [DatePipe, ReactiveFormsModule, IconComponent, ConfirmDialogComponent],
  templateUrl: './teacher-coupons.component.html',
  styleUrl: './teacher-coupons.component.scss'
})
export class TeacherCouponsComponent implements OnInit {
  private service = inject(CouponService);
  private courseService = inject(CourseService);
  private toast = inject(ToastService);

  readonly currencies = [
    { code: 'usd', label: 'USD' },
    { code: 'eur', label: 'EUR' },
    { code: 'gbp', label: 'GBP' }
  ];

  coupons = signal<Coupon[]>([]);
  courses = signal<Course[]>([]);
  isLoading = signal(true);
  errorMessage = signal('');

  // Formulario (modal) crear/editar
  showForm = signal(false);
  editing = signal<Coupon | null>(null);
  isSaving = signal(false);
  formError = signal('');
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
    if (!result) return rule?.amountOff != null ? 'La moneda del cupón no coincide con la del curso: no se aplicaría.' : '';
    return `Ejemplo: «${course.title}» pasa de ${formatPrice(result.originalAmount, course.currency, 'es')} a ${formatPrice(result.amount, course.currency, 'es')}.`;
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
    this.errorMessage.set('');
    this.service.list().subscribe({
      next: list => { this.coupons.set(list); this.isLoading.set(false); },
      error: () => { this.errorMessage.set('No se pudieron cargar los cupones.'); this.isLoading.set(false); }
    });
  }

  // ===== Presentación =====

  discountLabel(c: Coupon): string {
    return c.percentOff != null ? `${c.percentOff} %` : formatPrice(c.amountOff, c.currency, 'es');
  }
  courseLabel(c: Coupon): string {
    if (c.courseId == null) return 'Todos los cursos';
    return c.course?.title ?? this.courses().find(x => x.id === c.courseId)?.title ?? `Curso ${c.courseId}`;
  }
  usageLabel(c: Coupon): string { return c.maxRedemptions != null ? `${c.redemptions}/${c.maxRedemptions}` : `${c.redemptions}`; }
  isExpired(c: Coupon): boolean { return !!c.expiresAt && new Date(c.expiresAt).getTime() < Date.now(); }
  coursesWithSlug = computed(() => this.courses().filter(c => !!c.slug));

  // ===== Formulario =====

  openCreate(): void {
    this.editing.set(null);
    this.kind.set('percent');
    this.form.reset({ code: '', percentOff: 10, amountOff: null, currency: 'usd', courseId: null, maxRedemptions: null, expiresAt: '', active: true });
    this.enableAll();
    this.formError.set('');
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
    this.formError.set('');
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

  /** Valida lo mismo que la API antes de enviar. Devuelve el mensaje de error o '' si está bien. */
  private validate(): string {
    const v = this.form.getRawValue();
    if (!this.locked() && !/^[A-Z0-9-]{1,40}$/.test(v.code ?? '')) return 'El código debe tener entre 1 y 40 caracteres: letras, números y guiones.';
    if (!this.locked()) {
      if (this.kind() === 'percent') {
        const p = Number(v.percentOff);
        if (!Number.isInteger(p) || p < 1 || p > 100) return 'El porcentaje debe ser un número entero entre 1 y 100.';
      } else {
        const a = Number(v.amountOff);
        if (!(a > 0)) return 'El monto de descuento debe ser mayor que 0.';
        if (!v.currency) return 'Elige la moneda del descuento.';
      }
    }
    if (v.maxRedemptions != null && (!Number.isInteger(Number(v.maxRedemptions)) || Number(v.maxRedemptions) < 1)) return 'El máximo de usos debe ser un entero mayor que 0 (o dejalo vacío).';
    return '';
  }

  save(): void {
    const error = this.validate();
    if (error) { this.formError.set(error); return; }
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
    this.formError.set('');
    const request = editing ? this.service.update(editing.id, input) : this.service.create(input as CouponInput);
    request.subscribe({
      next: () => {
        this.isSaving.set(false);
        this.showForm.set(false);
        this.toast.success(editing ? 'Cupón actualizado' : 'Cupón creado');
        this.load();
      },
      error: err => {
        this.isSaving.set(false);
        this.formError.set(err?.error?.error || 'No se pudo guardar el cupón.');
      }
    });
  }

  // ===== Acciones de fila =====

  toggleActive(c: Coupon): void {
    this.service.update(c.id, { active: !c.active }).subscribe({
      next: () => { this.toast.success(c.active ? 'Cupón desactivado' : 'Cupón activado'); this.load(); },
      error: err => this.toast.error(err?.error?.error || 'No se pudo cambiar el estado del cupón')
    });
  }

  askDelete(c: Coupon): void { this.toDelete.set(c); }
  cancelDelete(): void { this.toDelete.set(null); }

  confirmDelete(): void {
    const c = this.toDelete();
    this.toDelete.set(null);
    if (!c) return;
    this.service.remove(c.id).subscribe({
      next: () => { this.toast.success('Cupón eliminado'); this.load(); },
      error: err => {
        // 409: ya tiene usos; el servidor lo desactiva en su lugar
        if (err?.status === 409) { this.toast.warning(err?.error?.error || 'El cupón ya tiene usos: se desactivó en lugar de eliminarse.'); this.load(); }
        else this.toast.error(err?.error?.error || 'No se pudo eliminar el cupón');
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
    if (!link) { this.toast.warning('Elige un curso con página de venta para armar el link.'); return; }
    try {
      await navigator.clipboard.writeText(link);
      this.toast.success('Link copiado');
    } catch {
      window.prompt('Copia este link:', link);
    }
  }
}
