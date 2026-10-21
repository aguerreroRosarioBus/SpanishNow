import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { describe, expect, it } from 'vitest';
import { LessonNavigationStore } from './lesson-navigation.store';
import { CourseService } from '../../../core/services/course.service';
import { EnrollmentService } from '../../../core/services/enrollment.service';
import { ToastService } from '../../../core/services/toast.service';

const course = {
  id: 1, title: 'Curso', introVideoUrl: null,
  units: [
    { id: 1, courseId: 1, title: 'U1', order: 1, locked: false, stories: [{ id: 100, unitId: 1, title: 'H1', text: '', order: 1 }] },
    { id: 2, courseId: 1, title: 'U2', order: 2, locked: true, availableAt: '2026-11-03T12:00:00Z', stories: [{ id: 200, unitId: 2, title: 'H2', text: '', order: 1 }] },
  ],
};

function setup() {
  TestBed.configureTestingModule({
    providers: [
      LessonNavigationStore,
      { provide: ToastService, useValue: { warning: () => {} } },
      { provide: CourseService, useValue: { getCourse: () => of(course) } },
      { provide: EnrollmentService, useValue: {
        getMyCourses: () => of([{ id: 1, studentId: 1, courseId: 1, createdAt: '', lessonProgress: [] }]),
        getProgressSummary: () => of({ stories: [], quizzes: [], certificate: null, next: null }),
      } },
    ],
  });
  const store = TestBed.inject(LessonNavigationStore);
  store.load(1);
  return store;
}

describe('LessonNavigationStore (contenido por fechas)', () => {
  it('arranca en la primera unidad abierta', () => {
    const store = setup();
    expect(store.currentUnit()?.id).toBe(1);
    expect(store.currentUnitLocked()).toBe(false);
    expect(store.currentItem()?.story?.id).toBe(100);
  });

  it('una unidad bloqueada lista sus historias sin abrirlas y explica cuándo se libera', () => {
    const store = setup();
    store.goToNextUnit();
    expect(store.currentUnitLocked()).toBe(true);
    expect(store.currentItem()).toBeNull();
    expect(store.currentStoryId()).toBeNull();
    expect(store.items().map(i => i.title)).toEqual(['H2']);
    expect(store.items()[0].locked).toBe(true);
    expect(store.items()[0].canAccess).toBe(false);
    expect(store.currentUnitAvailableText()).toBe('Disponible el 3 de noviembre de 2026');
  });

  it('handleLocked bloquea la unidad abierta con la fecha del 403 y devuelve true', () => {
    const store = setup();
    expect(store.handleLocked({ status: 500, error: {} })).toBe(false);
    expect(store.currentUnitLocked()).toBe(false);
    expect(store.handleLocked({ status: 403, error: { code: 'content_locked', availableAt: '2026-12-01T12:00:00Z' } })).toBe(true);
    expect(store.currentUnitLocked()).toBe(true);
    expect(store.currentItem()).toBeNull();
    expect(store.currentUnitAvailableText()).toBe('Disponible el 1 de diciembre de 2026');
  });
});
