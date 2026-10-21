import { Component, inject, OnInit, signal } from '@angular/core';
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
import { pluralize } from '../../../shared/pipes/plural.pipe';
import { IconComponent } from '../../../shared/components/icon/icon.component';
import { PluralPipe } from '../../../shared/pipes/plural.pipe';
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
  imports: [CommonModule, RouterLink, PluralPipe, IconComponent, NextCourseCardComponent],
  templateUrl: './progress.component.html',
  styleUrl: './progress.component.scss'
})
export class ProgressComponent implements OnInit {
  private enrollmentService = inject(EnrollmentService);
  private certificateService = inject(CertificateService);
  private auth = inject(AuthService);
  private toast = inject(ToastService);

  // Emisión del certificado: un solo formulario abierto a la vez
  claimingId = signal<number | null>(null);
  claimName = signal('');
  isIssuing = signal(false);
  claimError = signal('');

  courses = signal<CourseProgress[]>([]);
  isLoading = signal<boolean>(false);

  ngOnInit(): void {
    this.loadProgress();
  }

  loadProgress(): void {
    this.isLoading.set(true);
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
        console.error('Error loading progress:', error);
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
    const parts: string[] = [];
    if (cert.missing.stories > 0) parts.push(pluralize(cert.missing.stories, 'lección', 'lecciones'));
    if (cert.missing.quizzes > 0) parts.push(pluralize(cert.missing.quizzes, 'quiz', 'quizzes'));
    return parts.length ? `Faltan ${parts.join(' y ')} para obtener tu certificado.` : 'Completa el curso para obtener tu certificado.';
  }

  pdfUrl(code: string): string { return this.certificateService.pdfUrl(code); }
  verificationUrl(code: string): string { return this.certificateService.verificationUrl(code); }

  startClaim(course: CourseProgress): void {
    this.claimError.set('');
    this.claimName.set(this.auth.currentUser()?.name ?? '');
    this.claimingId.set(course.enrollment.id);
  }

  cancelClaim(): void { this.claimingId.set(null); }

  issueCertificate(course: CourseProgress): void {
    const name = this.claimName().trim();
    if (!name || name.length > 100 || this.isIssuing()) return;
    this.isIssuing.set(true);
    this.claimError.set('');
    this.certificateService.issue(course.enrollment.id, name).subscribe({
      next: issued => {
        this.setCertificate(course.enrollment.id, { eligible: true, code: issued.code, missing: { stories: 0, quizzes: 0 } });
        this.isIssuing.set(false);
        this.claimingId.set(null);
        this.toast.success('¡Certificado emitido!');
      },
      error: error => {
        this.isIssuing.set(false);
        if (error?.status === 409 && error?.error?.missing) {
          this.setCertificate(course.enrollment.id, { eligible: false, code: null, missing: error.error.missing });
          this.claimingId.set(null);
        } else {
          this.claimError.set(error?.error?.error || 'No se pudo emitir el certificado. Intenta nuevamente.');
        }
      }
    });
  }

  private setCertificate(enrollmentId: number, certificate: CertificateStatus): void {
    this.courses.update(list => list.map(c => c.enrollment.id === enrollmentId ? { ...c, certificate } : c));
  }
}

