import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { Coupon, CouponInput } from '../models/sales.model';
import { environment } from '../../../environments/environment';

/** Cupones del docente. */
@Injectable({ providedIn: 'root' })
export class CouponService {
  private http = inject(HttpClient);
  private apiUrl = `${environment.apiUrl}/teacher/coupons`;

  list(): Observable<Coupon[]> { return this.http.get<Coupon[]>(this.apiUrl); }
  create(input: CouponInput): Observable<Coupon> { return this.http.post<Coupon>(this.apiUrl, input); }
  /** Con usos (`redemptions > 0`) el servidor solo acepta active, expiresAt y maxRedemptions. */
  update(id: number, input: Partial<CouponInput>): Observable<Coupon> { return this.http.put<Coupon>(`${this.apiUrl}/${id}`, input); }
  remove(id: number): Observable<void> { return this.http.delete<void>(`${this.apiUrl}/${id}`); }
}
