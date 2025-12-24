export interface User {
  id: number;
  name: string;
  email: string;
  role: 'teacher' | 'student';
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
  role: 'teacher' | 'student';
}
