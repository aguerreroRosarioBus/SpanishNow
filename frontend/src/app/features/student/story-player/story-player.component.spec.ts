import { I18nService } from '../../../core/i18n/i18n.service';
import { TestBed, ComponentFixture } from '@angular/core/testing';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { FakeAudio } from './testing/fake-audio';
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

  async function create(lastBlockKey: string | null, tweak: (lesson: StudentLesson) => StudentLesson = l => l): Promise<void> {
    lessonApi = {
      getStory: vi.fn((storyId: number) => of(tweak(makeLesson(storyId, lastBlockKey)))),
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
        provideRouter([]),
        { provide: ActivatedRoute, useValue: { params: of({ courseId: '1' }) } },
        { provide: AuthService, useValue: { currentUser: signal({ id: 1, role: 'student' }), isStudent: () => true } },
        { provide: EnrollmentService, useValue: {
          getMyCourses: () => of([{ id: 1, studentId: 1, courseId: 1, createdAt: '', lessonProgress: [] }]),
          getProgressSummary: () => of({ stories: [], quizzes: [], certificate: null }),
        } },
        { provide: CourseService, useValue: { getCourse: () => of(course) } },
        { provide: StudentLessonService, useValue: lessonApi },
        provideHttpClient(),
        provideHttpClientTesting(),
      ],
    }).compileComponents();
    TestBed.inject(I18nService).setLocale('es');
    fixture = TestBed.createComponent(StoryPlayerComponent);
    component = fixture.componentInstance;
    nav = fixture.debugElement.injector.get(LessonNavigationStore);
    session = fixture.debugElement.injector.get(LessonSessionStore);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  it('EN/ES conserva respuesta, paso/progreso y audio sin repetir carga ni persistencia', async () => {
    await create('q1');
    session.setAnswer('Respuesta humana original');
    const lesson = session.lesson();
    const progress = lesson!.progress;
    const completed = nav.completedStories();
    const count = lessonApi.getStory.mock.calls.length;
    const saved = lessonApi.setCurrentBlock.mock.calls.length;
    const stop = vi.spyOn(session.audio, 'stop');
    TestBed.inject(I18nService).setLocale('en');
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Comprehension question');
    expect(fixture.nativeElement.textContent).toContain('¿Dónde está María?');
    expect(session.answerText()).toBe('Respuesta humana original');
    expect(session.currentBlock()?.blockKey).toBe('q1');
    expect(session.lesson()).toBe(lesson);
    expect(session.lesson()!.progress).toBe(progress);
    expect(nav.completedStories()).toBe(completed);
    expect(lessonApi.getStory).toHaveBeenCalledTimes(count);
    expect(lessonApi.setCurrentBlock).toHaveBeenCalledTimes(saved);
    expect(stop).not.toHaveBeenCalled();
  });

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

  it('anuncia cada paso al navegar en una región viva separada del audio', async () => {
    await create('k1');
    const el = fixture.nativeElement as HTMLElement;
    const announcement = el.querySelector('.steps__current')!;
    const text = () => announcement.textContent?.replace(/\s+/g, ' ').trim();
    expect(announcement.getAttribute('role')).toBe('status');
    expect(announcement.getAttribute('aria-live')).toBe('polite');
    expect(announcement.getAttribute('aria-atomic')).toBe('true');
    expect(text()).toBe('Paso 1 de 4 · Historia');
    const next = el.querySelector('.lesson-foot .btn-primary') as HTMLButtonElement;
    next.click(); fixture.detectChanges();
    expect(text()).toBe('Paso 2 de 4 · Pregunta');
    next.click(); fixture.detectChanges();
    expect(text()).toBe('Paso 3 de 4 · Historia');
    next.click(); fixture.detectChanges();
    expect(text()).toBe('Paso 4 de 4 · Lectura completa');
    // La región solo contiene el nombre/número del paso, nunca la línea de tiempo ni el texto de lectura.
    expect(announcement.querySelector('app-lesson-audio-controls, .story-text')).toBeNull();
    session.audio.currentTime.set(12); fixture.detectChanges();
    expect(text()).toBe('Paso 4 de 4 · Lectura completa');
    expect(el.querySelector('.step')?.contains(announcement)).toBe(false);
    (el.querySelector('.lesson-foot .btn-ghost') as HTMLButtonElement).click(); fixture.detectChanges();
    expect(text()).toBe('Paso 3 de 4 · Historia');
    expect(lessonApi.completeNarrative).not.toHaveBeenCalled();
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

  it('el índice marca como bloqueada la historia que aún no se puede abrir y como actual la abierta', async () => {
    await create(null);
    const rows = [...(fixture.nativeElement as HTMLElement).querySelectorAll('app-player-sidebar ol button')] as HTMLButtonElement[];
    expect(rows.length).toBe(2);
    expect(rows[0].getAttribute('aria-current')).toBe('page');
    expect(rows[1].getAttribute('aria-disabled')).toBe('true');
    expect(rows[1].querySelector('.state--locked')).toBeTruthy();
    expect(nav.canGoNext()).toBe(false);
    expect(nav.nextBlockedReason()).toContain('Completa');
  });

  it('una historia completada nunca aparece bloqueada, aunque la anterior no figure completada', async () => {
    await create(null);
    nav.markStoryCompleted(200);
    const second = nav.items().find(i => i.id === 'story-200')!;
    expect(second.completed).toBe(true);
    expect(second.canAccess).toBe(true);
    fixture.detectChanges();
    const rows = [...(fixture.nativeElement as HTMLElement).querySelectorAll('app-player-sidebar ol button')];
    expect(rows[1].querySelector('.state--done')).toBeTruthy();
    expect(rows[1].querySelector('.state--locked')).toBeNull();
  });

  it('la barra de pasos marca completados en verde, el actual en naranja y no hay otro par anterior/siguiente', async () => {
    await create('q1');
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    const segs = [...el.querySelectorAll('.seg')];
    expect(segs.length).toBe(4);
    expect(segs.map(s => s.classList.contains('is-done'))).toEqual([true, false, false, false]);
    expect(segs[1].classList.contains('is-current')).toBe(true);
    expect(segs[1].getAttribute('aria-label')).toBe('Paso 2: Pregunta');
    expect(el.textContent).toContain('Paso 2 de 4');
    // Un único Anterior y un único Continuar; sin flechas de historia ni «Bloque anterior»
    const labels = [...el.querySelectorAll('button')].map(b => b.textContent?.trim());
    expect(labels.filter(l => l === 'Anterior').length).toBe(1);
    expect(labels.filter(l => l === 'Continuar').length).toBe(1);
    expect(el.querySelector('[aria-label="Historia siguiente"]')).toBeNull();
    expect(el.textContent).not.toContain('revisión');
  });

  it('en el último paso el botón principal completa la lectura y luego pasa a la siguiente historia', async () => {
    await create('f1');
    lessonApi.completeNarrative.mockReturnValue(of({}));
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    const primary = () => el.querySelector('.lesson-foot .btn-primary') as HTMLButtonElement;
    expect(primary().textContent?.trim()).toBe('Completar lectura');
    primary().click();
    fixture.detectChanges();
    expect(lessonApi.completeNarrative).toHaveBeenCalled();
    expect(primary().textContent?.trim()).toBe('Siguiente historia');
    primary().click();
    expect(nav.currentItem()?.id).toBe('story-200');
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

  describe('audio y progreso — AC18', () => {
    beforeEach(() => { FakeAudio.instances = []; vi.stubGlobal('Audio', FakeAudio); });
    afterEach(() => { fixture.destroy(); vi.unstubAllGlobals(); });
    const media = () => FakeAudio.instances.at(-1)!;
    const withAudio = (lesson: StudentLesson): StudentLesson => ({
      ...lesson, story: { ...lesson.story, audioSlowUrl: '/slow.mp3', audioNormalUrl: '/normal.mp3' },
      blocks: lesson.blocks.map(b => b.type === 'keyframe' ? { ...b, audioUrl: '/frame.mp3' } : b),
    });

    it('reproducir, seek, repetir, terminar y reintentar nunca escriben progreso', async () => {
      await create('f1', withAudio);
      const initial = structuredClone(session.lesson()!.progress);
      media().metadata(); session.audio.toggle('/slow.mp3'); await Promise.resolve();
      session.audio.seek(12); session.audio.setRepeat(10, 20); media().currentTime = 21; media().emit('timeupdate');
      session.audio.clearRepeat(); media().emit('ended'); media().emit('error'); session.audio.retry(); await Promise.resolve();
      fixture.detectChanges();
      expect(session.lesson()!.progress).toEqual(initial);
      expect(lessonApi.completeNarrative).not.toHaveBeenCalled();
      expect(lessonApi.setCurrentBlock).not.toHaveBeenCalled();
      expect(lessonApi.getStory).toHaveBeenCalledTimes(1);
      expect(lessonApi.answer).not.toHaveBeenCalled();
    });

    it('libera audio al cambiar de bloque, historia o cerrar y conserva texto/tooltips', async () => {
      await create('k1', withAudio);
      session.audio.toggle('/frame.mp3'); await Promise.resolve(); const frame = media();
      session.goToBlock(1); fixture.detectChanges();
      expect(frame.src).toBe(''); expect(session.audio.state()).toBe('idle');
      session.goToBlockIndex(3); fixture.detectChanges();
      expect(media().src).toContain('/slow.mp3');
      session.audio.toggle('/slow.mp3'); await Promise.resolve(); const full = media();
      nav.items.update(items => items.map(i => ({ ...i, canAccess: true }))); nav.goToNext(); fixture.detectChanges();
      expect(full.src).toBe('');
      const active = media(); fixture.destroy(); expect(active.src).toBe('');
    });
  });

  describe('ilustraciones', () => {
    const withImages = (lesson: StudentLesson): StudentLesson => ({
      ...lesson,
      blocks: [
        lessonBlock('e1', -1, 'expression', 'before', { vocabulary: { word: 'la casa', translation: 'the house', imageUrl: 'https://cdn/casa.png' } }),
        ...lesson.blocks.map(b => b.blockKey === 'k1' ? { ...b, imageUrl: 'https://cdn/k1.png', imageAlt: 'María entra a la fiesta' } : b),
      ],
    });
    const el = () => fixture.nativeElement as HTMLElement;

    it('el keyframe muestra la ilustración junto al texto con su alt y carga diferida', async () => {
      await create('k1', withImages);
      const img = el().querySelector('.kf-layout app-lesson-illustration img') as HTMLImageElement;
      expect(img.getAttribute('src')).toBe('https://cdn/k1.png');
      expect(img.alt).toBe('María entra a la fiesta');
      expect(img.getAttribute('loading')).toBe('lazy');
      expect(el().querySelector('.kf-layout')?.classList.contains('has-image')).toBe(true);
      expect(el().querySelector('.story-text')?.textContent).toContain('María llega a la fiesta');
    });

    it('sin imagen el keyframe se ve como antes', async () => {
      await create('k1');
      expect(el().querySelector('app-lesson-illustration')).toBeNull();
      expect(el().querySelector('.kf-layout')?.classList.contains('has-image')).toBe(false);
    });

    it('al pulsar se ve ampliada en un diálogo y Escape la cierra', async () => {
      await create('k1', withImages);
      (el().querySelector('.ill-open') as HTMLButtonElement).click();
      fixture.detectChanges();
      expect(el().querySelector('.ill-overlay')?.getAttribute('role')).toBe('dialog');
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      fixture.detectChanges();
      expect(el().querySelector('.ill-overlay')).toBeNull();
    });

    it('la expresión muestra la imagen del vocabulario con la palabra y su traducción', async () => {
      await create('e1', withImages);
      expect(el().querySelector('.expression-card img')?.getAttribute('src')).toBe('https://cdn/casa.png');
      expect(el().querySelector('.expression-card')?.textContent).toContain('la casa');
      expect(el().querySelector('.expression-card')?.textContent).toContain('the house');
    });

    it('la lectura completa ilustra cada párrafo que tiene imagen y deja el resto como texto', async () => {
      await create('f1', withImages);
      const paras = [...el().querySelectorAll('.story-para')];
      expect(paras).toHaveLength(2); // k1 (con imagen) y k2 (solo texto)
      expect(paras[0].querySelector('img')?.getAttribute('src')).toBe('https://cdn/k1.png');
      expect(paras[0].textContent).toContain('María llega a la fiesta');
      expect(paras[1].querySelector('img')).toBeNull();
      expect(paras[1].textContent).toContain('dos');
      // los tooltips del keyframe siguen funcionando dentro del párrafo
      expect(paras[0].querySelector('.tooltip-highlight')?.textContent).toBe('María');
    });

    it('sin ninguna imagen la lectura completa conserva el texto de la historia', async () => {
      await create('f1');
      expect(el().querySelector('.story-para')).toBeNull();
      expect(el().querySelector('.story-text app-tooltip-display')).toBeTruthy();
    });
  });
});
