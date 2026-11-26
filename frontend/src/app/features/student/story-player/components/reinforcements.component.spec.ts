import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { I18nService } from '../../../../core/i18n/i18n.service';
import { StudentLessonBlock } from '../../../../core/services/student-lesson.service';
import { ReinforcementsComponent } from './reinforcements.component';
import { LessonNavigationStore } from '../lesson-navigation.store';
import { LessonSessionStore } from '../lesson-session.store';

const block = (blockKey: string, type: StudentLessonBlock['type']): StudentLessonBlock =>
  ({ blockKey, position: 0, type, phase: 'after', active: true, required: false });

describe('A-03: «Listen and repeat» solo se ofrece si la historia tiene actividades', () => {
  const stories = signal<{ id: number; repetitionActivities?: unknown[] }[]>([]);
  const blocks = signal<StudentLessonBlock[]>([]);
  const lessonSig = signal<unknown>({ storyId: 5 });

  function render(): HTMLElement {
    const fixture = TestBed.createComponent(ReinforcementsComponent);
    fixture.componentRef.setInput('showPanel', true);
    fixture.detectChanges();
    return fixture.nativeElement;
  }
  beforeEach(() => {
    localStorage.clear();
    lessonSig.set({ storyId: 5 });
    blocks.set([block('f', 'flashcards'), block('m', 'matching'), block('l', 'listen_repeat')]);
    TestBed.configureTestingModule({ providers: [
      provideRouter([]), provideHttpClient(), provideHttpClientTesting(),
      { provide: LessonSessionStore, useValue: { lesson: lessonSig, reinforcementBlocks: blocks, isReinforcementComplete: () => false } },
      { provide: LessonNavigationStore, useValue: { currentUnit: () => ({ id: 1, stories: stories() }), unitNumber: () => 1 } },
    ] });
    TestBed.inject(I18nService).setLocale('es');
  });
  afterEach(() => { TestBed.resetTestingModule(); localStorage.clear(); });

  it('oculta la tarjeta cuando la historia no tiene actividades de repetición', () => {
    stories.set([{ id: 5, repetitionActivities: [] }]);
    const cards = Array.from(render().querySelectorAll('.practice-card__name')).map(e => e.textContent!.trim());
    expect(cards).toHaveLength(2);
    expect(cards.join('|')).not.toMatch(/repetir|repeat/i);
  });

  it('muestra la tarjeta cuando sí hay actividades', () => {
    stories.set([{ id: 5, repetitionActivities: [{ id: 1 }] }]);
    expect(render().querySelectorAll('.practice-card')).toHaveLength(3);
  });

  it('no muestra la sección si «escuchar y repetir» era el único refuerzo y no tiene actividades', () => {
    blocks.set([block('l', 'listen_repeat')]);
    stories.set([{ id: 5 }]);
    expect(render().querySelector('.practice')).toBeNull();
  });

  it('no muestra el panel antes de terminar la narración', () => {
    stories.set([{ id: 5, repetitionActivities: [{ id: 1 }] }]);
    const fixture = TestBed.createComponent(ReinforcementsComponent);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.practice')).toBeNull();
  });

  it('muestra el contador y el botón principal para el primer pendiente', () => {
    stories.set([{ id: 5, repetitionActivities: [{ id: 1 }] }]);
    const el = render();
    expect(el.querySelector('.practice__count')?.textContent?.trim()).toBe('0 de 3');
    expect(el.querySelector('.practice')?.textContent).not.toContain('aria-labelledby');
    expect(el.querySelector('.practice__start')?.textContent?.trim()).toBe('Empezar: Flashcards');
  });

  it('calcula los ids de vocabulario de las expresiones del plan antes de la narración', () => {
    lessonSig.set({ storyId: 5, blocks: [
      { ...block('e1', 'expression'), phase: 'before', vocabularyId: 11 },
      { ...block('e2', 'expression'), phase: 'before', vocabularyId: 12, vocabularyRole: 'revisit' },
      { ...block('e3', 'expression'), phase: 'later', vocabularyId: 13 },
      { ...block('k', 'keyframe'), phase: 'during' },
    ] });
    stories.set([{ id: 5 }]);
    const fixture = TestBed.createComponent(ReinforcementsComponent);
    expect(fixture.componentInstance.vocabularyIds()).toEqual([11, 12]);
  });
});
