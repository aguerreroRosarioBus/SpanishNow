import { I18nService } from '../../../core/i18n/i18n.service';
import { TranslatePipe } from '../../../core/i18n/translate.pipe';
import { TranslationParams } from '../../../core/i18n/i18n.types';
import { ADMIN_EN } from '../../../core/i18n/catalogs/admin';
import { UserPreferencesService } from '../../../core/services/user-preferences.service';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Subject, debounceTime, distinctUntilChanged } from 'rxjs';
import { AdminService } from '../../../core/services/admin.service';
import { AuthService } from '../../../core/services/auth.service';
import { CourseService } from '../../../core/services/course.service';
import { ToastService } from '../../../core/services/toast.service';
import { AdminUser, AdminUserPatch, CreatedTestUser, PermissionInfo } from '../../../core/models/admin.model';
import { Course } from '../../../core/models/course.model';
import { IconComponent } from '../../../shared/components/icon/icon.component';
import { ConfirmDialogComponent } from '../../../shared/components/confirm-dialog/confirm-dialog.component';
import { copyText } from '../../../shared/utils/clipboard';

const PAGE_SIZE = 25;

interface PendingAction {
  params?: TranslationParams;
  title: string;
  message: string;
  confirmText: string;
  type: 'danger' | 'warning';
  run: () => void;
}

/** Administración: usuarios, roles, permisos, suspensión y cuentas de prueba. */
@Component({
  selector: 'app-admin-users',
  standalone: true,
  imports: [TranslatePipe, IconComponent, ConfirmDialogComponent],
  templateUrl: './admin-users.component.html',
  styleUrl: './admin-users.component.scss'
})
export class AdminUsersComponent implements OnInit {
  private i18n = inject(I18nService);
  private preferences = inject(UserPreferencesService);
  private admin = inject(AdminService);
  private auth = inject(AuthService);
  private courseService = inject(CourseService);
  private toast = inject(ToastService);

  me = this.auth.currentUser;
  /** Puede ver/editar usuarios reales, roles y permisos. */
  canManage = computed(() => this.auth.hasPermission('users.manage') && !!this.me());
  /** Puede crear, borrar y entrar a cuentas de prueba. */
  canTest = computed(() => this.auth.hasPermission('test_users.manage') && !!this.me());

  permissions = signal<PermissionInfo[]>([]);
  users = signal<AdminUser[]>([]);
  total = signal(0);
  page = signal(1);
  isLoading = signal(true);
  private loadFailure = signal<unknown>(null);
  errorMessage = computed(() => this.loadFailure() ? this.i18n.errorMessage(this.loadFailure(), 'adminUsers.usersError') : '');
  /** Ids con un cambio en curso (deshabilita los controles de esa fila). */
  busy = signal<Set<number>>(new Set());

  // Filtros
  search = signal('');
  roleFilter = signal<'' | 'teacher' | 'student'>('');
  kindFilter = signal<'' | 'real' | 'test'>('');
  statusFilter = signal<'' | 'active' | 'suspended'>('');
  private search$ = new Subject<string>();

  totalPages = computed(() => Math.max(1, Math.ceil(this.total() / PAGE_SIZE)));

  // Cuentas de prueba
  courses = signal<Course[]>([]);
  testRole = signal<'teacher' | 'student'>('student');
  testName = signal('');
  testCourseId = signal<number | null>(null);
  testCount = signal(1);
  isCreating = signal(false);
  created = signal<CreatedTestUser[]>([]);

  pending = signal<PendingAction | null>(null);

  constructor() {
    this.search$.pipe(debounceTime(300), distinctUntilChanged(), takeUntilDestroyed()).subscribe(value => {
      this.search.set(value);
      this.page.set(1);
      this.load();
    });
  }

  ngOnInit(): void {
    this.admin.permissions().subscribe({ next: list => this.permissions.set(list), error: err => this.fail(err, 'adminUsers.permissionsError') });
    if (this.canTest() && this.me()?.role === 'teacher') {
      this.courseService.getCourses().subscribe({ next: list => this.courses.set(list), error: () => { /* el curso es opcional */ } });
    }
    this.load();
  }

  load(): void {
    this.isLoading.set(true);
    this.loadFailure.set(null);
    this.admin.users({
      search: this.search().trim(),
      role: this.roleFilter(),
      // Quien solo gestiona cuentas de prueba solo ve esas
      kind: this.canManage() ? this.kindFilter() : 'test',
      status: this.statusFilter(),
      page: this.page(),
      pageSize: PAGE_SIZE
    }).subscribe({
      next: res => { this.users.set(res.users); this.total.set(res.total); this.isLoading.set(false); },
      error: err => { this.loadFailure.set(err); this.isLoading.set(false); }
    });
  }

  // ===== Filtros y paginación =====

  onSearch(value: string): void { this.search$.next(value); }
  setRole(value: string): void { this.roleFilter.set(value as '' | 'teacher' | 'student'); this.applyFilters(); }
  setKind(value: string): void { this.kindFilter.set(value as '' | 'real' | 'test'); this.applyFilters(); }
  setStatus(value: string): void { this.statusFilter.set(value as '' | 'active' | 'suspended'); this.applyFilters(); }
  private applyFilters(): void { this.page.set(1); this.load(); }

  goTo(page: number): void {
    if (page < 1 || page > this.totalPages() || page === this.page()) return;
    this.page.set(page);
    this.load();
  }

  // ===== Presentación =====

  roleLabel(role: string): string { return this.i18n.t(role === 'teacher' ? 'adminUsers.teacher' : 'adminUsers.student'); }

  date(value: string): string { return this.i18n.formatInstant(value, this.preferences.preferences()?.timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC', {dateStyle: 'medium'}); }
  number(value: number): string { return this.i18n.formatNumber(value); }
  permissionText(p: PermissionInfo, field: 'label' | 'description'): string {
    const key = `adminUsers.permission.${p.key}.${field}`;
    return Object.hasOwn(ADMIN_EN, key) ? this.i18n.t(key) : p[field] + (this.i18n.locale() === 'en' ? ' [ES]' : '');
  }

  /** Los permisos de una fila se pueden editar. */
  canEditPermissions(u: AdminUser): boolean { return this.canManage() && !u.fixedAdmin && !u.isTestAccount; }

  permissionDisabled(u: AdminUser, key: string): boolean {
    return !this.canEditPermissions(u) || this.busy().has(u.id) || (u.id === this.me()?.id && key === 'users.manage');
  }

  hasPermission(u: AdminUser, key: string): boolean { return u.fixedAdmin || u.permissions.includes(key); }

  canSuspend(u: AdminUser): boolean { return this.canManage() && !u.fixedAdmin && u.id !== this.me()?.id; }

  // ===== Cambios de usuario =====

  changeRole(u: AdminUser, role: string): void {
    if (role === u.role) return;
    this.patch(u, { role: role as 'teacher' | 'student' }, 'adminUsers.roleUpdated');
  }

  togglePermission(u: AdminUser, key: string, checked: boolean): void {
    const next = checked ? [...new Set([...u.permissions, key])] : u.permissions.filter(p => p !== key);
    this.patch(u, { permissions: next }, 'adminUsers.permissionsUpdated');
  }

  askSuspend(u: AdminUser): void {
    if (u.suspendedAt) { this.patch(u, { suspended: false }, 'adminUsers.reactivated'); return; }
    this.pending.set({
      title: 'adminUsers.suspendTitle',
      message: 'adminUsers.suspendMessage', params: {name: u.name, email: u.email},
      confirmText: 'adminUsers.suspend', type: 'warning',
      run: () => this.patch(u, { suspended: true }, 'adminUsers.suspendedToast')
    });
  }

  private patch(u: AdminUser, body: AdminUserPatch, okMessage: string): void {
    this.setBusy(u.id, true);
    this.admin.updateUser(u.id, body).subscribe({
      next: updated => {
        this.users.update(list => list.map(x => (x.id === updated.id ? { ...x, ...updated } : x)));
        this.setBusy(u.id, false);
        this.toast.success(this.i18n.t(okMessage));
        // Cambió mis propios permisos: se refrescan para que el menú los refleje
        if (u.id === this.me()?.id) this.auth.refreshMe();
      },
      error: err => {
        this.setBusy(u.id, false);
        this.fail(err, 'adminUsers.saveError');
        this.load(); // vuelve a mostrar el estado real
      }
    });
  }

  private setBusy(id: number, on: boolean): void {
    this.busy.update(set => { const next = new Set(set); if (on) next.add(id); else next.delete(id); return next; });
  }

  // ===== Cuentas de prueba =====

  setTestRole(value: string): void {
    this.testRole.set(value as 'teacher' | 'student');
    if (value !== 'student') this.testCourseId.set(null);
  }

  setTestCount(value: string): void {
    const n = Math.round(Number(value));
    this.testCount.set(Number.isFinite(n) ? Math.min(10, Math.max(1, n)) : 1);
  }

  setTestCourse(value: string): void { this.testCourseId.set(value ? Number(value) : null); }

  createTestUsers(): void {
    if (this.isCreating()) return;
    this.isCreating.set(true);
    const name = this.testName().trim();
    this.admin.createTestUsers({
      role: this.testRole(),
      ...(name ? { name } : {}),
      ...(this.testRole() === 'student' && this.testCourseId() ? { courseId: this.testCourseId()! } : {}),
      count: this.testCount()
    }).subscribe({
      next: list => {
        this.created.set(list);
        this.isCreating.set(false);
        this.toast.success(this.i18n.t('adminUsers.createdCount', {count: list.length}));
        this.load();
      },
      error: err => { this.isCreating.set(false); this.fail(err, 'adminUsers.createError'); }
    });
  }

  async copy(text: string, what: string): Promise<void> {
    if (await copyText(text)) this.toast.success(this.i18n.t(what));
    else this.toast.warning(this.i18n.t('adminUsers.copyError'));
  }

  enter(id: number): void {
    this.auth.impersonate(id).subscribe({ error: err => this.fail(err, 'adminUsers.enterError') });
  }

  askDelete(u: AdminUser): void {
    this.pending.set({
      title: 'adminUsers.deleteTitle',
      message: 'adminUsers.deleteMessage', params: {email: u.email},
      confirmText: 'adminUsers.delete', type: 'danger',
      run: () => this.admin.deleteTestUser(u.id).subscribe({
        next: () => {
          this.created.update(list => list.filter(c => c.user.id !== u.id));
          this.toast.success(this.i18n.t('adminUsers.deleted'));
          this.load();
        },
        error: err => this.fail(err, 'adminUsers.deleteError')
      })
    });
  }

  askDeleteAll(): void {
    this.pending.set({
      title: 'adminUsers.deleteAll',
      message: 'adminUsers.deleteAllMessage',
      confirmText: 'adminUsers.deleteAllConfirm', type: 'danger',
      run: () => this.admin.deleteAllTestUsers().subscribe({
        next: res => {
          this.created.set([]);
          this.toast.success(this.i18n.t('adminUsers.deletedCount', {count: res.deleted}));
          this.load();
        },
        error: err => this.fail(err, 'adminUsers.deleteAllError')
      })
    });
  }

  confirmPending(): void {
    const action = this.pending();
    this.pending.set(null);
    action?.run();
  }

  // ===== Errores =====

  private message(err: { error?: { error?: string } } | null, fallback: string): string {
    return this.i18n.errorMessage(err, fallback);
  }

  private fail(err: { error?: { error?: string } } | null, fallback: string): void {
    this.toast.error(this.message(err, fallback));
  }
}
