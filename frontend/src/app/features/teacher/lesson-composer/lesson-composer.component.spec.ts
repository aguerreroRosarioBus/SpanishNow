import { TestBed, ComponentFixture } from '@angular/core/testing';
import { of } from 'rxjs';
import { signal } from '@angular/core';
import { LessonComposerComponent } from './lesson-composer.component';
import { LessonBlock, LessonPlan, LessonPlanService } from '../../../core/services/lesson-plan.service';
import { AuthService } from '../../../core/services/auth.service';
import { QuestionService } from '../../../core/services/question.service';
import { VocabularyService } from '../../../core/services/vocabulary.service';

const block = (blockKey: string, type: LessonBlock['type'], phase: LessonBlock['phase'], extra: Partial<LessonBlock> = {}): LessonBlock =>
  ({ blockKey, type, phase, active: true, required: false, ...extra });

const makePlan = (blocks: LessonBlock[]): LessonPlan => ({ id: 1, storyId: 7, revision: 1, status: 'draft', blocks });

describe('LessonComposerComponent', () => {
  let fixture: ComponentFixture<LessonComposerComponent>;
  let component: LessonComposerComponent;
  let api: { getDraft: any; saveDraft: any; reorder: any; publish: any };
  const seenKey = 'spanishnow.lesson-tutorial.5.v1';

  async function create(blocks: LessonBlock[]): Promise<void> {
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
        { provide: QuestionService, useValue: { getQuestionsByStory: () => of([]) } },
        { provide: VocabularyService, useValue: { getVocabularyByUnit: () => of([]) } },
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
