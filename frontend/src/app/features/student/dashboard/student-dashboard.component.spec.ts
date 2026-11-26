import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, provideRouter } from '@angular/router';
import { signal } from '@angular/core';
import { of } from 'rxjs';
import { StudentDashboardComponent } from './student-dashboard.component';
import { AuthService } from '../../../core/services/auth.service';
import { CourseService } from '../../../core/services/course.service';
import { EnrollmentService } from '../../../core/services/enrollment.service';
import { I18nService, LOCALE_STORAGE_KEY } from '../../../core/i18n/i18n.service';

describe('StudentDashboardComponent (reiniciar progreso)', () => {
  const enrollment = { id: 5, studentId: 1, courseId: 10, createdAt: '2026-01-01T12:00:00.000Z', course: { id: 10, title: 'Curso A', level: 'A1' } };
  afterEach(() => localStorage.removeItem(LOCALE_STORAGE_KEY));

  async function create() {
    const enrollments = { getProgressSummary:vi.fn(()=>of({stories:[],quizzes:[],certificate:null,next:null})), getMyCourses: vi.fn(() => of([enrollment])), resetCourseProgress: vi.fn(() => of({ message: 'ok', deleted: { progress: 1, answers: 2, reinforcements: 0 } })), enroll: vi.fn() };
    await TestBed.configureTestingModule({
      imports: [StudentDashboardComponent],
      providers: [
        provideRouter([]),
        { provide: ActivatedRoute, useValue: { queryParams: of({}) } },
        { provide: AuthService, useValue: { currentUser: signal({ id: 1, role: 'student' }), isStudent: () => true } },
        { provide: CourseService, useValue: { getCourses: () => of([]) } },
        { provide: EnrollmentService, useValue: enrollments },
      ],
    }).compileComponents();
    TestBed.inject(I18nService).setLocale('es');
    const fixture = TestBed.createComponent(StudentDashboardComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    return { fixture, enrollments };
  }

  it('pide confirmación y solo reinicia al confirmar', async () => {
    const { fixture, enrollments } = await create();
    fixture.componentInstance.resetCourseProgress(enrollment as any);
    expect(enrollments.resetCourseProgress).not.toHaveBeenCalled();
    expect(fixture.componentInstance.showConfirmDialog()).toBe(true);

    fixture.componentInstance.onConfirmDialogConfirmed();
    expect(enrollments.resetCourseProgress).toHaveBeenCalledWith(5);
    expect(enrollments.getMyCourses).toHaveBeenCalledTimes(2); // recarga tras reiniciar
  });

  it('A2-01: muestra el certificado anterior con progreso actual al 0 %', async () => {
    const { fixture } = await create();
    fixture.componentInstance.progressByEnrollment.set({
      5: {
        stories: [{ storyId: 1, narrativeCompleted: false }], quizzes: [],
        certificate: { eligible: false, code: 'ABC', missing: { stories: 1, quizzes: 0 } }
      } as any
    });
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Certificado obtenido');
    expect(fixture.nativeElement.textContent).not.toContain('Repasar curso');
    expect(fixture.nativeElement.querySelector('[role="progressbar"]').getAttribute('aria-valuenow')).toBe('0');
    fixture.componentInstance.resetCourseProgress(enrollment as any);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('seguirá disponible');
  });

  it('resumeStory: curso sin empezar no devuelve historia (abre en la bienvenida) y uno empezado retoma', async () => {
    const { fixture } = await create();
    const c = fixture.componentInstance;
    c.progressByEnrollment.set({ 5: { stories: [{ storyId: 1, narrativeCompleted: false }, { storyId: 2, narrativeCompleted: false }], quizzes: [], certificate: null } as any });
    expect(c.resumeStory(enrollment as any)).toBeNull();
    c.progressByEnrollment.set({ 5: { stories: [{ storyId: 1, narrativeCompleted: true }, { storyId: 2, narrativeCompleted: false }], quizzes: [], certificate: null } as any });
    expect(c.resumeStory(enrollment as any)).toBe(2);
    c.progressByEnrollment.set({ 5: { stories: [{ storyId: 1, narrativeCompleted: false }, { storyId: 2, narrativeCompleted: false, lastBlockKey: 'x' }], quizzes: [], certificate: null } as any });
    expect(c.resumeStory(enrollment as any)).toBe(2);
  });

  it('cancelar no llama al backend', async () => {
    const { fixture, enrollments } = await create();
    fixture.componentInstance.resetCourseProgress(enrollment as any);
    fixture.componentInstance.closeConfirmDialog();
    expect(enrollments.resetCourseProgress).not.toHaveBeenCalled();
  });

  it('traduce la confirmación abierta conservando curso y acción pendiente', async () => {
    const { fixture, enrollments } = await create();
    fixture.componentInstance.resetCourseProgress(enrollment as any);
    fixture.detectChanges();
    const pending = fixture.componentInstance.confirmDialogData();
    TestBed.inject(I18nService).setLocale('en');
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Reset your progress in “Curso A”?');
    expect(fixture.componentInstance.confirmDialogData()).toBe(pending);
    expect(enrollments.resetCourseProgress).not.toHaveBeenCalled();
  });
});
