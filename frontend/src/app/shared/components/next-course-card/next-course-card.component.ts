import { Component, computed, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { NextCourseOffer } from '../../../core/models/sales.model';
import { I18nService } from '../../../core/i18n/i18n.service';
import { TranslatePipe } from '../../../core/i18n/translate.pipe';
import { IconComponent } from '../icon/icon.component';

/** Tarjeta «Sigue con <curso siguiente>» que se muestra al terminar un curso de una serie. */
@Component({
  selector: 'app-next-course-card',
  standalone: true,
  imports: [TranslatePipe, RouterLink, IconComponent],
  template: `
    <section class="next-card" [attr.aria-label]="'student.nextCourse' | t : { course: offer().course.title }">
      <app-icon name="graduation-cap" [size]="22" class="next-card__icon" />
      <div class="next-card__body">
        <strong>{{ 'student.nextCourse' | t : { course: offer().course.title } }}</strong>
        @if (!offer().alreadyEnrolled) {
          <div class="next-card__meta">
            {{ price() }}@if (offer().couponCode) { · {{ 'student.withCoupon' | t : { coupon: offer().couponCode ?? '' } }} }
          </div>
        } @else {
          <div class="next-card__meta">{{ 'student.alreadyNext' | t }}</div>
        }
      </div>
      @if (offer().alreadyEnrolled && courseId(); as id) {
        <a class="btn btn-primary btn-sm" [routerLink]="['/student/course', id, 'play']">{{ 'student.goToCourse' | t }}</a>
      } @else if (offer().alreadyEnrolled) {
        <a class="btn btn-primary btn-sm" [routerLink]="['/courses', offer().course.slug]">{{ 'student.goToCourse' | t }}</a>
      } @else {
        <a class="btn btn-primary btn-sm" [routerLink]="['/courses', offer().course.slug]" [queryParams]="offer().couponCode ? { coupon: offer().couponCode } : null">{{ 'student.viewCourse' | t }}</a>
      }
    </section>
  `,
  styles: [`
    :host { display: block; }
    .next-card {
      display: flex;
      align-items: center;
      gap: var(--spacing-md);
      padding: var(--spacing-md);
      background: var(--color-primary-soft);
      border: 1px solid var(--color-primary-light);
      border-radius: var(--radius-lg);
    }
    .next-card__icon { flex: none; color: var(--color-primary); }
    .next-card__body { flex: 1; min-width: 0; }
    .next-card__meta { font-size: 0.875rem; color: var(--color-text-light); }
    @media (max-width: 575px) { .next-card { flex-wrap: wrap; } .next-card .btn { width: 100%; } }
  `]
})
export class NextCourseCardComponent {
  readonly i18n = inject(I18nService);
  offer = input.required<NextCourseOffer>();
  /** Id del curso para ir directo al reproductor (si el padre lo conoce); si no, se va a su página. */
  courseId = input<number | null>(null);
  price = computed(() => {
    const c = this.offer().course;
    return c.price > 0 ? this.i18n.formatMoney(c.price, c.currency) : this.i18n.t('student.free');
  });
}
