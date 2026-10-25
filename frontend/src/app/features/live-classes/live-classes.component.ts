import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { AuthService } from '../../core/services/auth.service';
import { CourseService } from '../../core/services/course.service';
import { LiveClassService } from '../../core/services/live-class.service';
import { GoogleStatus, LiveClass } from '../../core/models/live-class.model';
import { Course } from '../../core/models/course.model';
import { IconComponent } from '../../shared/components/icon/icon.component';
import { I18nService } from '../../core/i18n/i18n.service';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { UserPreferencesService } from '../../core/services/user-preferences.service';
import { LiveNotice, noticeError, noticeKey, noticeText, liveStatusText, presentationZone } from './live-notice';

export function invitationCode(value: string): string {
  const trimmed = value.trim();
  if (/^[\w-]{16}$/.test(trimmed)) return trimmed;
  try { return new URL(trimmed).pathname.match(/^\/live\/join\/([\w-]{16})\/?$/)?.[1] || ''; } catch { return ''; }
}
@Component({
  selector: 'app-live-classes', standalone: true, imports: [FormsModule, RouterLink, IconComponent, TranslatePipe],
  templateUrl: './live-classes.component.html', styleUrl: './live-classes.component.scss'
})
export class LiveClassesComponent implements OnInit {
  private api = inject(LiveClassService);
  private coursesApi = inject(CourseService);
  private router = inject(Router);
  readonly i18n = inject(I18nService);
  private preferences = inject(UserPreferencesService);
  private route = inject(ActivatedRoute);
  readonly teacher = inject(AuthService).isTeacher();
  classes = signal<LiveClass[]>([]);
  courses = signal<Course[]>([]);
  google = signal<GoogleStatus | null>(null);
  loading = signal(true);
  busy = signal(false);
  private errorNotice = signal<LiveNotice | null>(null);
  private infoNotice = signal<LiveNotice | null>(null);
  readonly error = computed(() => noticeText(this.i18n, this.errorNotice()));
  readonly info = computed(() => noticeText(this.i18n, this.infoNotice()));
  showCreate = signal(false);
  title = '';
  courseId: number | null = null;
  code = '';
  courseName(c:LiveClass):string {return c.classroomCourseName||this.courses().find(course=>course.id===c.courseId)?.title||this.i18n.t(c.courseId?'liveBoard.list.linkedCourse':'liveBoard.list.standaloneRoom');}
  filter = signal('all');
  filtered = computed(() => this.classes().filter(c => this.filter() === 'all' || c.status === this.filter()));
  readonly statusLabel = (status: string) => liveStatusText(this.i18n, status);
  updatedAt(value: string): string {
    try { return this.i18n.formatInstant(value, presentationZone(this.preferences.preferences()?.timeZone), { dateStyle: 'medium', timeStyle: 'short' }); } catch { return ''; }
  }
  ngOnInit(): void {
    const google = this.route.snapshot.queryParamMap.get('google');
    if (google === 'connected') this.infoNotice.set(noticeKey('liveBoard.info.googleConnected'));
    if (google === 'error') this.errorNotice.set(noticeKey('liveBoard.error.googleConnect'));
    if (google) void this.router.navigate([], { replaceUrl: true, queryParams: { google: null }, queryParamsHandling: 'merge' });
    void this.load();
    if (this.teacher) {
      this.coursesApi.getCourses().subscribe({ next: courses => this.courses.set(courses), error: () => this.infoNotice.set(noticeKey('liveBoard.info.coursesLoadFailed')) });
      this.api.googleStatus().subscribe({ next: status => this.google.set(status), error: e => this.errorNotice.set(noticeError(e)) });
    }
  }
  async load(): Promise<void> {
    this.loading.set(true);
    try { this.classes.set(await firstValueFrom(this.api.list())); }
    catch (e) { this.errorNotice.set(noticeError(e, 'liveBoard.error.loadClasses')); }
    finally { this.loading.set(false); }
  }
  async create(): Promise<void> {
    if (this.busy() || !this.title.trim()) return;
    this.busy.set(true); this.errorNotice.set(null);
    try { const room = await firstValueFrom(this.api.create(this.title.trim(), this.courseId)); await this.router.navigate(['/live', room.id]); }
    catch (e) { this.errorNotice.set(noticeError(e)); }
    finally { this.busy.set(false); }
  }
  async join(): Promise<void> {
    if (this.busy()) return;
    const code = invitationCode(this.code);
    if (!code) { this.errorNotice.set(noticeKey('liveBoard.list.joinInvalid')); return; }
    this.busy.set(true); this.errorNotice.set(null);
    try { const room = await firstValueFrom(this.api.join(code)); await this.router.navigate(['/live', room.id]); }
    catch (e) { this.errorNotice.set(noticeError(e)); }
    finally { this.busy.set(false); }
  }
  async connect(): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true); this.errorNotice.set(null);
    try { const { url } = await firstValueFrom(this.api.connect()); window.location.assign(url); }
    catch (e) { this.errorNotice.set(noticeError(e)); this.busy.set(false); }
  }
  async disconnect(): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true); this.errorNotice.set(null);
    try { await firstValueFrom(this.api.disconnect()); this.google.update(s => s ? { ...s, connected: false, email: null } : s); }
    catch (e) { this.errorNotice.set(noticeError(e)); }
    finally { this.busy.set(false); }
  }
}
