import { TestBed, ComponentFixture } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { signal } from '@angular/core';
import { of } from 'rxjs';
import { vi } from 'vitest';
import { LessonComposerComponent } from './lesson-composer.component';
import { ComposerSidePanelComponent } from './composer-side-panel.component';
import { InlineQuestionFormComponent } from './inline-question-form.component';
import { InlineVocabularyFormComponent } from './inline-vocabulary-form.component';
import { WhiteboardComponent } from './whiteboard/whiteboard.component';
import { tprsChecklist } from './tprs-checklist';
import { LessonBlock, LessonPlan, LessonPlanService } from '../../../core/services/lesson-plan.service';
import { AuthService } from '../../../core/services/auth.service';
import { QuestionService } from '../../../core/services/question.service';
import { VocabularyService } from '../../../core/services/vocabulary.service';
import { I18nService } from '../../../core/i18n/i18n.service';
import { TEACHER_COMPOSER_EN, TEACHER_COMPOSER_ES } from '../../../core/i18n/catalogs/teacher-composer';
import { EN } from '../../../core/i18n/catalogs/en';
import { ES } from '../../../core/i18n/catalogs/es';
import { Question, Vocabulary } from '../../../core/models/course.model';

const block = (blockKey: string, type: LessonBlock['type'], phase: LessonBlock['phase'], extra: Partial<LessonBlock> = {}): LessonBlock =>
  ({ blockKey, type, phase, active: true, required: false, ...extra });
const text = (f: ComponentFixture<unknown>) => (f.nativeElement as HTMLElement).textContent as string;
const placeholders = (message: unknown): string[] => {
  const all = typeof message === 'string' ? [message] : Object.values(message as Record<string, string>);
  return [...new Set(all.flatMap(m => [...m.matchAll(/\{(\w+)\}/g)].map(x => x[1])))].sort();
};

describe('compositor de lecciones: idioma', () => {
  const seenKey = 'spanishnow.lesson-tutorial.5.v1';
  let fixture: ComponentFixture<LessonComposerComponent>;
  let component: LessonComposerComponent;
  let i18n: I18nService;
  let api: { getDraft: any; saveDraft: any; reorder: any; publish: any };
  let createQuestion: any, createVocabulary: any, getQuestions: any, getVocabulary: any;
  let originalGetContext: any;

  function fakeContext(): any {
    const ctx: any = { canvas: null };
    for (const m of ['save', 'restore', 'beginPath', 'moveTo', 'lineTo', 'quadraticCurveTo', 'stroke', 'fill', 'arc', 'ellipse', 'rect', 'fillRect', 'clearRect', 'setTransform', 'drawImage']) ctx[m] = () => undefined;
    return ctx;
  }

  async function create(blocks: LessonBlock[]): Promise<void> {
    createQuestion = vi.fn((d: any) => of({ id: 99, ...d } as Question));
    createVocabulary = vi.fn((f: FormData) => of({ id: 55, unitId: 1, word: f.get('word'), translation: f.get('translation') } as Vocabulary));
    getQuestions = vi.fn(() => of([]));
    getVocabulary = vi.fn(() => of([]));
    const plan = (b: LessonBlock[]): LessonPlan => ({ id: 1, storyId: 7, revision: 1, status: 'draft', blocks: b });
    api = {
      getDraft: vi.fn(() => of(plan(blocks))),
      saveDraft: vi.fn((_s: number, _r: number, b: LessonBlock[]) => of(plan(b))),
      reorder: vi.fn(() => of(plan(blocks))),
      publish: vi.fn(() => of({ ...plan(blocks), status: 'published', revision: 2 }))
    };
    await TestBed.configureTestingModule({
      imports: [LessonComposerComponent],
      providers: [
        { provide: LessonPlanService, useValue: api },
        { provide: AuthService, useValue: { currentUser: signal({ id: 5 }) } },
        { provide: QuestionService, useValue: { getQuestionsByStory: getQuestions, createQuestion } },
        { provide: VocabularyService, useValue: { getVocabularyByUnit: getVocabulary, createVocabulary } }
      ]
    }).compileComponents();
    i18n = TestBed.inject(I18nService);
    i18n.setLocale('es');
    fixture = TestBed.createComponent(LessonComposerComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('story', { id: 7, unitId: 1, title: 'María en la Fiesta', text: 'texto', order: 1 });
    fixture.componentRef.setInput('unit', { id: 1, courseId: 1, title: 'Unidad 1: Saludos', order: 1 });
    fixture.componentRef.setInput('courseUnits', []);
    fixture.detectChanges();
    await new Promise(r => setTimeout(r, 5));
    fixture.detectChanges();
  }

  beforeEach(() => {
    localStorage.setItem(seenKey, 'seen');
    originalGetContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement) { const c = fakeContext(); c.canvas = this; return c; } as any;
  });
  afterEach(() => {
    localStorage.removeItem(seenKey);
    HTMLCanvasElement.prototype.getContext = originalGetContext;
    fixture?.destroy();
  });

  const switchTo = (locale: 'en' | 'es') => { i18n.setLocale(locale); fixture.detectChanges(); };

  it('el catálogo nuevo tiene las mismas claves y parámetros en EN y ES, sin duplicados ni claves ajenas', () => {
    const en = Object.keys(TEACHER_COMPOSER_EN); const es = Object.keys(TEACHER_COMPOSER_ES);
    expect(en.length).toBeGreaterThan(300);
    expect([...en].sort()).toEqual([...es].sort());
    expect(new Set(en).size).toBe(en.length);
    expect(en.every(key => key.startsWith('teacherComposer.'))).toBe(true);
    for (const key of en) {
      expect(Object.hasOwn(EN, key) && Object.hasOwn(ES, key)).toBe(true);
      const e = (TEACHER_COMPOSER_EN as Record<string, unknown>)[key], s = (TEACHER_COMPOSER_ES as Record<string, unknown>)[key];
      expect(JSON.stringify(e)).not.toBe('""');
      expect(JSON.stringify(s)).not.toBe('""');
      expect(placeholders(e), key).toEqual(placeholders(s));
    }
  });

  it('el chequeo TPRS usa el traductor recibido y por defecto el español', () => {
    i18n = TestBed.inject(I18nService);
    i18n.setLocale('es');
    const input = { blocks: [block('k1', 'keyframe', 'during', { text: 'Luis llega a casa hoy' })], vocabulary: [], questions: [] };
    expect(tprsChecklist(input)[0].label).toContain('expresiones objetivo');
    expect(tprsChecklist(input, (key, params) => i18n.t(key, params)).find(i => i.id === 'keyframes')!.hint).toContain('2 o más fragmentos');
    i18n.setLocale('en');
    expect(tprsChecklist(input, (key, params) => i18n.t(key, params)).find(i => i.id === 'keyframes')!.hint).toContain('2 or more passages');
  });

  describe('render', () => {
    beforeEach(async () => {
      await create([
        block('e1', 'expression', 'before'),
        block('k1', 'keyframe', 'during', { text: 'María llega a la fiesta y busca a su amiga.' }),
        block('q1', 'question', 'during', { questionId: null, contextBlockKey: 'k1' }),
        block('f1', 'full_story', 'after')
      ]);
    });

    it('compositor: fases, botones, pie y textos cambian de idioma; el contenido docente no se traduce', () => {
      const t = text(fixture);
      expect(t).toContain('Lección: María en la Fiesta'); expect(t).toContain('Más adelante'); expect(t).toContain('Guardar borrador');
      expect(t).toContain('Publicar'); expect(t).toContain('Fragmento narrativo'); expect(t).toContain('Aún no hay bloques.');
      expect(fixture.nativeElement.querySelector('.composer-dialog').getAttribute('aria-label')).toBe('Compositor de lección: María en la Fiesta');
      switchTo('en');
      const e = text(fixture);
      expect(e).toContain('Lesson: María en la Fiesta'); expect(e).toContain('Later'); expect(e).toContain('Save draft');
      expect(e).toContain('Publish'); expect(e).toContain('Story passage'); expect(e).toContain('No blocks yet.');
      expect(e).toContain('Draft · revision 1'); expect(e).not.toContain('Guardar');
      expect(e).toContain('María llega a la fiesta y busca a su amiga.');
      expect(fixture.nativeElement.querySelector('.composer-dialog').getAttribute('aria-label')).toBe('Lesson composer: María en la Fiesta');
      expect(fixture.nativeElement.querySelector('[aria-label="Move Keyframe up"]')).toBeTruthy();
      expect((fixture.nativeElement.querySelector('textarea') as HTMLTextAreaElement).placeholder).toBe('Write a meaningful passage');
      expect(api.getDraft).toHaveBeenCalledTimes(1); expect(api.saveDraft).not.toHaveBeenCalled();
    });

    it('panel lateral: pestañas, historia, chequeo TPRS y vista previa en ambos idiomas', () => {
      const panel = fixture.debugElement.query(By.directive(ComposerSidePanelComponent)).nativeElement as HTMLElement;
      expect(panel.textContent).toContain('La historia hasta ahora'); expect(panel.textContent).toContain('Chequeo TPRS');
      component.sideTab.set('tprs'); fixture.detectChanges();
      expect(panel.textContent).toContain('Una lectura completa'); expect(panel.textContent).toContain('Orientativo');
      switchTo('en');
      expect(panel.textContent).toContain('The story so far'); expect(panel.textContent).toContain('TPRS check');
      expect(panel.textContent).toContain('One full reading'); expect(panel.textContent).toContain('Indicative only');
      expect(panel.textContent).toContain('2–3 target expressions that appear in the text');
      expect(panel.textContent).toContain('1 reading'); expect(panel.textContent).toContain('met');
      component.sideTab.set('preview'); fixture.detectChanges();
      expect(panel.textContent).toContain('This is how the active blocks appear'); expect(panel.textContent).toContain('Joined reading');
      expect(panel.querySelector('[aria-label="Go to block: Keyframe"]')).toBeTruthy();
      switchTo('es');
      expect(panel.textContent).toContain('Así aparecen los bloques activos'); expect(panel.textContent).toContain('Lectura reunida');
      expect(panel.querySelector('[aria-label="Ir al bloque: Keyframe"]')).toBeTruthy();
    });

    it('tutorial: se traduce en vivo sin tocar el borrador', () => {
      component.openTutorial(); fixture.detectChanges();
      expect(text(fixture)).toContain('Cómo construir una lección con historias');
      switchTo('en');
      expect(text(fixture)).toContain('How to build a lesson with stories'); expect(text(fixture)).toContain('Use template');
      expect(text(fixture)).toContain('“María en la Fiesta”');
      expect(component.showTutorial()).toBe(true); expect(component.dirty()).toBe(false);
    });

    it('un error de publicación guardado como clave se traduce al leer, sin repetir peticiones', async () => {
      component.updateBlock('k1', { text: '' });
      await component.publish();
      fixture.detectChanges();
      expect(component.error()).toBe('Añade al menos un keyframe activo con texto.');
      switchTo('en');
      expect(component.error()).toBe('Add at least one active keyframe with text.');
      expect(fixture.nativeElement.querySelector('.feedback.error').textContent).toContain('Add at least one active keyframe');
      expect(api.saveDraft).not.toHaveBeenCalled(); expect(api.publish).not.toHaveBeenCalled();
    });

    it('el aviso de guardado y el anuncio de reordenación siguen el idioma activo', async () => {
      expect(await component.save()).toBe(true); fixture.detectChanges();
      expect(component.notice()).toBe('Borrador guardado.');
      switchTo('en');
      expect(component.notice()).toBe('Draft saved.');
      expect(api.saveDraft).toHaveBeenCalledTimes(1);
    });

    it('formulario de pregunta abierto: conserva borrador, tipo y estado abierto al cambiar de idioma', async () => {
      component.toggleNewQuestion('q1'); fixture.detectChanges(); await fixture.whenStable();
      const formEl = fixture.debugElement.query(By.directive(InlineQuestionFormComponent));
      const form = formEl.componentInstance as InlineQuestionFormComponent;
      const area = formEl.nativeElement.querySelector('textarea') as HTMLTextAreaElement;
      area.value = '¿María está contenta?'; area.dispatchEvent(new Event('input')); fixture.detectChanges();
      form.setType('choice'); form.optionA.set('Sí'); form.optionB.set('sí'); form.correct.set('1'); fixture.detectChanges();
      expect(form.validation()).toBe('Las dos opciones deben ser distintas.');
      expect(formEl.nativeElement.textContent).toContain('Dos opciones'); expect(area.placeholder).toBe('Ej: ¿María está en la fiesta?');
      switchTo('en');
      expect(fixture.debugElement.query(By.directive(InlineQuestionFormComponent)).componentInstance).toBe(form);
      expect(formEl.nativeElement.querySelector('textarea')).toBe(area);
      expect(area.value).toBe('¿María está contenta?'); expect(form.text()).toBe('¿María está contenta?');
      expect(form.type()).toBe('choice'); expect(form.optionA()).toBe('Sí'); expect(form.correct()).toBe('1');
      expect(component.newQuestionFor()).toBe('q1');
      expect(form.validation()).toBe('The two options must be different.');
      expect(formEl.nativeElement.textContent).toContain('Two options'); expect(formEl.nativeElement.textContent).toContain('Save question');
      expect(area.placeholder).toBe('E.g. ¿María está en la fiesta?');
      expect(createQuestion).not.toHaveBeenCalled(); expect(api.saveDraft).not.toHaveBeenCalled(); expect(getQuestions).toHaveBeenCalledTimes(1);
    });

    it('el error de envío del formulario de pregunta se traduce en vivo', async () => {
      component.toggleNewQuestion('q1'); fixture.detectChanges();
      const form = fixture.debugElement.query(By.directive(InlineQuestionFormComponent)).componentInstance as InlineQuestionFormComponent;
      await form.submit(); fixture.detectChanges();
      expect(form.error()).toBe('Escribe la pregunta.');
      switchTo('en');
      expect(form.error()).toBe('Write the question.');
      expect(createQuestion).not.toHaveBeenCalled();
    });

    it('formulario de expresión abierto: conserva el borrador y la coincidencia con vocabulario existente', async () => {
      component.toggleNewExpression('e1'); fixture.detectChanges(); await fixture.whenStable();
      const formEl = fixture.debugElement.query(By.directive(InlineVocabularyFormComponent));
      const form = formEl.componentInstance as InlineVocabularyFormComponent;
      const word = formEl.nativeElement.querySelector('input[name=word]') as HTMLInputElement;
      word.value = 'me llamo'; word.dispatchEvent(new Event('input')); form.translation.set('my name is'); fixture.detectChanges();
      expect(formEl.nativeElement.textContent).toContain('Imagen (opcional)'); expect(formEl.nativeElement.textContent).toContain('Guardar expresión');
      switchTo('en');
      expect(fixture.debugElement.query(By.directive(InlineVocabularyFormComponent)).componentInstance).toBe(form);
      expect(formEl.nativeElement.querySelector('input[name=word]')).toBe(word);
      expect(word.value).toBe('me llamo'); expect(form.translation()).toBe('my name is');
      expect(component.newExpressionFor()).toBe('e1');
      expect(formEl.nativeElement.textContent).toContain('Image (optional)'); expect(formEl.nativeElement.textContent).toContain('Save expression');
      expect(createVocabulary).not.toHaveBeenCalled(); expect(getVocabulary).toHaveBeenCalledTimes(1);
    });

    it('el error de archivo de imagen del formulario de expresión se traduce y conserva el resto', () => {
      component.toggleNewExpression('e1'); fixture.detectChanges();
      const form = fixture.debugElement.query(By.directive(InlineVocabularyFormComponent)).componentInstance as InlineVocabularyFormComponent;
      form.word.set('hola');
      const input = { files: [new File(['x'], 'a.svg', { type: 'image/svg+xml' })], value: 'x' } as unknown as HTMLInputElement;
      form.onImageFile({ target: input } as unknown as Event);
      expect(form.error()).toContain('PNG');
      switchTo('en');
      expect(form.error()).toContain('PNG, JPG, WebP or GIF');
      expect(form.word()).toBe('hola');
    });

    it('pizarra con trazos: cambia de idioma sin perder el dibujo ni el estado, y sin nuevas peticiones', async () => {
      const pending = component.whiteboard.open({ backgroundUrl: null, titleKey: 'teacherComposer.wb.titleIllustration' });
      fixture.detectChanges();
      const wbEl = fixture.debugElement.query(By.directive(WhiteboardComponent));
      const board = wbEl.componentInstance as WhiteboardComponent;
      const live = wbEl.nativeElement.querySelector('canvas.wb-live') as HTMLCanvasElement;
      live.getBoundingClientRect = () => ({ left: 0, top: 0, width: 600, height: 450, right: 600, bottom: 450, x: 0, y: 0, toJSON: () => ({}) });
      const pointer = (type: string, x: number, y: number) => {
        const ev: any = new MouseEvent(type, { clientX: x, clientY: y, bubbles: true, cancelable: true });
        ev.pointerId = 1; ev.pointerType = 'mouse'; ev.pressure = 0.5; live.dispatchEvent(ev);
      };
      pointer('pointerdown', 10, 10); pointer('pointermove', 100, 80); pointer('pointermove', 200, 120); pointer('pointerup', 200, 120);
      fixture.detectChanges();
      board.tool.set('rect'); board.askClear(); fixture.detectChanges();
      expect(board.hasStrokes()).toBe(true);
      expect(wbEl.nativeElement.querySelector('h2').textContent).toBe('Dibujar ilustración');
      expect(wbEl.nativeElement.textContent).toContain('¿Borrar todo el dibujo?');
      expect(wbEl.nativeElement.querySelector('button[aria-label^="Rectángulo"]')).toBeTruthy();
      switchTo('en');
      expect(fixture.debugElement.query(By.directive(WhiteboardComponent)).componentInstance).toBe(board);
      expect(board.hasStrokes()).toBe(true); expect(board.tool()).toBe('rect'); expect(board.confirm()).toBe('clear');
      expect(wbEl.nativeElement.querySelector('h2').textContent).toBe('Draw illustration');
      expect(wbEl.nativeElement.textContent).toContain('Clear the whole drawing?');
      expect(wbEl.nativeElement.textContent).toContain('Use as illustration');
      expect(wbEl.nativeElement.querySelector('button[aria-label^="Rectangle"]')).toBeTruthy();
      expect(wbEl.nativeElement.querySelector('button[aria-label^="Thickness 1 of"]')).toBeTruthy();
      expect(api.getDraft).toHaveBeenCalledTimes(1); expect(api.saveDraft).not.toHaveBeenCalled();
      component.whiteboard.finish(null);
      expect(await pending).toBeNull();
    });

    it('cambiar de idioma con todo abierto no marca el borrador como modificado ni dispara guardados', () => {
      component.toggleNewQuestion('q1'); component.toggleNewExpression('e1'); fixture.detectChanges();
      expect(component.dirty()).toBe(false);
      switchTo('en'); switchTo('es'); switchTo('en');
      expect(component.dirty()).toBe(false);
      expect(api.saveDraft).not.toHaveBeenCalled(); expect(api.reorder).not.toHaveBeenCalled(); expect(api.publish).not.toHaveBeenCalled();
      expect(api.getDraft).toHaveBeenCalledTimes(1);
    });
  });
});
