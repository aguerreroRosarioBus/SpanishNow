import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';
import { EnrollmentService } from '../../../core/services/enrollment.service';
import { AffiliateService } from '../../../core/services/affiliate.service';
import { PublicCatalogService } from '../../../core/services/public-catalog.service';
import { CheckoutQuote, PublicCourseDetail } from '../../../core/models/sales.model';
import { VideoEmbedComponent } from '../../../shared/components/video-embed/video-embed.component';
import { IconComponent } from '../../../shared/components/icon/icon.component';
import { browserStorage, normalizeAffiliateCode, readAffiliateRef, saveAffiliateRef } from '../../../shared/utils/affiliate-attribution';
import { normalizeCouponCode, priceView } from '../../../shared/utils/coupon-price';
import { I18nService } from '../../../core/i18n/i18n.service';
import { TranslatePipe } from '../../../core/i18n/translate.pipe';
import { ExpectationsViewComponent } from '../../legal/expectations-view/expectations-view.component';
import { LegalConsentComponent } from '../../legal/legal-consent/legal-consent.component';
import { CheckoutEvidence } from '../../legal/legal.model';
import { consentFor, contractual, LegalService } from '../../legal/legal.service';

/** Página de venta de un curso: descripción, índice, precio y botón de compra. */
@Component({
  selector: 'app-course-sales',
  standalone: true,
  imports: [RouterLink, VideoEmbedComponent, IconComponent, TranslatePipe, ExpectationsViewComponent, LegalConsentComponent],
  templateUrl: './course-sales.component.html',
  styleUrl: './course-sales.component.scss'
})
export class CourseSalesComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private catalog = inject(PublicCatalogService);
  private affiliates = inject(AffiliateService);
  private enrollments = inject(EnrollmentService);
  private auth = inject(AuthService);
  private i18n = inject(I18nService);
  private legal = inject(LegalService);

  course = signal<PublicCourseDetail | null>(null);
  isLoading = signal(true);
  notFound = signal(false);
  loadError = signal(false);
  enrolledCourseId = signal<number | null>(null);
  alreadyEnrolled = signal(false);
  isBuying = signal(false);
  private buyFailure = signal<unknown>(null);
  buyError = computed(() => {
    const failure = this.buyFailure();
    return typeof failure === 'string' ? this.i18n.t(failure) : failure ? this.legal.errorMessage(failure, 'publicCourse.checkoutError') : '';
  });
  currentUser = this.auth.currentUser;

  // Cupón
  showCoupon = signal(false);
  couponInput = signal('');
  quote = signal<CheckoutQuote | null>(null);
  isApplying = signal(false);
  private couponFailure = signal<unknown>(null);
  couponError = computed(() => {
    const failure = this.couponFailure();
    if (typeof failure === 'string') return this.i18n.t(failure);
    if (this.isHotmart() && (failure as {error?: {code?: string}})?.error?.code === 'coupon_not_applicable') return this.i18n.t('publicCourse.hotmartCoupon');
    return failure ? this.i18n.errorMessage(failure, 'publicCourse.couponError') : '';
  });

  /** Se cobra en el checkout de Hotmart: sin campo de email y sin cupones parciales (solo ?coupon= del 100 %). */
  isHotmart = computed(() => this.course()?.checkoutProvider === 'hotmart');
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
    if (c.price <= 0) return this.i18n.t('publicCourse.free');
    return p.isFree ? this.i18n.t('publicCourse.free') : this.i18n.formatMoney(p.final, c.currency);
  });
  originalLabel = computed(() => {
    const c = this.course();
    const p = this.price();
    return c && p?.original != null ? this.i18n.formatMoney(p.original, c.currency) : '';
  });
  savingsLabel = computed(() => {
    const c = this.course();
    const q = this.quote();
    return c && q && q.discountAmount > 0 ? this.i18n.formatMoney(q.discountAmount, c.currency) : '';
  });
  // W02 (SALES-04, LEGAL-02): la casilla acepta exactamente las versiones de la instantánea mostrada.
  commercial = computed(() => this.course()?.commercial ?? null);
  consentDocs = computed(() => (this.commercial()?.legalDocuments ?? []).map(d => ({
    documentKey: d.documentKey, version: d.version, title: d.content[this.i18n.locale()].title
  })));
  needsConsent = computed(() => contractual(this.consentDocs()).length > 0);
  legalAccepted = signal(false);
  consentSubmitted = signal(false);
  lessonCount = computed(() => (this.course()?.units ?? []).reduce((sum, u) => sum + u.stories.length, 0));
  materialsCount = computed(() => this.course()?.materialsCount ?? 0);
  quizCount = computed(() => (this.course()?.units ?? []).filter(u => u.hasQuiz).length);
  sortedUnits = computed(() => [...(this.course()?.units ?? [])]
    .sort((a, b) => a.order - b.order)
    .map(u => ({ ...u, stories: [...u.stories].sort((a, b) => a.order - b.order) })));

  ngOnInit(): void {
    const slug = this.route.snapshot.paramMap.get('slug') ?? '';
    this.captureAffiliateRef();
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

  /** ?ref=CODE: se valida con el servidor y se guarda 30 días (último click gana). Nunca rompe la página. */
  private captureAffiliateRef(): void {
    try {
      const code = normalizeAffiliateCode(this.route.snapshot.queryParamMap.get('ref'));
      if (!code) return;
      this.affiliates.validateCode(code).subscribe({
        next: ({ valid }) => { if (!valid) return;
          this.sessionRef = code; // sigue valiendo en esta página aunque localStorage falle
          saveAffiliateRef(browserStorage(), code); },
        error: () => { /* sin validación no se guarda: la compra sigue sin afiliado */ }
      });
    } catch { /* la atribución es opcional */ }
  }

  private sessionRef: string | null = null;
  private affiliateCode(): string | null { return this.sessionRef ?? readAffiliateRef(browserStorage()); }

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
      this.couponFailure.set('publicCourse.enterCoupon');
      return;
    }
    this.couponInput.set(code);
    this.isApplying.set(true);
    this.couponFailure.set(null);
    this.catalog.quote(course.id, code, this.affiliateCode()).subscribe({
      next: quote => {
        this.quote.set(quote);
        this.isApplying.set(false);
      },
      error: error => {
        this.quote.set(null);
        this.couponFailure.set(error);
        this.isApplying.set(false);
      }
    });
  }

  removeCoupon(): void {
    this.quote.set(null);
    this.couponInput.set('');
    this.couponFailure.set(null);
    this.showCoupon.set(false);
  }

  private refreshCommercial(slug: string): void {
    this.legalAccepted.set(false);
    this.consentSubmitted.set(false);
    this.catalog.getCourse(slug).subscribe({ next: course => this.course.set(course), error: () => { /* se mantiene el aviso */ } });
  }

  /** Aparte para poder probar la compra sin navegar. */
  protected redirect(url: string): void { window.location.href = url; }

  buy(): void {
    const course = this.course();
    if (!course || this.isBuying()) return;
    const email = this.needsEmail() ? this.buyerEmail().trim() : null;
    if (this.needsEmail() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email ?? '')) {
      this.buyFailure.set('publicCourse.validEmail');
      return;
    }
    this.consentSubmitted.set(true);
    if (this.needsConsent() && !this.legalAccepted()) return;
    const commercial = this.commercial();
    const evidence: CheckoutEvidence | null = commercial ? {
      locale: this.i18n.locale(),
      commercialHash: commercial.hash,
      ...(this.needsConsent() ? { legalConsent: consentFor(commercial.legalDocuments) } : {})
    } : null;
    this.isBuying.set(true);
    this.buyFailure.set(null);
    this.catalog.checkout(course.id, this.quote()?.coupon.code, email, this.affiliateCode(), evidence).subscribe({
      next: ({ url }) => {
        this.redirect(url);
      },
      error: error => {
        this.isBuying.set(false);
        if (['sales_snapshot_changed', 'legal_version_changed', 'legal_acceptance_required'].includes(error?.error?.code)) {
          // Cambió precio, expectativas o legales: se muestra la versión nueva y hay que aceptarla otra vez.
          this.buyFailure.set(error);
          this.refreshCommercial(course.slug);
        } else if (error?.status === 409) {
          this.alreadyEnrolled.set(true);
          this.enrolledCourseId.set(course.id);
        } else if (error?.status === 400 && error?.error?.code?.startsWith?.('coupon_')) {
          // El cupón dejó de servir entre el precio mostrado y la compra
          this.quote.set(null);
          this.couponFailure.set(error);
          this.showCoupon.set(true);
        } else {
          this.buyFailure.set(error);
        }
      }
    });
  }
}
