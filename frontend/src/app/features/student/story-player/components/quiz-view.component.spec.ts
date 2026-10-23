import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { signal } from '@angular/core';
import { of, throwError } from 'rxjs';
import { vi } from 'vitest';
import { QuizViewComponent } from './quiz-view.component';
import { LessonNavigationStore } from '../lesson-navigation.store';
import { QuizService } from '../../../../core/services/quiz.service';
import { I18nService } from '../../../../core/i18n/i18n.service';

it('quiz: conserva selección/borrador y error sin recargar ni reenviar al alternar idioma', () => {
  const quiz = Object.freeze({id: 9, title: 'Evaluación original', passingScore: 70, questions: [{id: 1, prompt: '¿Dónde está María?', options: ['En Córdoba', 'En Madrid']}], bestAttempt: null});
  const api = {getForStudent: vi.fn(() => of(quiz)), submitAttempt: vi.fn(() => throwError(() => ({error: {code: 'unknown', error: 'PRIVATE_INTERNAL'}})))};
  const item = signal({id: 'quiz-1', unit: {id: 1}});
  TestBed.configureTestingModule({providers: [provideRouter([]),
    {provide: QuizService, useValue: api},
    {provide: LessonNavigationStore, useValue: {currentItem: item, currentUnit: () => ({id: 1, title: 'Unidad original'}), unitNumber: () => 1, canGoNextUnit: () => false, canGoPrevious: () => true, courseFinished: () => false, nextCourse: () => null, handleLocked: () => false}}
  ]});
  const i18n = TestBed.inject(I18nService); i18n.setLocale('es');
  const f = TestBed.createComponent(QuizViewComponent); f.detectChanges();
  const c = f.componentInstance; c.choose(0, 1); f.detectChanges(); const answers = c.answers();
  i18n.setLocale('en'); f.detectChanges();
  expect(f.nativeElement.textContent).toContain('1 question');
  expect(f.nativeElement.textContent).toContain('¿Dónde está María?');
  expect(f.nativeElement.querySelectorAll('input')[1].checked).toBe(true);
  expect(c.answers()).toBe(answers); expect(c.quiz()).toBe(quiz); expect(api.getForStudent).toHaveBeenCalledTimes(1);
  c.submit(); f.detectChanges();
  expect(f.nativeElement.textContent).toContain('Could not submit your answers');
  i18n.setLocale('es'); f.detectChanges();
  expect(f.nativeElement.textContent).toContain('No se pudo enviar tus respuestas');
  expect(f.nativeElement.textContent).not.toContain('PRIVATE_INTERNAL');
  expect(c.answers()).toBe(answers); expect(api.submitAttempt).toHaveBeenCalledTimes(1);
});
