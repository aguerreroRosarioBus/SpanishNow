import { I18nService } from '../../../core/i18n/i18n.service';
import { TranslatePipe } from '../../../core/i18n/translate.pipe';
import { Component, inject, OnInit, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { catchError, forkJoin, of, switchMap } from 'rxjs';
import { EnrollmentService } from '../../../core/services/enrollment.service';
import { NextCourseOffer } from '../../../core/models/sales.model';
import { NextCourseCardComponent } from '../../../shared/components/next-course-card/next-course-card.component';
import { CertificateStatus, Enrollment, EnrollmentProgress, QuizProgress, StoryProgress } from '../../../core/models/course.model';
import { AuthService } from '../../../core/services/auth.service';
import { CertificateService } from '../../../core/services/certificate.service';
import { ToastService } from '../../../core/services/toast.service';
import { IconComponent } from '../../../shared/components/icon/icon.component';
import { unitDisplayTitle } from '../../../shared/utils/unit-title';

export interface CourseProgress {
  enrollment: Enrollment;
  stories: StoryProgress[];
  quizzes: QuizProgress[];
  certificate: CertificateStatus | null;
  next: NextCourseOffer | null;
  failed: boolean;
}

@Component({
  selector: 'app-progress',
  standalone: true,
  imports: [TranslatePipe, CommonModule, RouterLink, IconComponent, NextCourseCardComponent],
  templateUrl: './progress.component.html',
  styleUrl: './progress.component.scss'
})
export class ProgressComponent implements OnInit {
  readonly i18n = inject(I18nService);
  private enrollmentService = inject(EnrollmentService);
  private certificateService = inject(CertificateService);
  private auth = inject(AuthService);
  private toast = inject(ToastService);

  // Emisión del certificado: un solo formulario abierto a la vez
  claimingId = signal<number | null>(null);
  claimName = signal('');
  isIssuing = signal(false);
  private claimFailure = signal<unknown>(null);
  claimError = computed(() => this.claimFailure() ? this.i18n.errorMessage(this.claimFailure(), 'student.certificateError') : '');
  private failure = signal<unknown>(null);
  errorMessage = computed(() => this.failure() ? this.i18n.errorMessage(this.failure(), 'student.progressError') : '');

  courses = signal<CourseProgress[]>([]);
  isLoading = signal<boolean>(false);

  ngOnInit(): void {
    this.loadProgress();
  }

  loadProgress(): void {
    this.isLoading.set(true);
    this.failure.set(null);
    this.enrollmentService.getMyCourses().pipe(
      switchMap(enrollments => enrollments.length === 0 ? of([]) : forkJoin(
        enrollments.map(enrollment => this.enrollmentService.getProgressSummary(enrollment.id).pipe(
          catchError(error => {
            console.error('Error loading course progress:', error);
            return of(null as EnrollmentProgress | null);
          })
        ))
      ).pipe(
        switchMap(results => of(enrollments.map((enrollment, i): CourseProgress =>
          ({ enrollment, stories: results[i]?.stories ?? [], quizzes: results[i]?.quizzes ?? [], certificate: results[i]?.certificate ?? null, next: results[i]?.next ?? null, failed: results[i] === null }))))
      ))
    ).subscribe({
      next: courses => {
        this.courses.set(courses);
        this.isLoading.set(false);
      },
      error: error => {
        this.failure.set(error);
        this.isLoading.set(false);
      }
    });
  }

  /** Curso terminado: certificado listo o elegible. */
  isFinished(course: CourseProgress): boolean {
    return !!(course.certificate?.code || course.certificate?.eligible);
  }

  /** Id del curso siguiente si el alumno ya lo tiene (para ir directo al reproductor). */
  nextCourseId(course: CourseProgress): number | null {
    const slug = course.next?.course.slug;
    return slug ? (this.courses().find(c => c.enrollment.course?.slug === slug)?.enrollment.courseId ?? null) : null;
  }

  unitTitle(title: string): string { return unitDisplayTitle(title); }

  completedCount(course: CourseProgress): number {
    return course.stories.filter(s => s.narrativeCompleted).length;
  }

  percentage(course: CourseProgress): number {
    const total = course.stories.length;
    return total === 0 ? 0 : Math.round((this.completedCount(course) / total) * 100);
  }

  quizSummary(course: CourseProgress): { passed: number; total: number } {
    return { passed: course.quizzes.filter(q => q.passed).length, total: course.quizzes.length };
  }

  /** «Faltan 2 lecciones y 1 quiz» (o solo la parte que falta). */
  missingText(cert: CertificateStatus): string {
    const stories = this.i18n.t('student.missingStoryCount', { count: cert.missing.stories });
    const quizzes = this.i18n.t('student.missingQuizCount', { count: cert.missing.quizzes });
    if (cert.missing.stories > 0 && cert.missing.quizzes > 0) return this.i18n.t('student.missingBoth', { stories, quizzes });
    if (cert.missing.stories > 0) return this.i18n.t('student.missingStories', { stories });
    if (cert.missing.quizzes > 0) return this.i18n.t('student.missingQuizzes', { quizzes });
    return this.i18n.t('student.completeForCertificate');
  }

  pdfUrl(code: string): string { return this.certificateService.pdfUrl(code); }
  verificationUrl(code: string): string { return this.certificateService.verificationUrl(code); }

  startClaim(course: CourseProgress): void {
    this.claimFailure.set(null);
    this.claimName.set(this.auth.currentUser()?.name ?? '');
    this.claimingId.set(course.enrollment.id);
  }

  cancelClaim(): void { this.claimingId.set(null); }

  issueCertificate(course: CourseProgress): void {
    const name = this.claimName().trim();
    if (!name || name.length > 100 || this.isIssuing()) return;
    this.isIssuing.set(true);
    this.claimFailure.set(null);
    this.certificateService.issue(course.enrollment.id, name).subscribe({
      next: issued => {
        this.setCertificate(course.enrollment.id, { eligible: true, code: issued.code, missing: { stories: 0, quizzes: 0 } });
        this.isIssuing.set(false);
        this.claimingId.set(null);
        this.toast.success(this.i18n.t('student.certificateIssued'));
      },
      error: error => {
        this.isIssuing.set(false);
        if (error?.status === 409 && error?.error?.missing) {
          this.setCertificate(course.enrollment.id, { eligible: false, code: null, missing: error.error.missing });
          this.claimingId.set(null);
        } else {
          this.claimFailure.set(error);
        }
      }
    });
  }

  private setCertificate(enrollmentId: number, certificate: CertificateStatus): void {
    this.courses.update(list => list.map(c => c.enrollment.id === enrollmentId ? { ...c, certificate } : c));
  }
}

