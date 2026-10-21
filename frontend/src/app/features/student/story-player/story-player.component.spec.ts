import { TestBed, ComponentFixture } from '@angular/core/testing';
import { ActivatedRoute, Router } from '@angular/router';
import { of } from 'rxjs';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { StoryPlayerComponent } from './story-player.component';
import { LessonNavigationStore } from './lesson-navigation.store';
import { LessonSessionStore } from './lesson-session.store';
import { AuthService } from '../../../core/services/auth.service';
import { CourseService } from '../../../core/services/course.service';
import { EnrollmentService } from '../../../core/services/enrollment.service';
import { StudentLesson, StudentLessonBlock, StudentLessonService } from '../../../core/services/student-lesson.service';

const lessonBlock = (blockKey: string, position: number, type: StudentLessonBlock['type'], phase: StudentLessonBlock['phase'], extra: Partial<StudentLessonBlock> = {}): StudentLessonBlock =>
  ({ blockKey, position, type, phase, active: true, required: false, ...extra });

const makeLesson = (storyId: number, lastBlockKey: string | null): StudentLesson => ({
  id: 1, storyId, revision: 1, status: 'published',
  // Desordenados a propósito: el reproductor debe respetar `position`.
  blocks: [
    lessonBlock('f1', 3, 'full_story', 'after'),
    lessonBlock('k2', 2, 'keyframe', 'during', { text: 'dos' }),
    lessonBlock('q1', 1, 'question', 'during', { questionId: 9, contextBlockKey: 'k1', question: { questionText: '¿Dónde está María?', answerType: 'open_ended' } }),
    lessonBlock('k1', 0, 'keyframe', 'during', { text: 'María llega a la fiesta', tooltips: [{ startOffset: 0, endOffset: 5, selectedText: 'María', tooltipContent: 'Nombre propio' }] }),
  ],
  story: { id: storyId, title: 'María', fullStoryText: 'texto' },
  progress: { id: 11, lastBlockKey, narrativeCompleted: false, answers: [], reinforcements: [] },
});

describe('StoryPlayerComponent (flujo TPRS)', () => {
  let fixture: ComponentFixture<StoryPlayerComponent>;
  let component: StoryPlayerComponent;
  let nav: LessonNavigationStore;
  let session: LessonSessionStore;
  let lessonApi: { getStory: any; setCurrentBlock: any; answer: any; completeNarrative: any; completeReinforcement: any };

  async function create(lastBlockKey: string | null): Promise<void> {
    lessonApi = {
      getStory: vi.fn((storyId: number) => of(makeLesson(storyId, lastBlockKey))),
      setCurrentBlock: vi.fn((_p: number, blockKey: string) => of({ lastBlockKey: blockKey, narrativeCompleted: false, revision: 1 })),
      answer: vi.fn(),
      completeNarrative: vi.fn(),
      completeReinforcement: vi.fn(),
    };
    const course = { id: 1, title: 'Curso', units: [{ id: 1, courseId: 1, title: 'U1', order: 1, stories: [
      { id: 100, unitId: 1, title: 'Historia 1', text: '', order: 1 },
      { id: 200, unitId: 1, title: 'Historia 2', text: '', order: 2 },
    ] }] };
    await TestBed.configureTestingModule({
      imports: [StoryPlayerComponent],
      providers: [
        { provide: ActivatedRoute, useValue: { params: of({ courseId: '1' }) } },
        { provide: Router, useValue: { navigate: vi.fn() } },
        { provide: AuthService, useValue: { currentUser: signal({ id: 1, role: 'student' }), isStudent: () => true } },
        { provide: EnrollmentService, useValue: { getMyCourses: () => of([{ id: 1, studentId: 1, courseId: 1, createdAt: '', lessonProgress: [] }]) } },
        { provide: CourseService, useValue: { getCourse: () => of(course) } },
        { provide: StudentLessonService, useValue: lessonApi },
        provideHttpClient(),
        provideHttpClientTesting(),
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(StoryPlayerComponent);
    component = fixture.componentInstance;
    nav = fixture.debugElement.injector.get(LessonNavigationStore);
    session = fixture.debugElement.injector.get(LessonSessionStore);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  const currentKey = () => session.currentBlock()?.blockKey;

  it('avanza keyframe por keyframe y la pregunta aparece después del keyframe que le da contexto', async () => {
    await create(null);
    expect(session.activeBlocks().map(b => b.blockKey)).toEqual(['k1', 'q1', 'k2', 'f1']);
    // Sin progreso previo: se persiste y se muestra el primer bloque.
    expect(lessonApi.setCurrentBlock).toHaveBeenCalledWith(11, 'k1');
    expect(currentKey()).toBe('k1');

    session.goToBlock(1);
    expect(currentKey()).toBe('q1');
    expect(session.currentBlock()?.contextBlockKey).toBe('k1');
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('¿Dónde está María?');

    session.goToBlock(1);
    expect(currentKey()).toBe('k2');
    session.goToBlock(-1);
    expect(currentKey()).toBe('q1');
  });

  it('una respuesta incorrecta muestra el contexto, permite reintentar y no bloquea el avance', async () => {
    await create('q1');
    lessonApi.answer.mockReturnValue(of({ blockKey: 'q1', questionId: 9, isCorrect: false, attempt: 1, context: { blockKey: 'k1', text: 'María llega a la fiesta' }, canRetry: true, canContinue: true }));
    session.setAnswer('en la escuela');
    session.submitAnswer();
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    expect(session.answerResult()?.isCorrect).toBe(false);
    expect(el.querySelector('blockquote')?.textContent).toContain('María llega a la fiesta');

    // "Continuar" sigue habilitado aunque la respuesta sea incorrecta.
    const next = [...el.querySelectorAll('button')].find(b => b.textContent?.trim() === 'Continuar') as HTMLButtonElement;
    expect(next.disabled).toBe(false);

    // Reintentar limpia el resultado y deja volver a responder.
    const retry = [...el.querySelectorAll('button')].find(b => b.textContent?.trim() === 'Reintentar') as HTMLButtonElement;
    retry.click();
    fixture.detectChanges();
    expect(session.answerResult()).toBeNull();
    expect(session.answerText()).toBe('');

    session.goToBlock(1);
    expect(currentKey()).toBe('k2');
  });

  it('al reanudar arranca en el último bloque visitado sin reiniciar el progreso', async () => {
    await create('q1');
    expect(currentKey()).toBe('q1');
    expect(session.currentBlockIndex()).toBe(1);
    expect(lessonApi.setCurrentBlock).not.toHaveBeenCalled();
  });

  it('el menú lateral bloquea un contenido no disponible', async () => {
    await create(null);
    const locked = nav.items().find(i => !i.canAccess)!;
    expect(locked.id).toBe('story-200');
    nav.selectItem(locked);
    expect(nav.currentItem()?.id).toBe('story-100');
  });

  it('la flecha Siguiente aplica la misma regla de acceso que el menú lateral', async () => {
    await create(null);
    expect(nav.canGoNext()).toBe(false);
    expect(nav.nextBlockedReason()).toContain('Completa');
    nav.goToNext();
    expect(nav.currentItem()?.id).toBe('story-100');
    fixture.detectChanges();
    const next = [...(fixture.nativeElement as HTMLElement).querySelectorAll('button')].find(b => b.getAttribute('aria-label')?.startsWith('Historia siguiente')) as HTMLButtonElement;
    expect(next.disabled).toBe(true);
    expect(next.getAttribute('aria-label')).toContain('bloqueada');
  });

  it('las flechas avanzan y retroceden cuando el ítem destino es accesible', async () => {
    await create(null);
    nav.items.update(items => items.map(i => ({ ...i, canAccess: true })));
    expect(nav.canGoPrevious()).toBe(false);
    nav.goToNext();
    expect(nav.currentItem()?.id).toBe('story-200');
    expect(nav.canGoPrevious()).toBe(true);
    nav.goToPrevious();
    expect(nav.currentItem()?.id).toBe('story-100');
  });

  it('muestra los tooltips del keyframe sobre su texto sin consultar la API de historia', async () => {
    await create(null);
    const http = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    const mark = el.querySelector('.story-text .tooltip-highlight') as HTMLElement;
    expect(mark.textContent).toBe('María');
    mark.click();
    fixture.detectChanges();
    expect(el.querySelector('.tooltip-popover')?.textContent).toContain('Nombre propio');
    http.expectNone(r => r.url.includes('/tooltips'));

    // Al pasar al siguiente keyframe se vuelve a renderizar sin resaltados.
    session.goToBlock(2);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(currentKey()).toBe('k2');
    expect(el.querySelector('.story-text .tooltip-highlight')).toBeNull();
    expect(el.querySelector('.story-text')?.textContent).toContain('dos');
  });
});
