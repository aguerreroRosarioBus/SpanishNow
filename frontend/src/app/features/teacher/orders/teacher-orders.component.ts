import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { CourseService } from '../../../core/services/course.service';
import { SalesService, saveBlob } from '../../../core/services/sales.service';
import { ToastService } from '../../../core/services/toast.service';
import { Course } from '../../../core/models/course.model';
import { OrderFilters, TeacherOrder } from '../../../core/models/sales.model';
import { IconComponent } from '../../../shared/components/icon/icon.component';
import { formatPrice } from '../../../shared/utils/money';
import { OrderBadge, orderBadge, orderBadgeLabel } from '../../../shared/utils/order-status';

const PAGE_SIZE = 20;

/** Órdenes del docente: filtros, paginación, reembolso manual y exportación a CSV. */
@Component({
  selector: 'app-teacher-orders',
  standalone: true,
  imports: [DatePipe, FormsModule, IconComponent],
  templateUrl: './teacher-orders.component.html',
  styleUrl: './teacher-orders.component.scss'
})
export class TeacherOrdersComponent implements OnInit {
  private service = inject(SalesService);
  private courseService = inject(CourseService);
  private toast = inject(ToastService);

  readonly statuses = [
    { value: '', label: 'Todos los estados' },
    { value: 'paid', label: 'Pagada' },
    { value: 'refunded', label: 'Reembolsada' }
  ];

  courses = signal<Course[]>([]);
  rows = signal<TeacherOrder[]>([]);
  total = signal(0);
  page = signal(1);
  status = signal('');
  courseId = signal<number | null>(null);
  query = signal('');
  isLoading = signal(true);
  errorMessage = signal('');
  isExporting = signal(false);

  pageCount = computed(() => Math.max(1, Math.ceil(this.total() / PAGE_SIZE)));

  // Reembolso manual
  refundTarget = signal<TeacherOrder | null>(null);
  revokeAccess = signal(true);
  isRefunding = signal(false);
  refundError = signal('');

  ngOnInit(): void {
    this.courseService.getCourses().subscribe({ next: list => this.courses.set(list), error: () => { /* el filtro por curso queda vacío */ } });
    this.load();
  }

  private filters(): OrderFilters {
    return { status: this.status(), courseId: this.courseId(), q: this.query(), page: this.page(), pageSize: PAGE_SIZE };
  }

  load(): void {
    this.isLoading.set(true);
    this.errorMessage.set('');
    this.service.orders(this.filters()).subscribe({
      next: ({ rows, total }) => {
        this.rows.set(rows);
        this.total.set(total);
        this.isLoading.set(false);
      },
      error: () => { this.errorMessage.set('No se pudieron cargar las órdenes.'); this.isLoading.set(false); }
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
      error: () => { this.toast.error('No se pudo exportar el CSV'); this.isExporting.set(false); }
    });
  }

  providerLabel(provider: string): string {
    return ({ hotmart: 'Hotmart', stripe: 'Stripe', coupon: 'Cupón', fake: 'Prueba' } as Record<string, string>)[provider] ?? provider;
  }
  money(cents: number, currency: string): string { return formatPrice(cents, currency, 'es'); }
  badge(o: TeacherOrder): OrderBadge { return orderBadge(o.status, o.refundedAmount); }
  badgeLabel(o: TeacherOrder): string { return orderBadgeLabel(o.status, o.refundedAmount); }
  canRefund(o: TeacherOrder): boolean { return o.status === 'paid'; }

  askRefund(order: TeacherOrder): void {
    this.refundError.set('');
    this.revokeAccess.set(true);
    this.refundTarget.set(order);
  }

  cancelRefund(): void { if (!this.isRefunding()) this.refundTarget.set(null); }

  confirmRefund(): void {
    const order = this.refundTarget();
    if (!order || this.isRefunding()) return;
    this.isRefunding.set(true);
    this.refundError.set('');
    this.service.refund(order.id, this.revokeAccess()).subscribe({
      next: () => {
        this.isRefunding.set(false);
        this.refundTarget.set(null);
        this.toast.success('Orden marcada como reembolsada');
        this.load();
      },
      error: error => {
        this.isRefunding.set(false);
        this.refundError.set(error?.error?.error || 'No se pudo marcar la orden como reembolsada.');
      }
    });
  }
}
