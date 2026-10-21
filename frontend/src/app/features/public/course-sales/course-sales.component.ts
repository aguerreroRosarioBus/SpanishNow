import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';
import { EnrollmentService } from '../../../core/services/enrollment.service';
import { PublicCatalogService } from '../../../core/services/public-catalog.service';
import { PublicCourseDetail } from '../../../core/models/sales.model';
import { VideoEmbedComponent } from '../../../shared/components/video-embed/video-embed.component';
import { IconComponent } from '../../../shared/components/icon/icon.component';
import { formatPrice } from '../../../shared/utils/money';

/** Página de venta de un curso: descripción, índice, precio y botón de compra. */
@Component({
  selector: 'app-course-sales',
  standalone: true,
  imports: [RouterLink, VideoEmbedComponent, IconComponent],
  templateUrl: './course-sales.component.html',
  styleUrl: './course-sales.component.scss'
})
export class CourseSalesComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private catalog = inject(PublicCatalogService);
  private enrollments = inject(EnrollmentService);
  private auth = inject(AuthService);

  course = signal<PublicCourseDetail | null>(null);
  isLoading = signal(true);
  notFound = signal(false);
  loadError = signal(false);
  enrolledCourseId = signal<number | null>(null);
  alreadyEnrolled = signal(false);
  isBuying = signal(false);
  buyError = signal('');
  currentUser = this.auth.currentUser;

  isFree = computed(() => (this.course()?.price ?? 0) === 0);
  priceLabel = computed(() => {
    const c = this.course();
    return c && c.price > 0 ? formatPrice(c.price, c.currency) : 'Free';
  });
  lessonCount = computed(() => (this.course()?.units ?? []).reduce((sum, u) => sum + u.stories.length, 0));
  materialsCount = computed(() => this.course()?.materialsCount ?? 0);
  quizCount = computed(() => (this.course()?.units ?? []).filter(u => u.hasQuiz).length);
  sortedUnits = computed(() => [...(this.course()?.units ?? [])]
    .sort((a, b) => a.order - b.order)
    .map(u => ({ ...u, stories: [...u.stories].sort((a, b) => a.order - b.order) })));

  ngOnInit(): void {
    const slug = this.route.snapshot.paramMap.get('slug') ?? '';
    this.catalog.getCourse(slug).subscribe({
      next: course => {
        this.course.set(course);
        this.isLoading.set(false);
        this.checkEnrollment(course.id);
      },
      error: error => {
        if (error?.status === 404) this.notFound.set(true);
        else this.loadError.set(true);
        this.isLoading.set(false);
      }
    });
  }

  private checkEnrollment(courseId: number): void {
    if (!this.auth.isAuthenticated() || !this.auth.isStudent()) return;
    this.enrollments.getMyCourses().subscribe({
      next: list => {
        if (list.some(e => e.courseId === courseId)) {
          this.enrolledCourseId.set(courseId);
          this.alreadyEnrolled.set(true);
        }
      },
      error: () => { /* sin dato de inscripción: se muestra el botón de compra y el servidor responde 409 */ }
    });
  }

  buy(): void {
    const course = this.course();
    if (!course || this.isBuying()) return;
    this.isBuying.set(true);
    this.buyError.set('');
    this.catalog.checkout(course.id).subscribe({
      next: ({ url }) => {
        window.location.href = url;
      },
      error: error => {
        this.isBuying.set(false);
        if (error?.status === 409) {
          this.alreadyEnrolled.set(true);
          this.enrolledCourseId.set(course.id);
        } else {
          this.buyError.set(error?.error?.error || 'We could not start the checkout. Please try again.');
        }
      }
    });
  }
}
