import { ModalFocusDirective } from '../../../../shared/directives/modal-focus.directive';
import { Component, inject, input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { UnitService } from '../../../../core/services/unit.service';
import { ToastService } from '../../../../core/services/toast.service';
import { Unit } from '../../../../core/models/course.model';
import { formatAvailableDate } from '../../../../shared/utils/release-date';
import { I18nService } from '../../../../core/i18n/i18n.service';
import { TranslatePipe } from '../../../../core/i18n/translate.pipe';
import { CourseManageStore } from '../course-manage.store';

/** Crear o editar una unidad (modo según `unit`: sin valor crea, con valor edita). */
@Component({
  selector: 'app-unit-form-modal',
  standalone: true,
  imports: [ModalFocusDirective, CommonModule, ReactiveFormsModule, TranslatePipe],
  templateUrl: './unit-form-modal.component.html'
})
export class UnitFormModalComponent {
  private store = inject(CourseManageStore);
  private unitService = inject(UnitService);
  private toast = inject(ToastService);
  private i18n = inject(I18nService);

  unit = input<Unit | null>(null);

  form = inject(FormBuilder).group({
    title: ['', [Validators.required, Validators.minLength(3)]],
    description: ['', [Validators.required, Validators.minLength(10)]],
    // Contenido por fechas (opcional): vacío = disponible desde el primer día
    releaseAfterDays: [null as number | null, [Validators.min(0), Validators.max(3650)]],
    releaseAt: ['']
  });

  /** Vista previa de la regla, en el mismo texto que ve el docente en la lista de unidades. */
  rulePreview(): string {
    const { releaseAfterDays, releaseAt } = this.form.getRawValue();
    const afterDays = this.cleanDays(releaseAfterDays);
    const days = afterDays != null && afterDays > 0
      ? (afterDays === 1 ? this.i18n.t('teacherManage.unitForm.ruleOnEnrollmentDay') : this.i18n.t('teacherManage.unitForm.ruleAfterDays', { days: afterDays }))
      : '';
    const date = formatAvailableDate(releaseAt || null, this.i18n.intlLocale());
    if (days && date) return this.i18n.t('teacherManage.unitForm.ruleBoth', { days, date });
    if (days) return this.i18n.t('teacherManage.unitForm.ruleDays', { days });
    if (date) return this.i18n.t('teacherManage.unitForm.ruleDate', { date });
    return '';
  }

  private cleanDays(value: number | string | null | undefined): number | null {
    if (value === null || value === undefined || value === '') return null;
    const n = Math.trunc(Number(value));
    return Number.isFinite(n) && n >= 0 ? n : null;
  }

  ngOnInit(): void {
    const unit = this.unit();
    if (unit) this.form.patchValue({
      title: unit.title,
      description: unit.description,
      releaseAfterDays: unit.releaseAfterDays ?? null,
      releaseAt: unit.releaseAt ? unit.releaseAt.slice(0, 10) : ''
    });
  }

  close(): void { this.store.close(); }

  save(): void {
    if (this.form.invalid) return;
    const title = this.form.value.title!;
    const description = this.form.value.description!;
    const releaseAfterDays = this.cleanDays(this.form.value.releaseAfterDays);
    const releaseAt = this.form.value.releaseAt || null;
    const unit = this.unit();
    if (unit) {
      this.unitService.updateUnit(unit.id, { title, description, releaseAfterDays, releaseAt }).subscribe({
        next: updated => {
          this.store.patchUnit(updated);
          this.close();
          this.toast.success(this.i18n.t('teacherManage.unitForm.updated'));
        },
        error: error => {
          console.error('Error updating unit:', error);
          this.toast.error(this.i18n.t('teacherManage.unitForm.updateError'));
        }
      });
    } else {
      this.unitService.createUnit({ courseId: this.store.courseId(), title, description }).subscribe({
        next: created => {
          // El alta no recibe las fechas: se guardan con una actualización si el docente las completó
          if (releaseAfterDays === null && !releaseAt) { this.store.addUnit(created); this.close(); return; }
          this.unitService.updateUnit(created.id, { releaseAfterDays, releaseAt }).subscribe({
            next: updated => { this.store.addUnit({ ...created, ...updated }); this.close(); },
            error: () => {
              this.store.addUnit(created);
              this.close();
              this.toast.warning(this.i18n.t('teacherManage.unitForm.dripSaveWarning'));
            }
          });
        },
        error: error => {
          console.error('Error creating unit:', error);
          this.toast.error(this.i18n.t('teacherManage.unitForm.createError'));
        }
      });
    }
  }
}
