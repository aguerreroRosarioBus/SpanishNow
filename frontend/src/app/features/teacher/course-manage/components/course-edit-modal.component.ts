import { Component, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { CourseService } from '../../../../core/services/course.service';
import { ToastService } from '../../../../core/services/toast.service';
import { CourseManageStore } from '../course-manage.store';
import { VideoEmbedComponent } from '../../../../shared/components/video-embed/video-embed.component';

/** Edición del curso: título, descripción y datos de venta (precio, moneda, slug, publicación, texto de venta). */
@Component({
  selector: 'app-course-edit-modal',
  standalone: true,
  imports: [ReactiveFormsModule, VideoEmbedComponent],
  templateUrl: './course-edit-modal.component.html'
})
export class CourseEditModalComponent {
  private store = inject(CourseManageStore);
  private courseService = inject(CourseService);
  private toast = inject(ToastService);

  readonly currencies = [
    { code: 'usd', label: 'USD (dólar)' },
    { code: 'eur', label: 'EUR (euro)' },
    { code: 'gbp', label: 'GBP (libra)' }
  ];

  form = inject(FormBuilder).group({
    title: ['', [Validators.required, Validators.minLength(3)]],
    description: [''],
    price: [0, [Validators.required, Validators.min(0)]],
    currency: ['usd'],
    slug: ['', [Validators.pattern(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)]],
    isPublished: [false],
    salesDescription: [''],
    introVideoUrl: ['']
  });
  isSaving = false;
  errorMessage = '';

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
        introVideoUrl: course.introVideoUrl || ''
      });
    }
  }

  /** Slug actual guardado en el curso (el link a la página de venta solo existe si ya está guardado). */
  savedSlug(): string | null {
    return this.store.course()?.slug ?? null;
  }

  /** Video de bienvenida ya guardado (URL de embed que normalizó el servidor). */
  savedIntroVideo(): string | null {
    return this.store.course()?.introVideoUrl ?? null;
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
      introVideoUrl: (v.introVideoUrl ?? '').trim() || null
    } as Record<string, unknown>;
    const slug = (v.slug ?? '').trim();
    if (slug) payload['slug'] = slug;

    this.isSaving = true;
    this.errorMessage = '';
    this.courseService.updateCourse(this.store.courseId(), payload).subscribe({
      next: updated => {
        // El PUT no devuelve las unidades ni el conteo: se conservan los que ya tenía la pantalla
        const previous = this.store.course();
        this.store.course.set({ ...previous, ...updated, units: previous?.units, enrollmentCount: previous?.enrollmentCount });
        this.close();
        this.toast.success('Curso actualizado exitosamente');
      },
      error: error => {
        console.error('Error updating course:', error);
        this.isSaving = false;
        this.errorMessage = error?.error?.error || 'Error al actualizar el curso';
      }
    });
  }
}
