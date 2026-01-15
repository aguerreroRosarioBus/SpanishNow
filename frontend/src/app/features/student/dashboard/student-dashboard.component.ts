import { Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';
import { CourseService } from '../../../core/services/course.service';
import { EnrollmentService } from '../../../core/services/enrollment.service';
import { ToastService } from '../../../core/services/toast.service';
import { Course, Enrollment } from '../../../core/models/course.model';
import { ConfirmDialogComponent } from '../../../shared/components/confirm-dialog/confirm-dialog.component';

@Component({
  selector: 'app-student-dashboard',
  standalone: true,
  imports: [CommonModule, RouterLink, ConfirmDialogComponent],
  templateUrl: './student-dashboard.component.html',
  styleUrl: './student-dashboard.component.scss'
})
export class StudentDashboardComponent implements OnInit {
  private authService = inject(AuthService);
  private courseService = inject(CourseService);
  private enrollmentService = inject(EnrollmentService);
  private toastService = inject(ToastService);
  private router = inject(Router);

  currentUser = this.authService.currentUser;

  // Catálogo de cursos disponibles
  allCourses = signal<Course[]>([]);

  // Cursos en los que el estudiante está inscrito
  myCourses = signal<Enrollment[]>([]);

  // Estados de carga
  isLoadingCatalog = signal<boolean>(false);
  isLoadingMyCourses = signal<boolean>(false);
  errorMessage = signal<string>('');

  // Vista activa: 'catalog' o 'my-courses'
  activeView = signal<'catalog' | 'my-courses'>('my-courses');

  // Confirm dialog state
  showConfirmDialog = signal<boolean>(false);
  confirmDialogData = signal<{
    title: string;
    message: string;
    confirmText: string;
    type: 'danger' | 'warning';
    onConfirm: () => void;
  } | null>(null);

  ngOnInit(): void {
    if (!this.authService.isStudent()) {
      this.router.navigate(['/auth/login']);
      return;
    }

    this.loadCatalog();
    this.loadMyCourses();
  }

  loadCatalog(): void {
    this.isLoadingCatalog.set(true);
    this.errorMessage.set('');

    this.courseService.getCourses().subscribe({
      next: (courses) => {
        this.allCourses.set(courses);
        this.isLoadingCatalog.set(false);
      },
      error: (error) => {
        console.error('Error loading catalog:', error);
        this.errorMessage.set('Error al cargar el catálogo de cursos');
        this.isLoadingCatalog.set(false);
      }
    });
  }

  loadMyCourses(): void {
    this.isLoadingMyCourses.set(true);

    this.enrollmentService.getMyCourses().subscribe({
      next: (enrollments) => {
        this.myCourses.set(enrollments);
        this.isLoadingMyCourses.set(false);
      },
      error: (error) => {
        console.error('Error loading my courses:', error);
        this.isLoadingMyCourses.set(false);
      }
    });
  }

  enrollInCourse(courseId: number): void {
    this.enrollmentService.enroll(courseId).subscribe({
      next: (enrollment) => {
        console.log('Inscrito en curso:', enrollment);

        // Recargar mis cursos
        this.loadMyCourses();

        // Cambiar a vista de mis cursos
        this.activeView.set('my-courses');
      },
      error: (error) => {
        console.error('Error enrolling:', error);

        if (error.status === 400) {
          this.toastService.warning('Ya estás inscrito en este curso');
        } else {
          this.toastService.error('Error al inscribirse. Intenta de nuevo.');
        }
      }
    });
  }

  isEnrolled(courseId: number): boolean {
    return this.myCourses().some(e => e.courseId === courseId);
  }

  switchView(view: 'catalog' | 'my-courses'): void {
    this.activeView.set(view);
  }

  // Confirm Dialog Helpers
  showConfirm(title: string, message: string, confirmText: string, onConfirm: () => void, type: 'danger' | 'warning' = 'danger'): void {
    this.confirmDialogData.set({ title, message, confirmText, type, onConfirm });
    this.showConfirmDialog.set(true);
  }

  onConfirmDialogConfirmed(): void {
    const data = this.confirmDialogData();
    if (data) {
      data.onConfirm();
    }
    this.closeConfirmDialog();
  }

  closeConfirmDialog(): void {
    this.showConfirmDialog.set(false);
    this.confirmDialogData.set(null);
  }

  // Reset course progress
  resetCourseProgress(enrollment: Enrollment): void {
    this.showConfirm(
      'Reiniciar Progreso',
      `¿Estás seguro de que quieres reiniciar tu progreso en "${enrollment.course?.title}"? Esto eliminará todas tus historias completadas y actividades realizadas.`,
      'Reiniciar',
      () => {
        this.enrollmentService.resetCourseProgress(enrollment.id).subscribe({
          next: () => {
            this.toastService.success('Progreso del curso reiniciado exitosamente');
            // No need to reload, progress is already reset on backend
          },
          error: (error) => {
            console.error('Error resetting progress:', error);
            this.toastService.error('Error al reiniciar el progreso del curso');
          }
        });
      },
      'warning'
    );
  }

  logout(): void {
    this.authService.logout();
    this.router.navigate(['/auth/login']);
  }
}
