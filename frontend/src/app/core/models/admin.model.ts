import { User } from './user.model';

export interface PermissionInfo {
  key: string;
  label: string;
  description: string;
}

export interface AdminUser {
  id: number;
  name: string;
  email: string;
  role: 'teacher' | 'student';
  permissions: string[];
  /** Administrador de arranque (ADMIN_EMAILS): permisos fijos, no se suspende. */
  fixedAdmin: boolean;
  isTestAccount: boolean;
  suspendedAt: string | null;
  createdAt: string;
  enrollmentsCount: number;
  coursesCount: number;
}

export interface AdminUsersQuery {
  search?: string;
  role?: '' | 'teacher' | 'student';
  kind?: '' | 'real' | 'test';
  status?: '' | 'active' | 'suspended';
  page?: number;
  pageSize?: number;
}

export interface AdminUsersPage {
  users: AdminUser[];
  total: number;
  page: number;
  pageSize: number;
}

export interface AdminUserPatch {
  role?: 'teacher' | 'student';
  permissions?: string[];
  suspended?: boolean;
}

export interface CreateTestUsersInput {
  role: 'teacher' | 'student';
  name?: string;
  courseId?: number;
  count?: number;
}

export interface CreatedTestUser {
  user: AdminUser;
  password: string;
}

export interface ImpersonateResponse {
  user: User;
  token: string;
}
