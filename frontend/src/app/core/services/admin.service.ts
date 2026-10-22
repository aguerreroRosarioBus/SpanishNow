import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import {
  AdminUser, AdminUserPatch, AdminUsersPage, AdminUsersQuery, CreatedTestUser,
  CreateTestUsersInput, PermissionInfo
} from '../models/admin.model';
import { environment } from '../../../environments/environment';

/** Panel de administración: usuarios, permisos y cuentas de prueba. */
@Injectable({ providedIn: 'root' })
export class AdminService {
  private http = inject(HttpClient);
  private apiUrl = `${environment.apiUrl}/admin`;

  permissions(): Observable<PermissionInfo[]> { return this.http.get<PermissionInfo[]>(`${this.apiUrl}/permissions`); }

  users(query: AdminUsersQuery): Observable<AdminUsersPage> {
    let params = new HttpParams();
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== null && value !== '') params = params.set(key, String(value));
    }
    return this.http.get<AdminUsersPage>(`${this.apiUrl}/users`, { params });
  }

  updateUser(id: number, patch: AdminUserPatch): Observable<AdminUser> {
    return this.http.patch<AdminUser>(`${this.apiUrl}/users/${id}`, patch);
  }

  createTestUsers(input: CreateTestUsersInput): Observable<CreatedTestUser[]> {
    return this.http.post<CreatedTestUser[]>(`${this.apiUrl}/test-users`, input);
  }

  deleteTestUser(id: number): Observable<void> { return this.http.delete<void>(`${this.apiUrl}/test-users/${id}`); }
  deleteAllTestUsers(): Observable<{ deleted: number }> { return this.http.delete<{ deleted: number }>(`${this.apiUrl}/test-users`); }
}
