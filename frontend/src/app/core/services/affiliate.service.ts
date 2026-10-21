import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, map } from 'rxjs';
import {
  Affiliate, AffiliateDashboard, AffiliateInput, AffiliateOrder, AffiliatePayout, AffiliatePayoutInput
} from '../models/community.model';
import { environment } from '../../../environments/environment';

/** Afiliados: gestión del docente y panel público del afiliado (por token). */
@Injectable({ providedIn: 'root' })
export class AffiliateService {
  private http = inject(HttpClient);
  private teacherUrl = `${environment.apiUrl}/teacher/affiliates`;

  list(): Observable<Affiliate[]> { return this.http.get<Affiliate[]>(this.teacherUrl); }
  create(input: AffiliateInput): Observable<Affiliate> { return this.http.post<Affiliate>(this.teacherUrl, input); }
  update(id: number, input: Partial<AffiliateInput>): Observable<Affiliate> { return this.http.put<Affiliate>(`${this.teacherUrl}/${id}`, input); }
  /** Solo sin ventas; con ventas el servidor responde 409 y lo desactiva. */
  remove(id: number): Observable<void> { return this.http.delete<void>(`${this.teacherUrl}/${id}`); }
  regenerateToken(id: number): Observable<{ dashboardToken: string }> {
    return this.http.post<{ dashboardToken: string }>(`${this.teacherUrl}/${id}/regenerate-token`, {});
  }

  /** El contrato dice «misma forma que /teacher/orders» ({ rows, total }); se acepta también un arreglo. */
  orders(id: number): Observable<AffiliateOrder[]> {
    return this.http.get<AffiliateOrder[] | { rows: AffiliateOrder[] }>(`${this.teacherUrl}/${id}/orders`)
      .pipe(map(r => Array.isArray(r) ? r : (r?.rows ?? [])));
  }

  payouts(id: number): Observable<AffiliatePayout[]> { return this.http.get<AffiliatePayout[]>(`${this.teacherUrl}/${id}/payouts`); }
  addPayout(id: number, input: AffiliatePayoutInput): Observable<AffiliatePayout> {
    return this.http.post<AffiliatePayout>(`${this.teacherUrl}/${id}/payouts`, input);
  }
  removePayout(id: number, payoutId: number): Observable<void> { return this.http.delete<void>(`${this.teacherUrl}/${id}/payouts/${payoutId}`); }

  /** Público: ¿el código existe y está activo? (para no guardar códigos inválidos). */
  validateCode(code: string): Observable<{ valid: boolean }> {
    return this.http.get<{ valid: boolean }>(`${environment.apiUrl}/public/affiliates/${encodeURIComponent(code)}`);
  }

  dashboard(token: string): Observable<AffiliateDashboard> {
    return this.http.get<AffiliateDashboard>(`${environment.apiUrl}/public/affiliate-dashboard/${encodeURIComponent(token)}`);
  }
}
