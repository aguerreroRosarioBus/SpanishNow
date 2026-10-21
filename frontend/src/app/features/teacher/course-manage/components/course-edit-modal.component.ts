import { Component, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { CourseService } from '../../../../core/services/course.service';
import { ToastService } from '../../../../core/services/toast.service';
import { CourseManageStore } from '../course-manage.store';

/** Edición del título y la descripción del curso. */
@Component({
  selector: 'app-course-edit-modal',
  standalone: true,
  imports: [ReactiveFormsModule],
  templateUrl: './course-edit-modal.component.html'
})
export class CourseEditModalComponent {
  private store = inject(CourseManageStore);
  private courseService = inject(CourseService);
  private toast = inject(ToastService);

  form = inject(FormBuilder).group({
    title: ['', [Validators.required, Validators.minLength(3)]],
    description: ['']
  });

  constructor() {
    const course = this.store.course();
    if (course) this.form.patchValue({ title: course.title, description: course.description || '' });
  }

  close(): void { this.store.close(); }

  save(): void {
    if (this.form.invalid) return;
    const title = this.form.value.title!;
    const description = this.form.value.description ?? undefined;
    this.courseService.updateCourse(this.store.courseId(), { title, description }).subscribe({
      next: updated => {
        this.store.course.set(updated);
        this.close();
        this.toast.success('Curso actualizado exitosamente');
      },
      error: error => {
        console.error('Error updating course:', error);
        this.toast.error('Error al actualizar el curso');
      }
    });
  }
}
