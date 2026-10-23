import { Component, OnInit, computed, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Material, Unit } from '../../../../core/models/course.model';
import { MaterialService, formatFileSize } from '../../../../core/services/material.service';
import { ToastService } from '../../../../core/services/toast.service';
import { IconComponent } from '../../../../shared/components/icon/icon.component';
import { unitDisplayTitle } from '../../../../shared/utils/unit-title';
import { I18nService } from '../../../../core/i18n/i18n.service';
import { TranslatePipe } from '../../../../core/i18n/translate.pipe';
import { CourseContentStore } from '../course-content.store';
import { CourseManageStore } from '../course-manage.store';

export const MAX_MATERIAL_BYTES = 20 * 1024 * 1024;

interface Destination { value: string; label: string; group: string; }

/** PDFs descargables: lista, subida con título y destino (curso, unidad o historia), renombrar y borrar. */
@Component({
  selector: 'app-materials-modal',
  standalone: true,
  imports: [FormsModule, IconComponent, TranslatePipe],
  templateUrl: './materials-modal.component.html'
})
export class MaterialsModalComponent implements OnInit {
  private store = inject(CourseManageStore);
  private content = inject(CourseContentStore);
  private api = inject(MaterialService);
  private toast = inject(ToastService);
  private i18n = inject(I18nService);

  /** Unidad desde la que se abrió; null = materiales de todo el curso. */
  unit = input<Unit | null>(null);

  size = (bytes: number): string => formatFileSize(bytes, this.i18n.intlLocale());
  title = signal('');
  destination = signal('course');
  file = signal<File | null>(null);
  /** Clave I18N del error del archivo elegido ('' = sin error). */
  fileError = signal('');
  isUploading = signal(false);
  /** Error crudo de la subida: se traduce al leer, por código, en el idioma vigente. */
  private uploadFailure = signal<{ error: unknown } | null>(null);
  errorMessage = computed(() => {
    const failure = this.uploadFailure();
    return failure ? this.i18n.errorMessage(failure.error, 'teacherManage.materials.uploadError') : '';
  });
  editingId = signal<number | null>(null);
  editingTitle = signal('');
  fileInputKey = signal(0);

  heading = computed(() => {
    const unit = this.unit();
    return unit ? this.i18n.t('teacherManage.materials.headingUnit', { unit: unitDisplayTitle(unit.title) }) : this.i18n.t('teacherManage.materials.headingCourse');
  });

  /** Unidades en alcance: la abierta, o todas si se abrió desde el curso. */
  private scopedUnits = computed(() => {
    const unit = this.unit();
    return unit ? this.store.units().filter(u => u.id === unit.id) : this.store.units();
  });

  destinations = computed<Destination[]>(() => {
    const list: Destination[] = [{ value: 'course', label: this.i18n.t('teacherManage.materials.wholeCourse'), group: this.i18n.t('teacherManage.materials.groupCourse') }];
    for (const unit of this.scopedUnits()) {
      const unitTitle = unitDisplayTitle(unit.title);
      list.push({ value: `unit:${unit.id}`, label: this.i18n.t('teacherManage.materials.unitOption', { title: unitTitle }), group: unitTitle });
      for (const story of unit.stories ?? []) {
        list.push({ value: `story:${story.id}`, label: this.i18n.t('teacherManage.materials.storyOption', { title: story.title }), group: unitTitle });
      }
    }
    return list;
  });

  /** Materiales visibles según el alcance, con el nombre de su destino. */
  items = computed(() => {
    const scoped = this.scopedUnits();
    const unitIds = new Set(scoped.map(u => u.id));
    const storyIds = new Set(scoped.flatMap(u => (u.stories ?? []).map(s => s.id)));
    const labelByValue = new Map(this.destinations().map(d => [d.value, d.label]));
    const onlyUnit = !!this.unit();
    return this.content.materials()
      .filter(m => m.storyId ? storyIds.has(m.storyId) : m.unitId ? unitIds.has(m.unitId) : !onlyUnit)
      .map(m => ({
        material: m,
        where: m.storyId ? labelByValue.get(`story:${m.storyId}`) ?? this.i18n.t('teacherManage.materials.whereStory')
          : m.unitId ? labelByValue.get(`unit:${m.unitId}`) ?? this.i18n.t('teacherManage.materials.whereUnit') : this.i18n.t('teacherManage.materials.wholeCourse')
      }));
  });

  ngOnInit(): void {
    const unit = this.unit();
    if (unit) this.destination.set(`unit:${unit.id}`);
  }

  close(): void { this.store.close(); }

  onFile(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0] ?? null;
    this.fileError.set('');
    this.file.set(null);
    if (!file) return;
    const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
    if (!isPdf) this.fileError.set('teacherManage.materials.onlyPdf');
    else if (file.size > MAX_MATERIAL_BYTES) this.fileError.set('teacherManage.materials.pdfTooBig');
    else {
      this.file.set(file);
      if (!this.title().trim()) this.title.set(file.name.replace(/\.pdf$/i, '').slice(0, 200));
    }
    if (this.fileError()) input.value = '';
  }

  canUpload = computed(() => !!this.file() && !!this.title().trim() && !this.isUploading());

  upload(): void {
    const file = this.file();
    if (!file || !this.title().trim()) return;
    const formData = new FormData();
    formData.append('file', file);
    formData.append('title', this.title().trim());
    const [kind, id] = this.destination().split(':');
    if (kind === 'unit') formData.append('unitId', id);
    else if (kind === 'story') formData.append('storyId', id);

    this.isUploading.set(true);
    this.uploadFailure.set(null);
    this.api.upload(this.store.courseId(), formData).subscribe({
      next: material => {
        this.content.materials.update(list => [...list, material]);
        this.title.set('');
        this.file.set(null);
        this.fileInputKey.update(k => k + 1);
        this.isUploading.set(false);
        this.toast.success(this.i18n.t('teacherManage.materials.uploaded'));
      },
      error: error => {
        this.isUploading.set(false);
        this.uploadFailure.set({ error });
      }
    });
  }

  startRename(material: Material): void {
    this.editingId.set(material.id);
    this.editingTitle.set(material.title);
  }

  cancelRename(): void { this.editingId.set(null); }

  saveRename(material: Material): void {
    const title = this.editingTitle().trim();
    if (!title) return;
    if (title === material.title) { this.cancelRename(); return; }
    this.api.update(material.id, { title }).subscribe({
      next: updated => {
        this.content.materials.update(list => list.map(m => m.id === material.id ? { ...m, ...updated, title } : m));
        this.cancelRename();
        this.toast.success(this.i18n.t('teacherManage.materials.renamed'));
      },
      error: error => this.toast.error(this.i18n.errorMessage(error, 'teacherManage.materials.renameError'))
    });
  }

  preview(material: Material): void { this.api.download(material.id); }

  remove(material: Material): void {
    this.store.confirm('teacherManage.materials.deleteTitle', 'teacherManage.materials.deleteMessage', 'teacherManage.materials.deleteConfirm', () => {
      this.api.remove(material.id).subscribe({
        next: () => {
          this.content.materials.update(list => list.filter(m => m.id !== material.id));
          this.toast.success(this.i18n.t('teacherManage.materials.deleted'));
        },
        error: () => this.toast.error(this.i18n.t('teacherManage.materials.deleteError'))
      });
    }, 'danger', { title: material.title });
  }
}
