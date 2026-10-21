import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { MyOrder, OrderFilters, OrdersPage, SalesSummary } from '../models/sales.model';
import { environment } from '../../../environments/environment';

/** Ventas del docente (resumen, órdenes, reembolso manual, CSV) y compras del alumno. */
@Injectable({ providedIn: 'root' })
export class SalesService {
  private http = inject(HttpClient);
  private apiUrl = environment.apiUrl;

  summary(from?: string, to?: string): Observable<SalesSummary> {
    let params = new HttpParams();
    if (from) params = params.set('from', from);
    if (to) params = params.set('to', to);
    return this.http.get<SalesSummary>(`${this.apiUrl}/teacher/sales/summary`, { params });
  }

  orders(filters: OrderFilters): Observable<OrdersPage> {
    return this.http.get<OrdersPage>(`${this.apiUrl}/teacher/orders`, { params: this.params(filters) });
  }

  /** CSV con los mismos filtros. Se pide con HttpClient (lleva el token) y se guarda como archivo. */
  exportCsv(filters: OrderFilters): Observable<Blob> {
    const { page: _page, pageSize: _pageSize, ...rest } = filters;
    return this.http.get(`${this.apiUrl}/teacher/orders/export.csv`, { params: this.params(rest), responseType: 'blob' });
  }

  /** Reembolso total manual. `manual: true` es la confirmación explícita que pide el servidor para órdenes de Stripe. */
  refund(orderId: number, revokeAccess: boolean): Observable<unknown> {
    return this.http.post(`${this.apiUrl}/teacher/orders/${orderId}/refund`, { revokeAccess, manual: true });
  }

  myOrders(): Observable<MyOrder[]> {
    return this.http.get<MyOrder[]>(`${this.apiUrl}/me/orders`);
  }

  private params(filters: OrderFilters): HttpParams {
    let params = new HttpParams();
    if (filters.status) params = params.set('status', filters.status);
    if (filters.courseId) params = params.set('courseId', String(filters.courseId));
    if (filters.q?.trim()) params = params.set('q', filters.q.trim());
    if (filters.page) params = params.set('page', String(filters.page));
    if (filters.pageSize) params = params.set('pageSize', String(filters.pageSize));
    return params;
  }
}

/** Dispara la descarga de un Blob como archivo. */
export function saveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
