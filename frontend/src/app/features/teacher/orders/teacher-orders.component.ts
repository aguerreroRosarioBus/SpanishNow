import { UserPreferencesService } from '../../../core/services/user-preferences.service';
import { I18nService } from '../../../core/i18n/i18n.service';
import { TranslatePipe } from '../../../core/i18n/translate.pipe';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CourseService } from '../../../core/services/course.service';
import { SalesService, saveBlob } from '../../../core/services/sales.service';
import { ToastService } from '../../../core/services/toast.service';
import { Course } from '../../../core/models/course.model';
import { OrderFilters, TeacherOrder } from '../../../core/models/sales.model';
import { IconComponent } from '../../../shared/components/icon/icon.component';
import { OrderBadge, orderBadge } from '../../../shared/utils/order-status';

const PAGE_SIZE = 20;

/** Órdenes del docente: filtros, paginación, reembolso manual y exportación a CSV. */
@Component({
  selector: 'app-teacher-orders',
  standalone: true,
  imports: [TranslatePipe,  FormsModule, IconComponent],
  templateUrl: './teacher-orders.component.html',
  styleUrl: './teacher-orders.component.scss'
})
export class TeacherOrdersComponent implements OnInit {
  i18n = inject(I18nService);
  number(value: number): string { return this.i18n.formatNumber(value); }
  private preferences = inject(UserPreferencesService);
  date(value: string): string { return this.i18n.formatInstant(value, this.preferences.preferences()?.timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC', {dateStyle: 'medium'}); }
  private service = inject(SalesService);
  private courseService = inject(CourseService);
  private toast = inject(ToastService);

  readonly statuses = [
    { value: '', label: 'teacherCommerce.allStatuses' },
    { value: 'paid', label: 'teacherCommerce.paid' },
    { value: 'refunded', label: 'teacherCommerce.refunded' }
  ];

  courses = signal<Course[]>([]);
  rows = signal<TeacherOrder[]>([]);
  total = signal(0);
  page = signal(1);
  status = signal('');
  courseId = signal<number | null>(null);
  query = signal('');
  isLoading = signal(true);
  private errorMessageFailure = signal<{key: string; error?: unknown} | null>(null);
  errorMessage = computed(() => { const f = this.errorMessageFailure(); return f ? this.i18n.errorMessage(f.error, f.key) : ''; });
  isExporting = signal(false);

  pageCount = computed(() => Math.max(1, Math.ceil(this.total() / PAGE_SIZE)));

  // Reembolso manual
  refundTarget = signal<TeacherOrder | null>(null);
  revokeAccess = signal(true);
  isRefunding = signal(false);
  private refundErrorFailure = signal<{key: string; error?: unknown} | null>(null);
  refundError = computed(() => { const f = this.refundErrorFailure(); return f ? this.i18n.errorMessage(f.error, f.key) : ''; });

  ngOnInit(): void {
    this.courseService.getCourses().subscribe({ next: list => this.courses.set(list), error: () => { /* el filtro por curso queda vacío */ } });
    this.load();
  }

  private filters(): OrderFilters {
    return { status: this.status(), courseId: this.courseId(), q: this.query(), page: this.page(), pageSize: PAGE_SIZE };
  }

  load(): void {
    this.isLoading.set(true);
    this.errorMessageFailure.set(null);
    this.service.orders(this.filters()).subscribe({
      next: ({ rows, total }) => {
        this.rows.set(rows);
        this.total.set(total);
        this.isLoading.set(false);
      },
      error: error => { this.errorMessageFailure.set({key: 'teacherCommerce.ordersError', error}); this.isLoading.set(false); }
    });
  }

  applyFilters(): void {
    this.page.set(1);
    this.load();
  }

  goTo(page: number): void {
    if (page < 1 || page > this.pageCount() || page === this.page()) return;
    this.page.set(page);
    this.load();
  }

  exportCsv(): void {
    if (this.isExporting()) return;
    this.isExporting.set(true);
    this.service.exportCsv(this.filters()).subscribe({
      next: blob => {
        saveBlob(blob, `ordenes-${new Date().toISOString().slice(0, 10)}.csv`);
        this.isExporting.set(false);
      },
      error: () => { this.toast.error(this.i18n.t('teacherCommerce.exportError')); this.isExporting.set(false); }
    });
  }

  providerLabel(provider: string): string {
    return ({ hotmart: 'Hotmart', stripe: 'Stripe', coupon: this.i18n.t('teacherCommerce.coupon'), fake: this.i18n.t('teacherCommerce.testProvider') } as Record<string, string>)[provider] ?? provider;
  }
  money(cents: number, currency: string): string { return this.i18n.formatMoney(cents, currency); }
  badge(o: TeacherOrder): OrderBadge { return orderBadge(o.status, o.refundedAmount); }
  badgeLabel(o: TeacherOrder): string { return this.i18n.t('teacherCommerce.' + this.badge(o)); }
  canRefund(o: TeacherOrder): boolean { return o.status === 'paid'; }

  askRefund(order: TeacherOrder): void {
    this.refundErrorFailure.set(null);
    this.revokeAccess.set(true);
    this.refundTarget.set(order);
  }

  cancelRefund(): void { if (!this.isRefunding()) this.refundTarget.set(null); }

  confirmRefund(): void {
    const order = this.refundTarget();
    if (!order || this.isRefunding()) return;
    this.isRefunding.set(true);
    this.refundErrorFailure.set(null);
    this.service.refund(order.id, this.revokeAccess()).subscribe({
      next: () => {
        this.isRefunding.set(false);
        this.refundTarget.set(null);
        this.toast.success(this.i18n.t('teacherCommerce.markedRefund'));
        this.load();
      },
      error: error => {
        this.isRefunding.set(false);
        this.refundErrorFailure.set({key: 'teacherCommerce.refundError', error});
      }
    });
  }
}
