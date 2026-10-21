import { TestBed, ComponentFixture } from '@angular/core/testing';
import { of } from 'rxjs';
import { signal } from '@angular/core';
import { LessonComposerComponent } from './lesson-composer.component';
import { LessonBlock, LessonPlan, LessonPlanService } from '../../../core/services/lesson-plan.service';
import { AuthService } from '../../../core/services/auth.service';
import { QuestionService } from '../../../core/services/question.service';
import { VocabularyService } from '../../../core/services/vocabulary.service';
import { Question, Vocabulary } from '../../../core/models/course.model';

const block = (blockKey: string, type: LessonBlock['type'], phase: LessonBlock['phase'], extra: Partial<LessonBlock> = {}): LessonBlock =>
  ({ blockKey, type, phase, active: true, required: false, ...extra });

const makePlan = (blocks: LessonBlock[]): LessonPlan => ({ id: 1, storyId: 7, revision: 1, status: 'draft', blocks });

describe('LessonComposerComponent', () => {
  let fixture: ComponentFixture<LessonComposerComponent>;
  let component: LessonComposerComponent;
  let api: { getDraft: any; saveDraft: any; reorder: any; publish: any };
  const seenKey = 'spanishnow.lesson-tutorial.5.v1';

  let createQuestion: any, createVocabulary: any;

  async function create(blocks: LessonBlock[], vocab: Vocabulary[] = []): Promise<void> {
    createQuestion = vi.fn((d: any) => of({ id: 99, ...d } as Question));
    createVocabulary = vi.fn((f: FormData) => of({ id: 55, unitId: 1, word: f.get('word'), translation: f.get('translation') } as Vocabulary));
    api = {
      getDraft: vi.fn(() => of(makePlan(blocks))),
      saveDraft: vi.fn((_s: number, _r: number, b: LessonBlock[]) => of(makePlan(b))),
      reorder: vi.fn((_s: number, _r: number, keys: string[]) => of(makePlan(keys.map(k => blocks.find(b => b.blockKey === k)!)))),
      publish: vi.fn(() => of({ ...makePlan(blocks), status: 'published', revision: 2 })),
    };
    await TestBed.configureTestingModule({
      imports: [LessonComposerComponent],
      providers: [
        { provide: LessonPlanService, useValue: api },
        { provide: AuthService, useValue: { currentUser: signal({ id: 5 }) } },
        { provide: QuestionService, useValue: { getQuestionsByStory: () => of([]), createQuestion } },
        { provide: VocabularyService, useValue: { getVocabularyByUnit: () => of(vocab), createVocabulary } },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(LessonComposerComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('story', { id: 7, unitId: 1, title: 'María', text: 'texto', order: 1 });
    fixture.componentRef.setInput('unit', { id: 1, courseId: 1, title: 'U1', order: 1 });
    fixture.componentRef.setInput('courseUnits', []);
    fixture.detectChanges();
    await new Promise(r => setTimeout(r, 5)); // ngOnInit async (firstValueFrom)
    fixture.detectChanges();
  }

  beforeEach(() => localStorage.removeItem(seenKey));
  afterEach(() => localStorage.removeItem(seenKey));

  const keys = () => component.blocks().map(b => b.blockKey);

  describe('reordenar', () => {
    beforeEach(async () => {
      localStorage.setItem(seenKey, 'seen');
      await create([
        block('e1', 'expression', 'before'),
        block('k1', 'keyframe', 'during', { text: 'uno' }),
        block('q1', 'question', 'during', { questionId: 1, contextBlockKey: 'k1' }),
        block('k2', 'keyframe', 'during', { text: 'dos' }),
        block('f1', 'full_story', 'after'),
      ]);
    });

    it('mover abajo/arriba intercambia bloques dentro de la fase y persiste el orden', async () => {
      const k1 = component.blocks()[1];
      component.move(k1, 1);
      await fixture.whenStable();
      expect(api.reorder).toHaveBeenCalledWith(7, 1, ['e1', 'q1', 'k1', 'k2', 'f1']);
      component.move(component.blocks()[2], -1);
      await fixture.whenStable();
      expect(api.reorder).toHaveBeenLastCalledWith(7, 1, ['e1', 'k1', 'q1', 'k2', 'f1']);
    });

    it('no mueve más allá del límite de la fase (primero/último)', () => {
      component.move(component.blocks()[1], -1); // primer bloque de "durante" -> sube a "antes"
      component.move(component.blocks()[3], 1);  // último de "durante" -> baja a "después"
      component.move(component.blocks()[0], -1); // primero absoluto
      component.move(component.blocks()[4], 1);  // último absoluto
      expect(keys()).toEqual(['e1', 'k1', 'q1', 'k2', 'f1']);
      expect(api.reorder).not.toHaveBeenCalled();
    });

    it('los botones de flecha de los extremos de cada fase están deshabilitados', () => {
      const cards = [...fixture.nativeElement.querySelectorAll('.block-card')] as HTMLElement[];
      const btn = (card: HTMLElement, dir: 'arriba' | 'abajo') => card.querySelector(`button[aria-label$="${dir}"]`) as HTMLButtonElement;
      expect(btn(cards[1], 'arriba').disabled).toBe(true);   // k1: primero de Durante
      expect(btn(cards[1], 'abajo').disabled).toBe(false);
      expect(btn(cards[3], 'abajo').disabled).toBe(true);    // k2: último de Durante
      expect(btn(cards[0], 'abajo').disabled).toBe(true);    // e1: único en Antes
    });
  });

  describe('preguntas y publicación', () => {
    it('una pregunta solo ofrece como contexto los keyframes activos que la preceden', async () => {
      localStorage.setItem(seenKey, 'seen');
      await create([
        block('k1', 'keyframe', 'during', { text: 'uno' }),
        block('q1', 'question', 'during', { questionId: 1, contextBlockKey: 'k1' }),
        block('k2', 'keyframe', 'during', { text: 'dos' }),
        block('f1', 'full_story', 'after'),
      ]);
      const q1 = component.blocks()[1];
      expect(component.keyframesBefore(q1).map(b => b.blockKey)).toEqual(['k1']);
      expect(component.contextText(q1)).toBe('uno');
    });

    it('publicar sin keyframe activo con texto muestra el aviso y no llama a la API', async () => {
      localStorage.setItem(seenKey, 'seen');
      await create([
        block('k1', 'keyframe', 'during', { text: 'uno', active: false }),
        block('f1', 'full_story', 'after'),
      ]);
      await component.publish();
      expect(component.error()).toContain('al menos un keyframe activo');
      expect(api.publish).not.toHaveBeenCalled();
    });

    it('publicar una pregunta sin keyframe de contexto es rechazado', async () => {
      localStorage.setItem(seenKey, 'seen');
      await create([
        block('k1', 'keyframe', 'during', { text: 'uno' }),
        block('q1', 'question', 'during', { questionId: 1, contextBlockKey: null }),
        block('f1', 'full_story', 'after'),
      ]);
      await component.publish();
      expect(component.error()).toContain('keyframe que le da contexto');
      expect(api.publish).not.toHaveBeenCalled();
    });

    it('avisa si la pregunta quedó antes (o sin) su keyframe de contexto al reordenar', async () => {
      localStorage.setItem(seenKey, 'seen');
      await create([
        block('q1', 'question', 'during', { questionId: 1, contextBlockKey: 'k1' }),
        block('k1', 'keyframe', 'during', { text: 'uno' }),
        block('f1', 'full_story', 'after'),
      ]);
      await component.publish();
      expect(component.error()).toContain('después de su keyframe');
      expect(api.publish).not.toHaveBeenCalled();
    });

    it('publica cuando el borrador es válido', async () => {
      localStorage.setItem(seenKey, 'seen');
      await create([
        block('k1', 'keyframe', 'during', { text: 'uno' }),
        block('q1', 'question', 'during', { questionId: 1, contextBlockKey: 'k1' }),
        block('f1', 'full_story', 'after'),
      ]);
      await component.publish();
      expect(api.publish).toHaveBeenCalledWith(7, 1);
    });
  });

  describe('composición incremental', () => {
    const flush = () => new Promise(r => setTimeout(r, 5));
    beforeEach(async () => {
      localStorage.setItem(seenKey, 'seen');
      await create([
        block('k1', 'keyframe', 'during', { text: 'Luis llega a la casa.' }),
        block('q1', 'question', 'during', { questionId: 1, contextBlockKey: 'k1' }),
        block('k2', 'keyframe', 'during', { text: 'Luis tiene un gato.' }),
        block('f1', 'full_story', 'after'),
      ]);
    });

    it('«Pregunta sobre esto» inserta tras las preguntas del keyframe, con su contexto y el formulario abierto', () => {
      component.addQuestionAfter(component.blocks()[0]);
      fixture.detectChanges();
      const ids = component.blocks().map(b => b.blockKey);
      expect(ids.slice(0, 2)).toEqual(['k1', 'q1']);
      const created = component.blocks()[2];
      expect(created.type).toBe('question');
      expect(created.contextBlockKey).toBe('k1');
      expect(ids[3]).toBe('k2');
      expect(component.newQuestionFor()).toBe(created.blockKey);
      expect(fixture.nativeElement.querySelector('app-inline-question-form')).toBeTruthy();
    });

    it('«Seguir la historia» inserta un keyframe vacío tras el keyframe y sus preguntas', () => {
      component.addKeyframeAfter(component.blocks()[0]);
      const blocks = component.blocks();
      expect(blocks.map(b => b.blockKey).slice(0, 2)).toEqual(['k1', 'q1']);
      expect(blocks[2]).toMatchObject({ type: 'keyframe', phase: 'during', active: true, text: '' });
      expect(blocks[3].blockKey).toBe('k2');
      expect(component.dirty()).toBe(true);
    });

    it('los botones aparecen bajo cada keyframe de «Durante»', () => {
      const labels = [...fixture.nativeElement.querySelectorAll('.kf-flow button')].map((b: HTMLElement) => b.textContent!.trim());
      expect(labels).toEqual(['＋ Pregunta sobre esto', '＋ Seguir la historia', '＋ Pregunta sobre esto', '＋ Seguir la historia']);
    });

    it('crear una pregunta inline la guarda, la añade a la lista y la asigna al bloque', async () => {
      component.addQuestionAfter(component.blocks()[2]);
      fixture.detectChanges();
      const form = fixture.debugElement.query(d => d.name === 'app-inline-question-form').componentInstance;
      await form.submit();
      expect(createQuestion).not.toHaveBeenCalled(); // vacío: no valida
      form.text.set('¿Luis tiene un gato?');
      form.correct.set('Sí');
      await form.submit();
      expect(createQuestion).toHaveBeenCalledWith({ storyId: 7, questionText: '¿Luis tiene un gato?', answerType: 'yes_no', options: ['Sí', 'No'], correctAnswer: 'Sí' });
      expect(component.questions().map(q => q.id)).toEqual([99]);
      expect(component.blocks()[3].questionId).toBe(99);
      expect(component.newQuestionFor()).toBeNull();
    });

    it('pregunta de dos opciones exige opciones distintas y respuesta correcta', async () => {
      component.addQuestionAfter(component.blocks()[2]);
      fixture.detectChanges();
      const form = fixture.debugElement.query(d => d.name === 'app-inline-question-form').componentInstance;
      form.setType('choice'); form.text.set('¿Quién llega?'); form.optionA.set('Luis'); form.optionB.set('luis'); form.correct.set('0');
      expect(form.validation()).toContain('distintas');
      form.optionB.set('Ana'); form.correct.set('');
      expect(form.validation()).toContain('correcta');
      form.correct.set('1');
      await form.submit();
      expect(createQuestion).toHaveBeenCalledWith({ storyId: 7, questionText: '¿Quién llega?', answerType: 'choice', options: ['Luis', 'Ana'], correctAnswer: 'Ana' });
    });

    it('una pregunta nueva desde «＋ Añadir» toma el último keyframe como contexto', () => {
      component.addBlock('question', 'during');
      expect(component.blocks().find(b => b.type === 'question' && !b.questionId)?.contextBlockKey).toBe('k2');
    });

    it('«Nueva expresión» crea el vocabulario, lo añade y lo selecciona', async () => {
      component.addBlock('expression', 'before');
      const exp = component.blocks()[0];
      component.toggleNewExpression(exp.blockKey);
      fixture.detectChanges();
      const form = fixture.debugElement.query(d => d.name === 'app-inline-vocabulary-form').componentInstance;
      form.word.set('me llamo'); form.translation.set('my name is');
      await form.submit();
      const sent = createVocabulary.mock.calls[0][0] as FormData;
      expect([sent.get('unitId'), sent.get('word'), sent.get('translation')]).toEqual(['1', 'me llamo', 'my name is']);
      expect(component.vocabulary().map(v => v.id)).toEqual([55]);
      expect(component.blocks()[0].vocabularyId).toBe(55);
    });

    it('marcar una selección crea la expresión y un bloque objetivo activo en «Antes»', async () => {
      const textarea = fixture.nativeElement.querySelector('#kf-text-k2') as HTMLTextAreaElement;
      textarea.focus();
      textarea.setSelectionRange(5, 10);
      textarea.dispatchEvent(new Event('select'));
      fixture.detectChanges();
      const button = [...fixture.nativeElement.querySelectorAll('.mark-expression button')][0] as HTMLButtonElement;
      expect(button.textContent).toContain('Marcar como expresión objetivo');
      button.click();
      fixture.detectChanges();
      const form = fixture.debugElement.query(d => d.name === 'app-inline-vocabulary-form').componentInstance;
      expect(form.word()).toBe('tiene');
      form.translation.set('has');
      await form.submit();
      const marked = component.blocks()[0];
      expect(marked).toMatchObject({ type: 'expression', phase: 'before', active: true, vocabularyRole: 'target', vocabularyId: 55 });
      expect(component.markTarget()).toBeNull();
    });

    it('reutiliza el vocabulario existente con la misma palabra (sin distinguir mayúsculas)', async () => {
      TestBed.resetTestingModule();
      await create([block('k1', 'keyframe', 'during', { text: 'Luis tiene un gato.' })], [{ id: 3, unitId: 1, word: 'Tiene', translation: 'has' }]);
      component.startMark('k1', 'tiene');
      fixture.detectChanges();
      const form = fixture.debugElement.query(d => d.name === 'app-inline-vocabulary-form').componentInstance;
      await form.submit();
      expect(createVocabulary).not.toHaveBeenCalled();
      expect(component.blocks()[0]).toMatchObject({ type: 'expression', vocabularyId: 3, vocabularyRole: 'target', active: true });
    });

    it('el panel lateral muestra la historia hasta ahora y el chequeo TPRS en vivo', async () => {
      const el = fixture.nativeElement as HTMLElement;
      expect(el.querySelector('.story-text')?.textContent).toBe('Luis llega a la casa.\n\nLuis tiene un gato.');
      component.updateBlock('k2', { text: 'Luis tiene un perro.' });
      fixture.detectChanges();
      expect(el.querySelector('.story-text')?.textContent).toContain('perro');
      component.sideTab.set('tprs');
      fixture.detectChanges();
      const items = [...el.querySelectorAll('.checklist li')] as HTMLElement[];
      expect(items.length).toBe(6);
      expect(items.find(li => li.textContent!.includes('lectura completa'))?.classList.contains('ok')).toBe(true);
      expect(items.find(li => li.textContent!.includes('objetivo'))?.classList.contains('ok')).toBe(false);
      component.sideTab.set('preview');
      fixture.detectChanges();
      expect(el.querySelector('#side-panel-preview')).toBeTruthy();
      await flush();
    });
  });

  describe('tutorial', () => {
    const tutorial = () => fixture.nativeElement.querySelector('.tutorial-dialog') as HTMLElement | null;
    const flush = () => new Promise(r => setTimeout(r, 5));
    const blocks = () => [block('k1', 'keyframe', 'during', { text: 'uno' }), block('f1', 'full_story', 'after')];

    it('aparece la primera vez y no vuelve a aparecer una vez visto', async () => {
      await create(blocks());
      expect(tutorial()).toBeTruthy();
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      expect(localStorage.getItem(seenKey)).toBe('seen');
      fixture.destroy();
      TestBed.resetTestingModule();
      await create(blocks());
      expect(tutorial()).toBeNull();
    });

    it('Escape cierra el tutorial sin cerrar el compositor', async () => {
      await create(blocks());
      const closed = vi.fn();
      component.closed.subscribe(closed);
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      fixture.detectChanges();
      expect(tutorial()).toBeNull();
      expect(closed).not.toHaveBeenCalled();
    });

    it('«¿Cómo funciona esta plantilla?» lo reabre y al cerrar devuelve el foco al activador', async () => {
      localStorage.setItem(seenKey, 'seen');
      await create(blocks());
      const link = fixture.nativeElement.querySelector('.tutorial-link') as HTMLAnchorElement;
      expect(link.textContent).toContain('¿Cómo funciona esta plantilla?');
      document.body.appendChild(fixture.nativeElement);
      link.focus();
      link.click();
      fixture.detectChanges();
      await flush();
      expect(tutorial()).toBeTruthy();
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      fixture.detectChanges();
      await flush();
      expect(tutorial()).toBeNull();
      expect(document.activeElement).toBe(link);
    });
  });
});
