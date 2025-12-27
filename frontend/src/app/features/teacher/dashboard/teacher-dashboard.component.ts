import { Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';
import { CourseService } from '../../../core/services/course.service';
import { Course } from '../../../core/models/course.model';
import { NavbarComponent } from '../../dashboard/navbar/navbar.component';

@Component({
  selector: 'app-teacher-dashboard',
  standalone: true,
  imports: [CommonModule, NavbarComponent, ReactiveFormsModule, RouterLink],
  templateUrl: './teacher-dashboard.component.html',
  styleUrl: './teacher-dashboard.component.scss'
})
export class TeacherDashboardComponent implements OnInit {
  private authService = inject(AuthService);
  private courseService = inject(CourseService);
  private router = inject(Router);
  private fb = inject(FormBuilder);

  currentUser = this.authService.currentUser;
  courses = signal<Course[]>([]);
  isLoading = signal<boolean>(false);
  errorMessage = signal<string>('');
  showCreateModal = signal<boolean>(false);
  isCreating = signal<boolean>(false);

  courseForm: FormGroup;
  selectedImageFile: File | null = null;
  imagePreview: string | null = null;

  // Niveles CEFR para el selector
  levels = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];

  constructor() {
    this.courseForm = this.fb.group({
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
    this.errorMessage.set('');

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
        this.errorMessage.set('Error al cargar los cursos');
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
    const input = event.target as HTMLInputElement;
    if (input.files && input.files[0]) {
      const file = input.files[0];

      // Validar que sea una imagen
      if (!file.type.startsWith('image/')) {
        alert('Por favor selecciona un archivo de imagen válido');
        return;
      }

      // Validar tamaño (máximo 5MB)
      if (file.size > 5 * 1024 * 1024) {
        alert('La imagen no debe superar los 5MB');
        return;
      }

      this.selectedImageFile = file;

      // Crear preview
      const reader = new FileReader();
      reader.onload = (e) => {
        this.imagePreview = e.target?.result as string;
      };
      reader.readAsDataURL(file);
    }
  }

  createCourse(): void {
    if (this.courseForm.invalid) {
      this.courseForm.markAllAsTouched();
      return;
    }

    this.isCreating.set(true);
    this.errorMessage.set('');

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

        // Cerrar modal y resetear
        this.closeCreateModal();
        this.isCreating.set(false);
      },
      error: (error) => {
        console.error('Error creating course:', error);
        this.errorMessage.set('Error al crear el curso. Intenta de nuevo.');
        this.isCreating.set(false);
      }
    });
  }

  hasError(field: string): boolean {
    const control = this.courseForm.get(field);
    return !!(control && control.invalid && control.touched);
  }

  getErrorMessage(field: string): string {
    const control = this.courseForm.get(field);

    if (control?.hasError('required')) {
      const fieldNames: { [key: string]: string } = {
        title: 'El título',
        description: 'La descripción',
        level: 'El nivel'
      };
      return `${fieldNames[field]} es requerido`;
    }

    if (control?.hasError('minlength')) {
      const minLength = control.errors?.['minlength'].requiredLength;
      return `Debe tener al menos ${minLength} caracteres`;
    }

    return '';
  }

  logout(): void {
    this.authService.logout();
    this.router.navigate(['/auth/login']);
  }
}
