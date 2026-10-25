import { UserPreferencesService } from '../../../core/services/user-preferences.service';
import { I18nService } from '../../../core/i18n/i18n.service';
import { TranslatePipe } from '../../../core/i18n/translate.pipe';
import { Component, inject, OnInit, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink, ActivatedRoute } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';
import { CourseService } from '../../../core/services/course.service';
import { EnrollmentService } from '../../../core/services/enrollment.service';
import { ToastService } from '../../../core/services/toast.service';
import { catchError, forkJoin, of } from 'rxjs';
import { Course, Enrollment, EnrollmentProgress } from '../../../core/models/course.model';
import { NgbDropdown, NgbDropdownToggle, NgbDropdownMenu, NgbDropdownItem } from '@ng-bootstrap/ng-bootstrap';
import { CourseCardComponent } from '../../../shared/components/course-card/course-card.component';
import { IconComponent } from '../../../shared/components/icon/icon.component';
import { ConfirmDialogComponent } from '../../../shared/components/confirm-dialog/confirm-dialog.component';

@Component({
  selector: 'app-student-dashboard',
  standalone: true,
  imports: [ TranslatePipe, CommonModule, RouterLink, NgbDropdown, NgbDropdownToggle, NgbDropdownMenu, NgbDropdownItem, CourseCardComponent, IconComponent, ConfirmDialogComponent],
  templateUrl: './student-dashboard.component.html',
  styleUrl: './student-dashboard.component.scss'
})
export class StudentDashboardComponent implements OnInit {
  readonly i18n = inject(I18nService);
  private readonly preferences = inject(UserPreferencesService);
  readonly timeZone = computed(() => this.preferences.preferences()?.timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC');
  private authService = inject(AuthService);
  private courseService = inject(CourseService);
  private enrollmentService = inject(EnrollmentService);
  private toastService = inject(ToastService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);

  currentUser = this.authService.currentUser;

  // Catálogo de cursos disponibles
  allCourses = signal<Course[]>([]);

  // Cursos en los que el estudiante está inscrito
  myCourses = signal<Enrollment[]>([]);

  progressByEnrollment = signal<Record<number, EnrollmentProgress | null>>({});
  teacherName(e:Enrollment):string{return e.course?.teacher?.name||this.allCourses().find(c=>c.id===e.courseId)?.teacher?.name||'';}
  courseState(e: Enrollment): string {
    const p = this.progressByEnrollment()[e.id];
    if (p === undefined) return 'refine.progressLoading';
    if (p === null) return 'refine.progressUnavailable';
    if (p.certificate?.eligible || p.certificate?.code) return 'refine.completed';
    return p.stories.some(s => s.narrativeCompleted || s.lastBlockKey) ? 'refine.inProgress' : 'refine.notStarted';
  }
  courseAction(e: Enrollment): string {
    const state = this.courseState(e);
    return state === 'refine.completed' ? 'refine.review' : state === 'refine.notStarted' ? 'refine.start' : 'student.continue';
  }
  progressPercent(e: Enrollment): number | null {
    const p = this.progressByEnrollment()[e.id];
    return p && p.stories.length ? Math.round(p.stories.filter(s => s.narrativeCompleted).length / p.stories.length * 100) : null;
  }
  resumeStory(e: Enrollment): number | null {
    const stories = this.progressByEnrollment()[e.id]?.stories ?? [];
    return stories.find(s => !s.narrativeCompleted && s.lastBlockKey)?.storyId ?? stories.find(s => !s.narrativeCompleted)?.storyId ?? null;
  }

  // Estados de carga
  isLoadingCatalog = signal<boolean>(false);
  isLoadingMyCourses = signal<boolean>(false);
  private failure = signal<unknown>(null);
  errorMessage = computed(() => this.failure() ? this.i18n.errorMessage(this.failure(), 'student.catalogError') : '');

  readonly levels = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];

  // Vista activa: 'catalog' o 'my-courses'
  activeView = signal<'catalog' | 'my-courses'>('my-courses');

  // Filtro de nivel actual
  currentLevelFilter = signal<string | null>(null);

  // Cursos filtrados por nivel
  filteredCourses = computed(() => {
    const level = this.currentLevelFilter();
    if (!level) {
      return this.allCourses();
    }
    return this.allCourses().filter(course => course.level === level);
  });

  // Confirm dialog state
  showConfirmDialog = signal<boolean>(false);
  confirmDialogData = signal<{
    title: string;
    message: string;
    confirmText: string;
    params: Record<string, string>;
    type: 'danger' | 'warning';
    onConfirm: () => void;
  } | null>(null);

  ngOnInit(): void {
    if (!this.authService.isStudent()) {
      this.router.navigate(['/auth/login']);
      return;
    }

    // Escuchar cambios en query params
    this.route.queryParams.subscribe(params => {
      // Leer vista (catalog o my-courses)
      if (params['view']) {
        this.activeView.set(params['view']);
      }

      // Leer filtro de nivel
      this.currentLevelFilter.set(params['level'] || null);

      // Si hay nivel pero no vista, cambiar a catalog
      if (params['level'] && !params['view']) {
        this.activeView.set('catalog');
      }
    });

    this.loadCatalog();
    this.loadMyCourses();
  }

  loadCatalog(): void {
    this.isLoadingCatalog.set(true);
    this.failure.set(null);

    this.courseService.getCourses().subscribe({
      next: (courses) => {
        this.allCourses.set(courses);
        this.isLoadingCatalog.set(false);
      },
      error: (error) => {
        console.error('Error loading catalog:', error);
        this.failure.set(error);
        this.isLoadingCatalog.set(false);
      }
    });
  }

  loadMyCourses(): void {
    this.isLoadingMyCourses.set(true);

    this.enrollmentService.getMyCourses().subscribe({
      next: (enrollments) => {
        this.myCourses.set(enrollments);
        this.progressByEnrollment.set({});
        if (enrollments.length) forkJoin(enrollments.map(e => this.enrollmentService.getProgressSummary(e.id).pipe(catchError(() => of(null))))).subscribe(results => {
          this.progressByEnrollment.set(Object.fromEntries(enrollments.map((e, i) => [e.id, results[i]])));
        });
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

        if (error.status === 402 && error.error?.checkoutRequired) {
          // El curso tiene precio: la inscripción solo se da por compra
          this.router.navigate(['/courses', error.error.slug]);
        } else if (error.status === 400) {
          this.toastService.warning(this.i18n.t('student.enrolled'));
        } else {
          this.toastService.error(this.i18n.errorMessage(error, 'student.enrollError'));
        }
      }
    });
  }

  /** Precio formateado de un curso de pago; null si es gratis. */
  priceLabel(course: Course): string | null {
    return course.price && course.price > 0 ? this.i18n.formatMoney(course.price, course.currency || 'USD') : null;
  }

  /** Un curso con precio (y slug) se compra desde su página de venta. */
  salesLink(course: Course): string[] | null {
    return this.priceLabel(course) && course.slug ? ['/courses', course.slug] : null;
  }

  isEnrolled(courseId: number): boolean {
    return this.myCourses().some(e => e.courseId === courseId);
  }

  switchView(view: 'catalog' | 'my-courses'): void {
    this.activeView.set(view);
  }

  // Confirm Dialog Helpers
  showConfirm(title: string, message: string, confirmText: string, onConfirm: () => void, type: 'danger' | 'warning' = 'danger', params: Record<string, string> = {}): void {
    this.confirmDialogData.set({ title, message, confirmText, type, onConfirm, params });
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
      'student.reset.title',
      'student.reset.message',
      'student.reset.confirm',
      () => {
        this.enrollmentService.resetCourseProgress(enrollment.id).subscribe({
          next: () => {
            this.toastService.success(this.i18n.t('student.reset.success'));
            this.loadMyCourses();
          },
          error: (error) => {
            console.error('Error resetting progress:', error);
            this.toastService.error(this.i18n.errorMessage(error, 'student.reset.error'));
          }
        });
      },
      'warning',
      { course: enrollment.course?.title ?? this.i18n.t('student.course') }
    );
  }

  logout(): void {
    this.authService.logout();
    this.router.navigate(['/auth/login']);
  }
}
