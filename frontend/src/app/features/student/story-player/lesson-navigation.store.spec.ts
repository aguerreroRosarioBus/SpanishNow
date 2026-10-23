import { UserPreferencesService } from '../../../core/services/user-preferences.service';
import { I18nService } from '../../../core/i18n/i18n.service';
import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { describe, expect, it } from 'vitest';
import { LessonNavigationStore } from './lesson-navigation.store';
import { CourseService } from '../../../core/services/course.service';
import { EnrollmentService } from '../../../core/services/enrollment.service';
import { ToastService } from '../../../core/services/toast.service';

const course = (intro: string | null) => ({
  id: 1, title: 'Curso', introVideoUrl: intro,
  units: [
    { id: 1, courseId: 1, title: 'U1', order: 1, quiz: { id: 5, title: 'Quiz 1', questionCount: 3, passingScore: 70 },
      stories: [{ id: 100, unitId: 1, title: 'H1', text: '', order: 1 }, { id: 200, unitId: 1, title: 'H2', text: '', order: 2 }] },
    { id: 2, courseId: 1, title: 'U2', order: 2, quiz: null, stories: [{ id: 300, unitId: 2, title: 'H3', text: '', order: 1 }] },
  ],
});

function setup(intro: string | null, completedStoryIds: number[] = []) {
  TestBed.configureTestingModule({
    providers: [
      {provide: UserPreferencesService, useValue: {preferences: () => null}},
      LessonNavigationStore,
      { provide: ToastService, useValue: { warning: () => {} } },
      { provide: CourseService, useValue: { getCourse: () => of(course(intro)) } },
      { provide: EnrollmentService, useValue: {
        getMyCourses: () => of([{ id: 1, studentId: 1, courseId: 1, createdAt: '', lessonProgress: completedStoryIds.map(storyId => ({ storyId, planId: 1, narrativeCompleted: true })) }]),
        getProgressSummary: () => of({ stories: [], quizzes: [], certificate: null }),
      } },
    ],
  });
  TestBed.inject(I18nService).setLocale('es');
  const store = TestBed.inject(LessonNavigationStore);
  store.load(1);
  return store;
}

describe('LessonNavigationStore (bienvenida y quiz)', () => {
  it('pone la bienvenida primero en la primera unidad y arranca ahí si no hay avance', () => {
    const store = setup('https://www.youtube-nocookie.com/embed/abc');
    expect(store.items().map(i => i.id)).toEqual(['intro', 'story-100', 'story-200', 'quiz-1']);
    expect(store.currentItem()?.kind).toBe('intro');
    // La bienvenida no bloquea la primera historia
    expect(store.items()[1].canAccess).toBe(true);
  });

  it('sin video de bienvenida no hay ítem', () => {
    expect(setup(null).items()[0].kind).toBe('story');
  });

  it('la segunda unidad nunca muestra la bienvenida', () => {
    const store = setup('https://player.vimeo.com/video/1');
    store.goToNextUnit();
    expect(store.items().some(i => i.kind === 'intro')).toBe(false);
  });

  it('el quiz se habilita al completar todas las historias de la unidad', () => {
    const store = setup(null);
    const quiz = () => store.items().find(i => i.kind === 'quiz')!;
    expect(quiz().canAccess).toBe(false);
    store.markStoryCompleted(100);
    expect(quiz().canAccess).toBe(false);
    store.markStoryCompleted(200);
    expect(quiz().canAccess).toBe(true);
    expect(quiz().completed).toBe(false);
    store.setQuizResult(1, { bestScore: 80, passed: true });
    expect(quiz().completed).toBe(true);
  });

  it('con avance previo retoma desde las historias y no desde la bienvenida', () => {
    const store = setup('https://www.youtube-nocookie.com/embed/abc', [100]);
    expect(store.currentItem()?.id).toBe('story-100');
  });
});
