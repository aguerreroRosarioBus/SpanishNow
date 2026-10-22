export interface User {
  id: number;
  name: string;
  email: string;
  role: 'teacher' | 'student';
  /** Permisos de administración efectivos (vacío o ausente = sin permisos). */
  permissions?: string[];
  isTestAccount?: boolean;
  /** Id del administrador cuando la sesión es un «Entrar como». */
  impersonatedBy?: number;
}

export interface AuthResponse {
  user: User;
  token: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface RegisterRequest {
  name: string;
  email: string;
  password: string;
}

export interface ResetPasswordRequest {
  token: string;
  password: string;
}
