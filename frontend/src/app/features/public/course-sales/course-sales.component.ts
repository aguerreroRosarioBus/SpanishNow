import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';
import { EnrollmentService } from '../../../core/services/enrollment.service';
import { PublicCatalogService } from '../../../core/services/public-catalog.service';
import { CheckoutQuote, PublicCourseDetail } from '../../../core/models/sales.model';
import { VideoEmbedComponent } from '../../../shared/components/video-embed/video-embed.component';
import { IconComponent } from '../../../shared/components/icon/icon.component';
import { formatPrice } from '../../../shared/utils/money';
import { couponErrorMessage, normalizeCouponCode, priceView } from '../../../shared/utils/coupon-price';

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

  // Cupón
  showCoupon = signal(false);
  couponInput = signal('');
  quote = signal<CheckoutQuote | null>(null);
  isApplying = signal(false);
  couponError = signal('');

  isFree = computed(() => (this.course()?.price ?? 0) === 0);
  /** Un cupón del 100 % no pasa por Stripe: sin sesión hay que pedir el email para crear la cuenta. */
  needsEmail = computed(() => !this.isFree() && !!this.price()?.isFree && !this.currentUser());
  buyerEmail = signal('');
  price = computed(() => {
    const c = this.course();
    return c ? priceView(c.price, this.quote()) : null;
  });
  priceLabel = computed(() => {
    const c = this.course();
    const p = this.price();
    if (!c || !p) return '';
    if (c.price <= 0) return 'Free';
    return p.isFree ? 'Free' : formatPrice(p.final, c.currency);
  });
  originalLabel = computed(() => {
    const c = this.course();
    const p = this.price();
    return c && p?.original != null ? formatPrice(p.original, c.currency) : '';
  });
  savingsLabel = computed(() => {
    const c = this.course();
    const q = this.quote();
    return c && q && q.discountAmount > 0 ? formatPrice(q.discountAmount, c.currency) : '';
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
        // ?coupon=CODE se aplica solo
        const fromUrl = normalizeCouponCode(this.route.snapshot.queryParamMap.get('coupon'));
        if (fromUrl && course.price > 0) {
          this.couponInput.set(fromUrl);
          this.showCoupon.set(true);
          this.applyCoupon();
        }
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

  applyCoupon(): void {
    const course = this.course();
    const code = normalizeCouponCode(this.couponInput());
    if (!course || this.isApplying()) return;
    if (!code) {
      this.couponError.set('Enter a coupon code.');
      return;
    }
    this.couponInput.set(code);
    this.isApplying.set(true);
    this.couponError.set('');
    this.catalog.quote(course.id, code).subscribe({
      next: quote => {
        this.quote.set(quote);
        this.isApplying.set(false);
      },
      error: error => {
        this.quote.set(null);
        this.couponError.set(couponErrorMessage(error));
        this.isApplying.set(false);
      }
    });
  }

  removeCoupon(): void {
    this.quote.set(null);
    this.couponInput.set('');
    this.couponError.set('');
    this.showCoupon.set(false);
  }

  buy(): void {
    const course = this.course();
    if (!course || this.isBuying()) return;
    const email = this.needsEmail() ? this.buyerEmail().trim() : null;
    if (this.needsEmail() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email ?? '')) {
      this.buyError.set('Enter a valid email address to get the course.');
      return;
    }
    this.isBuying.set(true);
    this.buyError.set('');
    this.catalog.checkout(course.id, this.quote()?.coupon.code, email).subscribe({
      next: ({ url }) => {
        window.location.href = url;
      },
      error: error => {
        this.isBuying.set(false);
        if (error?.status === 409) {
          this.alreadyEnrolled.set(true);
          this.enrolledCourseId.set(course.id);
        } else if (error?.status === 400 && error?.error?.code?.startsWith?.('coupon_')) {
          // El cupón dejó de servir entre el precio mostrado y la compra
          this.quote.set(null);
          this.couponError.set(couponErrorMessage(error));
          this.showCoupon.set(true);
        } else {
          this.buyError.set(error?.error?.error || 'We could not start the checkout. Please try again.');
        }
      }
    });
  }
}
