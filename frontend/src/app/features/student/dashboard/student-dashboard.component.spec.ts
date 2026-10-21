import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, provideRouter } from '@angular/router';
import { signal } from '@angular/core';
import { of } from 'rxjs';
import { StudentDashboardComponent } from './student-dashboard.component';
import { AuthService } from '../../../core/services/auth.service';
import { CourseService } from '../../../core/services/course.service';
import { EnrollmentService } from '../../../core/services/enrollment.service';

describe('StudentDashboardComponent (reiniciar progreso)', () => {
  const enrollment = { id: 5, studentId: 1, courseId: 10, createdAt: '2026-01-01', course: { id: 10, title: 'Curso A', level: 'A1' } };

  async function create() {
    const enrollments = { getMyCourses: vi.fn(() => of([enrollment])), resetCourseProgress: vi.fn(() => of({ message: 'ok', deleted: { progress: 1, answers: 2, reinforcements: 0 } })), enroll: vi.fn() };
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

  it('cancelar no llama al backend', async () => {
    const { fixture, enrollments } = await create();
    fixture.componentInstance.resetCourseProgress(enrollment as any);
    fixture.componentInstance.closeConfirmDialog();
    expect(enrollments.resetCourseProgress).not.toHaveBeenCalled();
  });
});
