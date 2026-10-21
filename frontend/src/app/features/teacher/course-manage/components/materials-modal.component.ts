import { Component, OnInit, computed, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Material, Unit } from '../../../../core/models/course.model';
import { MaterialService, formatFileSize } from '../../../../core/services/material.service';
import { ToastService } from '../../../../core/services/toast.service';
import { IconComponent } from '../../../../shared/components/icon/icon.component';
import { unitDisplayTitle } from '../../../../shared/utils/unit-title';
import { CourseContentStore } from '../course-content.store';
import { CourseManageStore } from '../course-manage.store';

export const MAX_MATERIAL_BYTES = 20 * 1024 * 1024;

interface Destination { value: string; label: string; group: string; }

/** PDFs descargables: lista, subida con título y destino (curso, unidad o historia), renombrar y borrar. */
@Component({
  selector: 'app-materials-modal',
  standalone: true,
  imports: [FormsModule, IconComponent],
  templateUrl: './materials-modal.component.html'
})
export class MaterialsModalComponent implements OnInit {
  private store = inject(CourseManageStore);
  private content = inject(CourseContentStore);
  private api = inject(MaterialService);
  private toast = inject(ToastService);

  /** Unidad desde la que se abrió; null = materiales de todo el curso. */
  unit = input<Unit | null>(null);

  readonly size = formatFileSize;
  title = signal('');
  destination = signal('course');
  file = signal<File | null>(null);
  fileError = signal('');
  isUploading = signal(false);
  errorMessage = signal('');
  editingId = signal<number | null>(null);
  editingTitle = signal('');
  fileInputKey = signal(0);

  heading = computed(() => {
    const unit = this.unit();
    return unit ? `Materiales · ${unitDisplayTitle(unit.title)}` : 'Materiales del curso';
  });

  /** Unidades en alcance: la abierta, o todas si se abrió desde el curso. */
  private scopedUnits = computed(() => {
    const unit = this.unit();
    return unit ? this.store.units().filter(u => u.id === unit.id) : this.store.units();
  });

  destinations = computed<Destination[]>(() => {
    const list: Destination[] = [{ value: 'course', label: 'Todo el curso', group: 'Curso' }];
    for (const unit of this.scopedUnits()) {
      const unitTitle = unitDisplayTitle(unit.title);
      list.push({ value: `unit:${unit.id}`, label: `Unidad: ${unitTitle}`, group: unitTitle });
      for (const story of unit.stories ?? []) {
        list.push({ value: `story:${story.id}`, label: `Historia: ${story.title}`, group: unitTitle });
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
        where: m.storyId ? labelByValue.get(`story:${m.storyId}`) ?? 'Historia'
          : m.unitId ? labelByValue.get(`unit:${m.unitId}`) ?? 'Unidad' : 'Todo el curso'
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
    if (!isPdf) this.fileError.set('Solo se admiten archivos PDF.');
    else if (file.size > MAX_MATERIAL_BYTES) this.fileError.set('El PDF supera el máximo de 20 MB.');
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
    this.errorMessage.set('');
    this.api.upload(this.store.courseId(), formData).subscribe({
      next: material => {
        this.content.materials.update(list => [...list, material]);
        this.title.set('');
        this.file.set(null);
        this.fileInputKey.update(k => k + 1);
        this.isUploading.set(false);
        this.toast.success('Material subido');
      },
      error: error => {
        this.isUploading.set(false);
        this.errorMessage.set(error?.error?.error || 'No se pudo subir el PDF. Intenta nuevamente.');
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
        this.toast.success('Material renombrado');
      },
      error: error => this.toast.error(error?.error?.error || 'No se pudo renombrar el material')
    });
  }

  preview(material: Material): void { this.api.download(material.id); }

  remove(material: Material): void {
    this.store.confirm('Eliminar material', `¿Eliminar «${material.title}»? Los alumnos dejarán de poder descargarlo.`, 'Eliminar material', () => {
      this.api.remove(material.id).subscribe({
        next: () => {
          this.content.materials.update(list => list.filter(m => m.id !== material.id));
          this.toast.success('Material eliminado');
        },
        error: () => this.toast.error('No se pudo eliminar el material')
      });
    }, 'danger');
  }
}
