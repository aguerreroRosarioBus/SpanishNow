import { I18nService } from '../../../core/i18n/i18n.service';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ComposerSidePanelComponent } from './composer-side-panel.component';
import { LessonBlock } from '../../../core/services/lesson-plan.service';
import { canAutoScroll, nearestScrollTop } from './scroll-sync';

const block = (blockKey: string, type: LessonBlock['type'], phase: LessonBlock['phase'], extra: Partial<LessonBlock> = {}): LessonBlock =>
  ({ blockKey, type, phase, active: true, required: false, ...extra });

describe('ComposerSidePanelComponent: sincronía de posición', () => {
  let fixture: ComponentFixture<ComposerSidePanelComponent>;
  let component: ComposerSidePanelComponent;
  let scrollTo: ReturnType<typeof vi.fn>;
  let rects: { container: Partial<DOMRect>; item: Partial<DOMRect> };

  const setReducedMotion = (reduced: boolean) => {
    window.matchMedia = ((q: string) => ({ matches: reduced && q.includes('reduce'), media: q, addEventListener() {}, removeEventListener() {} })) as any;
  };
  const el = (sel: string) => fixture.nativeElement.querySelector(sel) as HTMLElement;

  beforeEach(() => {
    setReducedMotion(false);
    TestBed.inject(I18nService).setLocale('es');
    fixture = TestBed.createComponent(ComposerSidePanelComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('blocks', [
      block('k1', 'keyframe', 'during', { text: 'uno' }),
      block('q1', 'question', 'during', { questionId: 1, contextBlockKey: 'k1', text: 'Pregunta' }),
      block('k2', 'keyframe', 'during', { text: 'dos' }),
    ]);
    fixture.detectChanges();
    scrollTo = vi.fn();
    rects = { container: { top: 0, bottom: 100, height: 100 }, item: { top: 150, bottom: 180, height: 30 } };
    el('.side-panel').scrollTo = scrollTo as any;
    el('.side-panel').getBoundingClientRect = () => rects.container as DOMRect;
  });

  const activate = (key: string, tab: 'story' | 'preview' = 'story') => {
    fixture.componentRef.setInput('tab', tab);
    fixture.componentRef.setInput('activeBlockKey', key);
    fixture.detectChanges();
    const item = el('[aria-current="true"]');
    if (item) item.getBoundingClientRect = () => rects.item as DOMRect;
    return item;
  };

  describe('resaltado', () => {
    it('resalta el párrafo del keyframe activo con aria-current', () => {
      activate('k2');
      expect(el('.story-par[data-block-key="k2"]').getAttribute('aria-current')).toBe('true');
      expect(el('.story-par[data-block-key="k2"]').classList.contains('is-active')).toBe(true);
      expect(el('.story-par[data-block-key="k1"]').getAttribute('aria-current')).toBeNull();
    });
    it('si el bloque activo es una pregunta, resalta su keyframe de contexto', () => {
      activate('q1');
      expect(el('.story-par[data-block-key="k1"]').getAttribute('aria-current')).toBe('true');
      expect(el('[aria-current="true"]')).toBe(el('.story-par[data-block-key="k1"]'));
    });
    it('en la vista previa resalta el item del bloque activo', () => {
      activate('q1', 'preview');
      expect(el('.preview-item[data-block-key="q1"]').getAttribute('aria-current')).toBe('true');
      expect(el('.preview-item[data-block-key="k1"]').getAttribute('aria-current')).toBeNull();
    });
    it('Chequeo TPRS no tiene resaltado ni scroll', () => {
      activate('k1', 'preview');
      fixture.componentRef.setInput('tab', 'tprs'); fixture.detectChanges();
      scrollTo.mockClear();
      component.revealActive();
      expect(el('[aria-current="true"]')).toBeNull();
      expect(scrollTo).not.toHaveBeenCalled();
    });
  });

  describe('auto-scroll del contenedor del panel', () => {
    it('desplaza (smooth, nearest) solo si el item no es totalmente visible', () => {
      activate('k2');
      component.revealActive();
      expect(scrollTo).toHaveBeenCalledWith({ top: 80, behavior: 'smooth' });
      scrollTo.mockClear();
      rects.item = { top: 10, bottom: 40, height: 30 };
      component.revealActive();
      expect(scrollTo).not.toHaveBeenCalled();
    });
    it('usa behavior auto con prefers-reduced-motion', () => {
      setReducedMotion(true);
      activate('k2');
      component.revealActive();
      expect(scrollTo).toHaveBeenCalledWith({ top: 80, behavior: 'auto' });
    });
    it('no desplaza con el puntero sobre el panel, pero sí resalta; reanuda al salir', () => {
      el('.side-panel').dispatchEvent(new MouseEvent('mouseenter'));
      activate('k2');
      component.revealActive();
      expect(scrollTo).not.toHaveBeenCalled();
      expect(el('[aria-current="true"]')).not.toBeNull();
      el('.side-panel').dispatchEvent(new MouseEvent('mouseleave'));
      component.revealActive();
      expect(scrollTo).toHaveBeenCalledTimes(1);
    });
    it('no desplaza tras un scroll manual reciente (rueda) y reanuda pasados 2 s', () => {
      vi.useFakeTimers();
      try {
        activate('k2');
        el('.side-panel').dispatchEvent(new Event('wheel'));
        component.revealActive();
        expect(scrollTo).not.toHaveBeenCalled();
        vi.advanceTimersByTime(2100);
        component.revealActive();
        expect(scrollTo).toHaveBeenCalledTimes(1);
      } finally { vi.useRealTimers(); }
    });
    it('distingue nuestro scroll programático del manual', () => {
      activate('k2');
      component.revealActive(); // marca ventana programática
      el('.side-panel').dispatchEvent(new Event('scroll'));
      scrollTo.mockClear();
      component.revealActive();
      expect(scrollTo).toHaveBeenCalledTimes(1);
    });
  });

  describe('clic para navegar', () => {
    it('clic en un párrafo de la historia emite navigate con su blockKey', () => {
      const spy = vi.fn(); component.navigate.subscribe(spy);
      el('.story-par[data-block-key="k2"]').click();
      expect(spy).toHaveBeenCalledWith('k2');
    });
    it('clic en el item o en su botón de tipo navega; los controles internos no', () => {
      fixture.componentRef.setInput('tab', 'preview'); fixture.detectChanges();
      const spy = vi.fn(); component.navigate.subscribe(spy);
      el('.preview-item[data-block-key="k1"] p').click();
      expect(spy).toHaveBeenCalledTimes(1);
      (el('.preview-item[data-block-key="k1"] .goto')).click();
      expect(spy).toHaveBeenCalledTimes(2);
      spy.mockClear();
      el('.preview-item[data-block-key="q1"] .text-button').click(); // Simular respuesta incorrecta
      fixture.detectChanges();
      expect(spy).not.toHaveBeenCalled();
      expect(el('.wrong-answer')).not.toBeNull();
    });
  });
});

describe('scroll-sync', () => {
  it('canAutoScroll respeta puntero y ventana de 2 s', () => {
    expect(canAutoScroll(false, -Infinity, 10)).toBe(true);
    expect(canAutoScroll(true, -Infinity, 10)).toBe(false);
    expect(canAutoScroll(false, 9000, 10000)).toBe(false);
    expect(canAutoScroll(false, 7000, 10000)).toBe(true);
  });
  it('nearestScrollTop sube o baja lo justo', () => {
    const c = document.createElement('div'), i = document.createElement('div');
    c.getBoundingClientRect = () => ({ top: 100, bottom: 200, height: 100 }) as DOMRect;
    Object.defineProperty(c, 'scrollTop', { value: 50 });
    i.getBoundingClientRect = () => ({ top: 60, bottom: 90, height: 30 }) as DOMRect;
    expect(nearestScrollTop(c, i)).toBe(10);
    i.getBoundingClientRect = () => ({ top: 190, bottom: 230, height: 40 }) as DOMRect;
    expect(nearestScrollTop(c, i)).toBe(80);
    i.getBoundingClientRect = () => ({ top: 120, bottom: 150, height: 30 }) as DOMRect;
    expect(nearestScrollTop(c, i)).toBeNull();
  });
});
