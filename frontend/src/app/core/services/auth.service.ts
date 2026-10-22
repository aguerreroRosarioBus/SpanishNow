import { Injectable, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { Observable, catchError, map, of, tap } from 'rxjs';
import { ImpersonateResponse } from '../models/admin.model';
import { User, AuthResponse, LoginRequest, RegisterRequest, ResetPasswordRequest } from '../models/user.model';
import { environment } from '../../../environments/environment';

const ADMIN_SESSION_KEY = 'adminSession';

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private apiUrl = `${environment.apiUrl}/auth`;
  currentUser = signal<User | null>(null);
  /** true mientras el administrador está dentro de una cuenta de prueba («Entrar como»). */
  impersonating = signal(false);

  constructor(private http: HttpClient, private router: Router) {
    this.loadUserFromStorage();
    this.impersonating.set(!!this.readAdminSession() && !!this.currentUser()?.impersonatedBy);
  }

  register(data: RegisterRequest): Observable<AuthResponse> {
    return this.http.post<AuthResponse>(`${this.apiUrl}/register`, data).pipe(
      tap(response => this.handleAuthSuccess(response))
    );
  }

  login(data: LoginRequest): Observable<AuthResponse> {
    return this.http.post<AuthResponse>(`${this.apiUrl}/login`, data).pipe(
      tap(response => this.handleAuthSuccess(response))
    );
  }

  forgotPassword(email: string): Observable<unknown> {
    return this.http.post(`${this.apiUrl}/forgot-password`, { email });
  }

  /** Cambia la contraseña con el token del email y deja la sesión iniciada. */
  resetPassword(data: ResetPasswordRequest): Observable<AuthResponse> {
    return this.http.post<AuthResponse>(`${this.apiUrl}/reset-password`, data).pipe(
      tap(response => this.handleAuthSuccess(response))
    );
  }

  logout(): void {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    localStorage.removeItem(ADMIN_SESSION_KEY);
    this.impersonating.set(false);
    this.currentUser.set(null);
  }

  hasPermission(key: string): boolean {
    return !!this.currentUser()?.permissions?.includes(key);
  }

  /** true si la cuenta tiene al menos un permiso de administración. */
  isAdmin(): boolean {
    return (this.currentUser()?.permissions?.length ?? 0) > 0;
  }

  /** Vuelve a pedir el usuario (permisos vigentes). Con 401 cierra la sesión. */
  refreshMe(): void {
    this.loadMe().subscribe();
  }

  /** Pide el usuario actual y lo guarda; emite null si no hay sesión o falló. */
  loadMe(): Observable<User | null> {
    if (!this.isAuthenticated()) return of(null);
    return this.http.get<{ user: User }>(`${this.apiUrl}/me`).pipe(
      map(({ user }) => {
        localStorage.setItem('user', JSON.stringify(user));
        this.currentUser.set(user);
        return user;
      }),
      catchError(err => {
        if (err?.status === 401) {
          this.logout();
          void this.router.navigate(['/auth/login']);
        }
        return of(null);
      })
    );
  }

  /** Entra a una cuenta de prueba guardando la sesión del administrador para poder volver. */
  impersonate(userId: number): Observable<ImpersonateResponse> {
    return this.http.post<ImpersonateResponse>(`${environment.apiUrl}/admin/users/${userId}/impersonate`, {}).pipe(
      tap(response => {
        const token = this.getToken();
        const user = this.currentUser();
        // Si ya se está dentro de una cuenta de prueba no se pisa la sesión original del admin
        if (token && user && !this.readAdminSession()) {
          localStorage.setItem(ADMIN_SESSION_KEY, JSON.stringify({ token, user }));
        }
        this.handleAuthSuccess({ ...response, user: { ...response.user, impersonatedBy: response.user.impersonatedBy ?? user?.id } });
        this.impersonating.set(true);
        void this.router.navigate([response.user.role === 'teacher' ? '/teacher/dashboard' : '/student/dashboard']);
      })
    );
  }

  /** Sale de la cuenta de prueba y restaura la sesión del administrador. */
  stopImpersonating(): void {
    const session = this.readAdminSession();
    localStorage.removeItem(ADMIN_SESSION_KEY);
    this.impersonating.set(false);
    if (!session) { this.logout(); void this.router.navigate(['/auth/login']); return; }
    this.handleAuthSuccess(session);
    void this.router.navigate(['/admin/users']);
    this.refreshMe();
  }

  private readAdminSession(): AuthResponse | null {
    try {
      const raw = localStorage.getItem(ADMIN_SESSION_KEY);
      const parsed = raw ? JSON.parse(raw) : null;
      return parsed?.token && parsed?.user ? parsed : null;
    } catch {
      return null;
    }
  }

  getToken(): string | null {
    return localStorage.getItem('token');
  }

  isAuthenticated(): boolean {
    return !!this.getToken();
  }

  isTeacher(): boolean {
    return this.currentUser()?.role === 'teacher';
  }

  isStudent(): boolean {
    return this.currentUser()?.role === 'student';
  }

  private handleAuthSuccess(response: AuthResponse): void {
    localStorage.setItem('token', response.token);
    localStorage.setItem('user', JSON.stringify(response.user));
    this.currentUser.set(response.user);
  }

  private loadUserFromStorage(): void {
    const userJson = localStorage.getItem('user');
    if (userJson) {
      try {
        const user = JSON.parse(userJson);
        this.currentUser.set(user);
      } catch (e) {
        console.error('Error loading user from storage', e);
      }
    }
  }
}
