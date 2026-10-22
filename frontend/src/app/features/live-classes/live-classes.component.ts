import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { AuthService } from '../../core/services/auth.service';
import { CourseService } from '../../core/services/course.service';
import { LiveClassService } from '../../core/services/live-class.service';
import { GoogleStatus, LiveClass } from '../../core/models/live-class.model';
import { Course } from '../../core/models/course.model';
import { IconComponent } from '../../shared/components/icon/icon.component';

export const liveStatusLabel = (status: string) => ({ draft: 'Preparando', live: 'En vivo', ended: 'Finalizada' }[status] || status);
export const liveErrorMessage = (e: any, fallback = 'No se pudo completar la operación. Intenta nuevamente.'): string => e?.error?.error || fallback;
export function invitationCode(value: string): string {
  const trimmed = value.trim();
  if (/^[\w-]{16}$/.test(trimmed)) return trimmed;
  try { return new URL(trimmed).pathname.match(/^\/live\/join\/([\w-]{16})\/?$/)?.[1] || ''; } catch { return ''; }
}
@Component({
  selector: 'app-live-classes', standalone: true, imports: [FormsModule, RouterLink, DatePipe, IconComponent],
  templateUrl: './live-classes.component.html', styleUrl: './live-classes.component.scss'
})
export class LiveClassesComponent implements OnInit {
  private api = inject(LiveClassService);
  private coursesApi = inject(CourseService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  readonly teacher = inject(AuthService).isTeacher();
  classes = signal<LiveClass[]>([]);
  courses = signal<Course[]>([]);
  google = signal<GoogleStatus | null>(null);
  loading = signal(true);
  busy = signal(false);
  error = signal('');
  info = signal('');
  showCreate = signal(false);
  title = '';
  courseId: number | null = null;
  code = '';
  filter = signal('all');
  filtered = computed(() => this.classes().filter(c => this.filter() === 'all' || c.status === this.filter()));
  readonly statusLabel = liveStatusLabel;
  ngOnInit(): void {
    const google = this.route.snapshot.queryParamMap.get('google');
    if (google === 'connected') this.info.set('Tu cuenta de Google quedó conectada.');
    if (google === 'error') this.error.set('No se pudo conectar Google. Revisa que hayas autorizado todos los permisos y vuelve a intentar.');
    if (google) void this.router.navigate([], { replaceUrl: true, queryParams: { google: null }, queryParamsHandling: 'merge' });
    void this.load();
    if (this.teacher) {
      this.coursesApi.getCourses().subscribe({ next: courses => this.courses.set(courses), error: () => this.info.set('No se pudieron cargar tus cursos. Puedes crear una sala independiente.') });
      this.api.googleStatus().subscribe({ next: status => this.google.set(status), error: e => this.error.set(liveErrorMessage(e)) });
    }
  }
  async load(): Promise<void> {
    this.loading.set(true);
    try { this.classes.set(await firstValueFrom(this.api.list())); }
    catch (e) { this.error.set(liveErrorMessage(e, 'No se pudieron cargar las clases.')); }
    finally { this.loading.set(false); }
  }
  async create(): Promise<void> {
    if (this.busy() || !this.title.trim()) return;
    this.busy.set(true); this.error.set('');
    try { const room = await firstValueFrom(this.api.create(this.title.trim(), this.courseId)); await this.router.navigate(['/live', room.id]); }
    catch (e) { this.error.set(liveErrorMessage(e)); }
    finally { this.busy.set(false); }
  }
  async join(): Promise<void> {
    if (this.busy()) return;
    const code = invitationCode(this.code);
    if (!code) { this.error.set('Pega el enlace de invitación o el código de 16 caracteres.'); return; }
    this.busy.set(true); this.error.set('');
    try { const room = await firstValueFrom(this.api.join(code)); await this.router.navigate(['/live', room.id]); }
    catch (e) { this.error.set(liveErrorMessage(e)); }
    finally { this.busy.set(false); }
  }
  async connect(): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true); this.error.set('');
    try { const { url } = await firstValueFrom(this.api.connect()); window.location.assign(url); }
    catch (e) { this.error.set(liveErrorMessage(e)); this.busy.set(false); }
  }
  async disconnect(): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true); this.error.set('');
    try { await firstValueFrom(this.api.disconnect()); this.google.update(s => s ? { ...s, connected: false, email: null } : s); }
    catch (e) { this.error.set(liveErrorMessage(e)); }
    finally { this.busy.set(false); }
  }
}
