import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { CourseStudentsService } from '../../../../core/services/course-students.service';
import { ToastService } from '../../../../core/services/toast.service';
import { CourseStudent, EnrollmentSource, ImportResult, ImportRowStatus } from '../../../../core/models/sales.model';
import { ConfirmDialogComponent } from '../../../../shared/components/confirm-dialog/confirm-dialog.component';
import { PluralPipe } from '../../../../shared/pipes/plural.pipe';
import { CourseManageStore } from '../course-manage.store';

const SOURCE_LABELS: Record<EnrollmentSource, string> = {
  purchase: 'Compra',
  manual: 'Manual',
  hotmart_import: 'Hotmart',
  free: 'Gratis'
};

const STATUS_LABELS: Record<ImportRowStatus, string> = {
  new: 'Nuevo',
  existing_user: 'Usuario existente',
  already_enrolled: 'Ya inscripto',
  invalid: 'Inválida'
};

/** Motivos que manda el backend (en inglés) traducidos para la pantalla del docente. */
const REASON_LABELS: Record<string, string> = {
  'Missing email': 'Falta el email',
  'Invalid email address': 'Email inválido',
  'This email belongs to a teacher account': 'El email es de una cuenta de docente'
};

/** Pestaña «Alumnos» de la gestión del curso: lista, alta manual, baja e importación de Hotmart. */
@Component({
  selector: 'app-students-panel',
  standalone: true,
  imports: [DatePipe, ReactiveFormsModule, ConfirmDialogComponent, PluralPipe],
  templateUrl: './students-panel.component.html',
  styleUrl: './students-panel.component.scss'
})
export class StudentsPanelComponent implements OnInit {
  private store = inject(CourseManageStore);
  private service = inject(CourseStudentsService);
  private toast = inject(ToastService);

  students = signal<CourseStudent[]>([]);
  isLoading = signal(false);
  errorMessage = signal('');

  addForm = inject(FormBuilder).group({
    email: ['', [Validators.required, Validators.email]],
    name: ['']
  });
  isAdding = signal(false);

  // Eliminación con confirmación
  studentToRemove = signal<CourseStudent | null>(null);

  // Importación de Hotmart
  importFile = signal<File | null>(null);
  preview = signal<ImportResult | null>(null);
  isPreviewing = signal(false);
  isImporting = signal(false);
  importError = signal('');
  sendInvites = signal(true);
  importDone = signal<ImportResult | null>(null);
  /** Filas que realmente se aplicarán (nuevas o usuarios existentes sin inscripción). */
  importable = computed(() => {
    const s = this.preview()?.summary;
    return s ? s.new + s.existingUser : 0;
  });

  ngOnInit(): void {
    this.load();
  }

  sourceLabel(source: EnrollmentSource): string { return SOURCE_LABELS[source] ?? source; }
  statusLabel(status: ImportRowStatus): string { return STATUS_LABELS[status] ?? status; }
  reasonLabel(reason: string): string { return REASON_LABELS[reason] ?? reason; }

  progressPercent(student: CourseStudent): number {
    const { completedStories, totalStories } = student.progress;
    return totalStories > 0 ? Math.round((completedStories / totalStories) * 100) : 0;
  }

  load(): void {
    this.isLoading.set(true);
    this.errorMessage.set('');
    this.service.list(this.store.courseId()).subscribe({
      next: list => {
        this.students.set(list);
        this.isLoading.set(false);
      },
      error: () => {
        this.errorMessage.set('Error al cargar los alumnos');
        this.isLoading.set(false);
      }
    });
  }

  addStudent(): void {
    if (this.addForm.invalid) {
      this.addForm.markAllAsTouched();
      return;
    }
    const email = this.addForm.value.email!.trim();
    const name = (this.addForm.value.name ?? '').trim();
    this.isAdding.set(true);
    this.service.add(this.store.courseId(), email, name || undefined).subscribe({
      next: () => {
        this.toast.success('Alumno agregado. Se le envió una invitación si es nuevo.');
        this.addForm.reset({ email: '', name: '' });
        this.isAdding.set(false);
        this.load();
      },
      error: error => {
        this.toast.error(error?.error?.error || 'Error al agregar el alumno');
        this.isAdding.set(false);
      }
    });
  }

  askRemove(student: CourseStudent): void { this.studentToRemove.set(student); }
  cancelRemove(): void { this.studentToRemove.set(null); }

  confirmRemove(): void {
    const student = this.studentToRemove();
    this.studentToRemove.set(null);
    if (!student) return;
    this.service.remove(this.store.courseId(), student.enrollmentId).subscribe({
      next: () => {
        this.students.update(list => list.filter(s => s.enrollmentId !== student.enrollmentId));
        this.toast.success('Acceso quitado');
      },
      error: error => this.toast.error(error?.error?.error || 'Error al quitar el acceso')
    });
  }

  // ===== Importación =====

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0] ?? null;
    this.resetImport();
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      this.importError.set('El archivo supera los 2 MB.');
      input.value = '';
      return;
    }
    this.importFile.set(file);
    this.isPreviewing.set(true);
    this.service.previewImport(this.store.courseId(), file).subscribe({
      next: result => {
        this.preview.set(result);
        this.isPreviewing.set(false);
      },
      error: error => {
        this.importError.set(error?.error?.error || 'No se pudo leer el archivo CSV.');
        this.importFile.set(null);
        this.isPreviewing.set(false);
      }
    });
  }

  confirmImport(): void {
    const file = this.importFile();
    if (!file || this.isImporting()) return;
    this.isImporting.set(true);
    this.importError.set('');
    this.service.import(this.store.courseId(), file, this.sendInvites()).subscribe({
      next: result => {
        this.importDone.set(result);
        this.preview.set(null);
        this.importFile.set(null);
        this.isImporting.set(false);
        this.toast.success('Importación completada');
        this.load();
      },
      error: error => {
        this.importError.set(error?.error?.error || 'Error al importar los alumnos.');
        this.isImporting.set(false);
      }
    });
  }

  resetImport(): void {
    this.importFile.set(null);
    this.preview.set(null);
    this.importError.set('');
    this.importDone.set(null);
  }

  cancelImport(input: HTMLInputElement): void {
    input.value = '';
    this.resetImport();
  }
}
