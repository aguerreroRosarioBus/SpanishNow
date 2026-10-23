import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AbstractControl, FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';
import { CourseService } from '../../../core/services/course.service';
import { ToastService } from '../../../core/services/toast.service';
import { Course } from '../../../core/models/course.model';
import { CourseCardComponent } from '../../../shared/components/course-card/course-card.component';
import { IconComponent } from '../../../shared/components/icon/icon.component';
import { imageFileErrorKey, IMAGE_ACCEPT } from '../lesson-composer/image-file';
import { ImageSearchComponent } from '../../../shared/components/image-search/image-search.component';
import { I18nService } from '../../../core/i18n/i18n.service';
import { TranslatePipe } from '../../../core/i18n/translate.pipe';

@Component({
  selector: 'app-teacher-dashboard',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink, CourseCardComponent, IconComponent, TranslatePipe, ImageSearchComponent],
  templateUrl: './teacher-dashboard.component.html',
  styleUrl: './teacher-dashboard.component.scss'
})
export class TeacherDashboardComponent implements OnInit {
  private authService = inject(AuthService);
  private courseService = inject(CourseService);
  private toastService = inject(ToastService);
  private router = inject(Router);
  private fb = inject(FormBuilder);
  private i18n = inject(I18nService);

  currentUser = this.authService.currentUser;
  courses = signal<Course[]>([]);
  isLoading = signal<boolean>(false);
  /** Se guarda la clave (y el error con su código), no el texto: así cambia con el idioma sin repetir peticiones. */
  private failure = signal<{ key: string; error?: unknown } | null>(null);
  errorMessage = computed(() => {
    const f = this.failure();
    return f ? this.i18n.errorMessage(f.error, f.key) : '';
  });
  showCreateModal = signal<boolean>(false);
  isCreating = signal<boolean>(false);

  courseForm: FormGroup;
  readonly imageAccept = IMAGE_ACCEPT;
  selectedImageFile: File | null = null;
  imagePreview: string | null = null;

  // Edit modal state
  showEditModal = signal<boolean>(false);
  editingCourse = signal<Course | null>(null);
  isUpdating = signal<boolean>(false);
  editCourseForm: FormGroup;
  selectedEditImageFile: File | null = null;
  editImagePreview: string | null = null;

  // Niveles CEFR para el selector
  levels = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];

  constructor() {
    this.courseForm = this.fb.group({
      title: ['', [Validators.required, Validators.minLength(3)]],
      description: ['', [Validators.required, Validators.minLength(10)]],
      level: ['A1', [Validators.required]]
    });

    this.editCourseForm = this.fb.group({
      title: ['', [Validators.required, Validators.minLength(3)]],
      description: ['', [Validators.required, Validators.minLength(10)]],
      level: ['A1', [Validators.required]]
    });
  }

  ngOnInit(): void {
    if (!this.authService.isTeacher()) {
      this.router.navigate(['/auth/login']);
      return;
    }
    this.loadCourses();
  }

  loadCourses(): void {
    this.isLoading.set(true);
    this.failure.set(null);

    this.courseService.getCourses().subscribe({
      next: (courses) => {
        // Filtrar solo los cursos del profesor actual
        const myCourses = courses.filter(
          c => c.teacherId === this.currentUser()?.id
        );
        this.courses.set(myCourses);
        this.isLoading.set(false);
      },
      error: (error) => {
        console.error('Error loading courses:', error);
        this.failure.set({ key: 'teacherDashboard.loadError', error });
        this.isLoading.set(false);
      }
    });
  }

  openCreateModal(): void {
    this.showCreateModal.set(true);
    this.courseForm.reset({ level: 'A1' });
    this.selectedImageFile = null;
    this.imagePreview = null;
  }

  closeCreateModal(): void {
    this.showCreateModal.set(false);
    this.courseForm.reset();
    this.selectedImageFile = null;
    this.imagePreview = null;
  }

  onImageSelected(event: Event): void {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (file) this.selectSearchImage(file);
  }

  selectSearchImage(file: File, editing = false): void {
    const invalid = imageFileErrorKey(file);
    if (invalid) { this.toastService.warning(this.i18n.t(invalid)); return; }
    if (editing) this.selectedEditImageFile = file;
    else this.selectedImageFile = file;
    const reader = new FileReader();
    reader.onload = () => {
      if (editing) this.editImagePreview = reader.result as string;
      else this.imagePreview = reader.result as string;
    };
    reader.readAsDataURL(file);
  }

  createCourse(): void {
    if (this.courseForm.invalid) {
      this.courseForm.markAllAsTouched();
      return;
    }

    this.isCreating.set(true);
    this.failure.set(null);

    // Crear FormData para enviar al backend
    const formData = new FormData();
    formData.append('title', this.courseForm.get('title')?.value);
    formData.append('description', this.courseForm.get('description')?.value);
    formData.append('level', this.courseForm.get('level')?.value);

    if (this.selectedImageFile) {
      formData.append('image', this.selectedImageFile);
    }

    this.courseService.createCourse(formData).subscribe({
      next: (newCourse) => {
        console.log('Curso creado:', newCourse);

        // Agregar el nuevo curso a la lista
        this.courses.update(current => [...current, newCourse]);

        // Mostrar toast de éxito
        this.toastService.success(this.i18n.t('teacherDashboard.created'));

        // Cerrar modal y resetear
        this.closeCreateModal();
        this.isCreating.set(false);
      },
      error: (error) => {
        console.error('Error creating course:', error);

        // Manejar errores de autenticación
        if (error.status === 401 || error.status === 403) {
          this.toastService.error(this.i18n.t('teacherDashboard.sessionExpired'));
          this.authService.logout();
          this.router.navigate(['/auth/login']);
          return;
        }

        this.failure.set({ key: 'teacherDashboard.createError', error });
        this.toastService.error(this.i18n.t('teacherDashboard.createErrorToast'));
        this.isCreating.set(false);
      }
    });
  }

  hasError(field: string): boolean {
    const control = this.courseForm.get(field);
    return !!(control && control.invalid && control.touched);
  }

  getErrorMessage(field: string): string {
    return this.fieldError(this.courseForm.get(field), field);
  }

  private fieldError(control: AbstractControl | null, field: string): string {
    if (control?.hasError('required')) {
      const keys: Record<string, string> = {
        title: 'teacherDashboard.requiredTitle',
        description: 'teacherDashboard.requiredDescription',
        level: 'teacherDashboard.requiredLevel'
      };
      return this.i18n.t(keys[field]);
    }

    if (control?.hasError('minlength')) {
      return this.i18n.t('teacherDashboard.minLength', { min: control.errors?.['minlength'].requiredLength });
    }

    return '';
  }

  // Edit modal methods
  openEditModal(course: Course): void {
    this.editingCourse.set(course);
    this.editCourseForm.patchValue({
      title: course.title,
      description: course.description,
      level: course.level
    });
    this.selectedEditImageFile = null;
    this.editImagePreview = null;
    this.showEditModal.set(true);
  }

  closeEditModal(): void {
    this.showEditModal.set(false);
    this.editingCourse.set(null);
    this.editCourseForm.reset();
    this.selectedEditImageFile = null;
    this.editImagePreview = null;
  }

  onEditImageSelected(event: Event): void {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (file) this.selectSearchImage(file, true);
  }

  updateCourse(): void {
    if (this.editCourseForm.invalid || !this.editingCourse()) {
      this.editCourseForm.markAllAsTouched();
      return;
    }

    this.isUpdating.set(true);
    this.failure.set(null);

    // Crear FormData para enviar al backend
    const formData = new FormData();
    formData.append('title', this.editCourseForm.get('title')?.value);
    formData.append('description', this.editCourseForm.get('description')?.value);
    formData.append('level', this.editCourseForm.get('level')?.value);

    if (this.selectedEditImageFile) {
      formData.append('image', this.selectedEditImageFile);
    }

    const courseId = this.editingCourse()!.id;

    this.courseService.updateCourse(courseId, formData).subscribe({
      next: (updatedCourse) => {
        console.log('Curso actualizado:', updatedCourse);

        // Actualizar el curso en la lista
        this.courses.update(current =>
          current.map(c => c.id === courseId ? updatedCourse : c)
        );

        // Mostrar toast de éxito
        this.toastService.success(this.i18n.t('teacherDashboard.updated'));

        // Cerrar modal y resetear
        this.closeEditModal();
        this.isUpdating.set(false);
      },
      error: (error) => {
        console.error('Error updating course:', error);

        // Manejar errores de autenticación
        if (error.status === 401 || error.status === 403) {
          this.toastService.error(this.i18n.t('teacherDashboard.sessionExpired'));
          this.authService.logout();
          this.router.navigate(['/auth/login']);
          return;
        }

        this.failure.set({ key: 'teacherDashboard.updateError', error });
        this.toastService.error(this.i18n.t('teacherDashboard.updateErrorToast'));
        this.isUpdating.set(false);
      }
    });
  }

  hasEditError(field: string): boolean {
    const control = this.editCourseForm.get(field);
    return !!(control && control.invalid && control.touched);
  }

  getEditErrorMessage(field: string): string {
    return this.fieldError(this.editCourseForm.get(field), field);
  }

  logout(): void {
    this.authService.logout();
    this.router.navigate(['/auth/login']);
  }
}
