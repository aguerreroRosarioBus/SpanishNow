import { Component, inject, input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { UnitService } from '../../../../core/services/unit.service';
import { ToastService } from '../../../../core/services/toast.service';
import { Unit } from '../../../../core/models/course.model';
import { CourseManageStore } from '../course-manage.store';

/** Crear o editar una unidad (modo según `unit`: sin valor crea, con valor edita). */
@Component({
  selector: 'app-unit-form-modal',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './unit-form-modal.component.html'
})
export class UnitFormModalComponent {
  private store = inject(CourseManageStore);
  private unitService = inject(UnitService);
  private toast = inject(ToastService);

  unit = input<Unit | null>(null);

  form = inject(FormBuilder).group({
    title: ['', [Validators.required, Validators.minLength(3)]],
    description: ['', [Validators.required, Validators.minLength(10)]]
  });

  ngOnInit(): void {
    const unit = this.unit();
    if (unit) this.form.patchValue({ title: unit.title, description: unit.description });
  }

  close(): void { this.store.close(); }

  save(): void {
    if (this.form.invalid) return;
    const title = this.form.value.title!;
    const description = this.form.value.description!;
    const unit = this.unit();
    if (unit) {
      this.unitService.updateUnit(unit.id, { title, description }).subscribe({
        next: updated => {
          this.store.patchUnit(updated);
          this.close();
          this.toast.success('Unidad actualizada exitosamente');
        },
        error: error => {
          console.error('Error updating unit:', error);
          this.toast.error('Error al actualizar la unidad');
        }
      });
    } else {
      this.unitService.createUnit({ courseId: this.store.courseId(), title, description }).subscribe({
        next: created => {
          this.store.addUnit(created);
          this.close();
        },
        error: error => {
          console.error('Error creating unit:', error);
          this.toast.error('Error al crear la unidad');
        }
      });
    }
  }
}
