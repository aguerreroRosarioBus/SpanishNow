import { Component, OnDestroy, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { CourseService } from '../../../../core/services/course.service';
import { HotmartService, HotmartSetup } from '../../../../core/services/hotmart.service';
import { CouponService } from '../../../../core/services/coupon.service';
import { Course } from '../../../../core/models/course.model';
import { Coupon } from '../../../../core/models/sales.model';
import { ToastService } from '../../../../core/services/toast.service';
import { CourseManageStore } from '../course-manage.store';
import { VideoEmbedComponent } from '../../../../shared/components/video-embed/video-embed.component';
import { ImageSearchComponent } from '../../../../shared/components/image-search/image-search.component';
import { imageFileErrorKey, IMAGE_ACCEPT } from '../../lesson-composer/image-file';
import { I18nService } from '../../../../core/i18n/i18n.service';
import { TranslatePipe } from '../../../../core/i18n/translate.pipe';

/** Edición del curso: título, descripción y datos de venta (precio, moneda, slug, publicación, texto de venta). */
@Component({
  selector: 'app-course-edit-modal',
  standalone: true,
  imports: [ReactiveFormsModule, VideoEmbedComponent, ImageSearchComponent, TranslatePipe],
  templateUrl: './course-edit-modal.component.html'
})
export class CourseEditModalComponent implements OnDestroy {
  private store = inject(CourseManageStore);
  private courseService = inject(CourseService);
  private couponService = inject(CouponService);
  private hotmartService = inject(HotmartService);
  private toast = inject(ToastService);
  private i18n = inject(I18nService);

  /** `label` es una clave I18N. */
  readonly currencies = [
    { code: 'usd', label: 'teacherManage.courseEdit.currencyUsd' },
    { code: 'eur', label: 'teacherManage.courseEdit.currencyEur' },
    { code: 'gbp', label: 'teacherManage.courseEdit.currencyGbp' }
  ];

  form = inject(FormBuilder).group({
    title: ['', [Validators.required, Validators.minLength(3)]],
    description: [''],
    price: [0, [Validators.required, Validators.min(0)]],
    currency: ['usd'],
    slug: ['', [Validators.pattern(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)]],
    isPublished: [false],
    salesDescription: [''],
    introVideoUrl: [''],
    nextCourseId: [null as number | null],
    nextCourseCouponId: [null as number | null],
    hotmartProductId: ['', [Validators.maxLength(40), Validators.pattern(/^[A-Za-z0-9]*$/)]],
    hotmartCheckoutUrl: ['', [Validators.maxLength(500)]]
  });
  /** URL del webhook y estado del token en el servidor; null si no se pudo consultar. */
  hotmartSetup = signal<HotmartSetup | null>(null);
  webhookCopied = signal(false);
  /** Otros cursos del docente (candidatos a «curso siguiente») y sus cupones activos. */
  otherCourses = signal<Course[]>([]);
  private coupons = signal<Coupon[]>([]);
  private selectedNext = signal<number | null>(null);
  /** Cupones activos que sirven para el curso siguiente elegido (los de ese curso o los de todos). */
  offerCoupons = computed(() => this.coupons().filter(c => c.active && (c.courseId == null || c.courseId === this.selectedNext())));
  imageFile: File | null = null;
  imagePreview = signal<string | null>(null);
  readonly imageAccept = IMAGE_ACCEPT;

  ngOnDestroy(): void { this.selectImage(null); }

  selectImage(file: File | null): void {
    if (file) {
      const invalid = imageFileErrorKey(file);
      if (invalid) { this.toast.warning(this.i18n.t(invalid)); return; }
    }
    const previous = this.imagePreview();
    if (previous) URL.revokeObjectURL(previous);
    this.imageFile = file;
    this.imagePreview.set(file ? URL.createObjectURL(file) : null);
  }

  onImageFile(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (file) this.selectImage(file);
  }

  coverPreview(): string | null { return this.imagePreview() || this.store.course()?.imageUrl || null; }

  isSaving = false;
  /** Error de guardado crudo: se traduce al leer, por código, con el idioma vigente. */
  private saveError = signal<{ error: unknown } | null>(null);
  errorMessage = computed(() => {
    const failure = this.saveError();
    return failure ? this.i18n.errorMessage(failure.error, 'teacherManage.courseEdit.updateError') : '';
  });

  constructor() {
    const course = this.store.course();
    if (course) {
      this.form.patchValue({
        title: course.title,
        description: course.description || '',
        price: (course.price ?? 0) / 100,
        currency: course.currency || 'usd',
        slug: course.slug || '',
        isPublished: !!course.isPublished,
        salesDescription: course.salesDescription || '',
        introVideoUrl: course.introVideoUrl || '',
        nextCourseId: course.nextCourseId ?? null,
        nextCourseCouponId: course.nextCourseCouponId ?? null,
        hotmartProductId: course.hotmartProductId || '',
        hotmartCheckoutUrl: course.hotmartCheckoutUrl || ''
      });
      this.selectedNext.set(course.nextCourseId ?? null);
    }
    this.form.controls.nextCourseId.valueChanges.subscribe(id => {
      this.selectedNext.set(id != null ? Number(id) : null);
      // Si el cupón elegido ya no sirve para el nuevo curso, se limpia
      const couponId = this.form.controls.nextCourseCouponId.value;
      if (couponId != null && !this.offerCoupons().some(c => c.id === Number(couponId))) this.form.controls.nextCourseCouponId.setValue(null);
    });
    this.courseService.getCourses().subscribe({
      next: list => this.otherCourses.set(list.filter(c => c.id !== this.store.courseId())),
      error: () => { /* sin lista, el select queda vacío */ }
    });
    this.hotmartService.setup().subscribe({ next: s => this.hotmartSetup.set(s), error: () => { /* sin datos, solo se oculta la URL */ } });
    this.couponService.list().subscribe({ next: list => this.coupons.set(list), error: () => { /* idem */ } });
  }

  /** Slug actual guardado en el curso (el link a la página de venta solo existe si ya está guardado). */
  savedSlug(): string | null {
    return this.store.course()?.slug ?? null;
  }

  /** Video de bienvenida ya guardado (URL de embed que normalizó el servidor). */
  savedIntroVideo(): string | null {
    return this.store.course()?.introVideoUrl ?? null;
  }

  /** Copia la URL del webhook para pegarla en Hotmart. */
  copyWebhook(): void {
    const url = this.hotmartSetup()?.webhookUrl;
    if (!url) return;
    navigator.clipboard?.writeText(url).then(() => {
      this.webhookCopied.set(true);
      setTimeout(() => this.webhookCopied.set(false), 2000);
    }, () => this.toast.error(this.i18n.t('teacherManage.courseEdit.copyError')));
  }

  close(): void { this.store.close(); }

  save(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const v = this.form.value;
    const payload = {
      title: v.title!,
      description: v.description ?? undefined,
      // El precio se escribe en moneda y se manda en centavos
      price: Math.round((Number(v.price) || 0) * 100),
      currency: v.currency || 'usd',
      isPublished: !!v.isPublished,
      salesDescription: v.salesDescription ?? '',
      // Vacío = quitar el video; el servidor valida el proveedor y devuelve la URL de embed
      introVideoUrl: (v.introVideoUrl ?? '').trim() || null,
      // Vacío = sin curso siguiente / sin cupón
      nextCourseId: v.nextCourseId != null ? Number(v.nextCourseId) : null,
      nextCourseCouponId: v.nextCourseId != null && v.nextCourseCouponId != null ? Number(v.nextCourseCouponId) : null,
      // Vacío = quitar (el curso vuelve a cobrarse en el sitio)
      hotmartProductId: (v.hotmartProductId ?? '').trim(),
      hotmartCheckoutUrl: (v.hotmartCheckoutUrl ?? '').trim()
    } as Record<string, unknown>;
    const slug = (v.slug ?? '').trim();
    if (slug) payload['slug'] = slug;

    this.isSaving = true;
    this.saveError.set(null);
    let data: FormData | Partial<Course> = payload;
    if (this.imageFile) {
      const form = new FormData();
      for (const [key, value] of Object.entries(payload)) {
        // The API treats an empty optional ID/URL as removal, just like JSON null.
        form.append(key, value == null ? '' : String(value));
      }
      form.append('image', this.imageFile);
      data = form;
    }
    this.courseService.updateCourse(this.store.courseId(), data).subscribe({
      next: updated => {
        // El PUT no devuelve las unidades ni el conteo: se conservan los que ya tenía la pantalla
        const previous = this.store.course();
        this.store.course.set({ ...previous, ...updated, units: previous?.units, enrollmentCount: previous?.enrollmentCount });
        this.close();
        this.toast.success(this.i18n.t('teacherManage.courseEdit.updated'));
      },
      error: error => {
        console.error('Error updating course:', error);
        this.isSaving = false;
        this.saveError.set({ error });
      }
    });
  }
}
