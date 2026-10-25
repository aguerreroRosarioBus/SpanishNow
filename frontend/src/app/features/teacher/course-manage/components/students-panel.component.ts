import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { CourseStudentsService } from '../../../../core/services/course-students.service';
import { ToastService } from '../../../../core/services/toast.service';
import { CourseStudent, EnrollmentSource, ImportResult, ImportRowStatus } from '../../../../core/models/sales.model';
import { ConfirmDialogComponent } from '../../../../shared/components/confirm-dialog/confirm-dialog.component';
import { I18nService } from '../../../../core/i18n/i18n.service';
import { TranslatePipe } from '../../../../core/i18n/translate.pipe';
import { UserPreferencesService } from '../../../../core/services/user-preferences.service';
import { presentationZone } from '../../../live-classes/live-notice';
import { CourseManageStore } from '../course-manage.store';

const SOURCE_KEYS: Record<EnrollmentSource, string> = {
  purchase: 'teacherDashboard.students.sourcePurchase',
  manual: 'teacherDashboard.students.sourceManual',
  hotmart_import: 'teacherDashboard.students.sourceHotmart',
  free: 'teacherDashboard.students.sourceFree'
};

const STATUS_KEYS: Record<ImportRowStatus, string> = {
  new: 'teacherDashboard.students.statusNew',
  existing_user: 'teacherDashboard.students.statusExisting',
  already_enrolled: 'teacherDashboard.students.statusEnrolled',
  invalid: 'teacherDashboard.students.statusInvalid'
};

/** Motivos conocidos que manda el backend (texto en inglés, sin código) mapeados a claves I18N. */
const REASON_KEYS: Record<string, string> = {
  'Missing email': 'teacherDashboard.students.reasonMissingEmail',
  'Invalid email address': 'teacherDashboard.students.reasonInvalidEmail',
  'This email belongs to a teacher account': 'teacherDashboard.students.reasonTeacher'
};

/** Pestaña «Alumnos» de la gestión del curso: lista, alta manual, baja e importación de Hotmart. */
@Component({
  selector: 'app-students-panel',
  standalone: true,
  imports: [ReactiveFormsModule, ConfirmDialogComponent, TranslatePipe],
  templateUrl: './students-panel.component.html',
  styleUrl: './students-panel.component.scss'
})
export class StudentsPanelComponent implements OnInit {
  private store = inject(CourseManageStore);
  private service = inject(CourseStudentsService);
  private toast = inject(ToastService);
  private i18n = inject(I18nService);
  private preferences = inject(UserPreferencesService);

  search=signal('');
  students = signal<CourseStudent[]>([]);
  visibleStudents=computed(()=>{const q=this.search().trim().toLocaleLowerCase(this.i18n.intlLocale());return this.students().filter(s=>!q||[s.user.name,s.user.email].some(v=>v.toLocaleLowerCase(this.i18n.intlLocale()).includes(q)));});
  isLoading = signal(false);
  // Se guardan clave y error (no el texto) para traducir al leer y no repetir peticiones al cambiar de idioma.
  private loadFailure = signal<{ key: string; error?: unknown } | null>(null);
  errorMessage = computed(() => { const f = this.loadFailure(); return f ? this.i18n.errorMessage(f.error, f.key) : ''; });

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
  private importFailure = signal<{ key: string; error?: unknown } | null>(null);
  importError = computed(() => { const f = this.importFailure(); return f ? this.i18n.errorMessage(f.error, f.key) : ''; });
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

  sourceLabel(source: EnrollmentSource): string { return SOURCE_KEYS[source] ? this.i18n.t(SOURCE_KEYS[source]) : source; }
  statusLabel(status: ImportRowStatus): string { return STATUS_KEYS[status] ? this.i18n.t(STATUS_KEYS[status]) : status; }
  reasonLabel(reason: string): string { return this.i18n.t(REASON_KEYS[reason] ?? 'teacherDashboard.students.reasonOther'); }
  /** Día de inscripción en la zona de las preferencias de la cuenta (no en UTC: un alta de la noche no cambia de día). */
  enrolledDate(value: string): string { return this.i18n.formatInstant(value, presentationZone(this.preferences.preferences()?.timeZone), { dateStyle: 'medium' }); }

  progressPercent(student: CourseStudent): number {
    const { completedStories, totalStories } = student.progress;
    return totalStories > 0 ? Math.round((completedStories / totalStories) * 100) : 0;
  }

  load(): void {
    this.isLoading.set(true);
    this.loadFailure.set(null);
    this.service.list(this.store.courseId()).subscribe({
      next: list => {
        this.students.set(list);
        this.isLoading.set(false);
      },
      error: error => {
        this.loadFailure.set({ key: 'teacherDashboard.students.loadError', error });
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
        this.toast.success(this.i18n.t('teacherDashboard.students.added'));
        this.addForm.reset({ email: '', name: '' });
        this.isAdding.set(false);
        this.load();
      },
      error: error => {
        this.toast.error(this.i18n.errorMessage(error, 'teacherDashboard.students.addError'));
        this.isAdding.set(false);
      }
    });
  }

  removeMessage(student: CourseStudent): string {
    return this.i18n.t('teacherDashboard.students.removeMessage', { name: student.user.name, email: student.user.email });
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
        this.toast.success(this.i18n.t('teacherDashboard.students.removed'));
      },
      error: error => this.toast.error(this.i18n.errorMessage(error, 'teacherDashboard.students.removeError'))
    });
  }

  // ===== Importación =====

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0] ?? null;
    this.resetImport();
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      this.importFailure.set({ key: 'teacherDashboard.students.fileTooLarge' });
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
        this.importFailure.set({ key: 'teacherDashboard.students.previewError', error });
        this.importFile.set(null);
        this.isPreviewing.set(false);
      }
    });
  }

  confirmImport(): void {
    const file = this.importFile();
    if (!file || this.isImporting()) return;
    this.isImporting.set(true);
    this.importFailure.set(null);
    this.service.import(this.store.courseId(), file, this.sendInvites()).subscribe({
      next: result => {
        this.importDone.set(result);
        this.preview.set(null);
        this.importFile.set(null);
        this.isImporting.set(false);
        this.toast.success(this.i18n.t('teacherDashboard.students.importCompleted'));
        this.load();
      },
      error: error => {
        this.importFailure.set({ key: 'teacherDashboard.students.importError', error });
        this.isImporting.set(false);
      }
    });
  }

  resetImport(): void {
    this.importFile.set(null);
    this.preview.set(null);
    this.importFailure.set(null);
    this.importDone.set(null);
  }

  cancelImport(input: HTMLInputElement): void {
    input.value = '';
    this.resetImport();
  }
}
