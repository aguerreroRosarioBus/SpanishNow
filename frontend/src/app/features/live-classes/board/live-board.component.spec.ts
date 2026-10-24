import { TestBed } from '@angular/core/testing';
import { I18nService } from '../../../core/i18n/i18n.service';
import { LiveBoardComponent } from './live-board.component';
import { BoardElement, BoardPage } from '../../../core/models/live-class.model';
const e: BoardElement = { id: 'element_001', type: 'note', x: 100, y: 100, w: 280, h: 220, color: '#fff2a8', width: 4, text: 'Hola', authorId: 7, version: 1 };
const page: BoardPage = { id: 'page_0001', title: 'Página 1', background: 'plain', elements: [e] };
describe('LiveBoardComponent', () => {
  function create(owner = false, userId = 7, editable = true) {
    TestBed.configureTestingModule({ imports: [LiveBoardComponent] });
    TestBed.inject(I18nService).setLocale('es');
    const fixture = TestBed.createComponent(LiveBoardComponent);
    fixture.componentRef.setInput('page', structuredClone(page)); fixture.componentRef.setInput('userId', userId);
    fixture.componentRef.setInput('owner', owner); fixture.componentRef.setInput('editable', editable);
    fixture.detectChanges();
    fixture.nativeElement.querySelector('svg.live-canvas').hasPointerCapture = () => false;
    return { fixture, c: fixture.componentInstance, emit: vi.spyOn(fixture.componentInstance.boardChange, 'emit') };
  }
  it('renders teacher text as text, not markup', () => {
    const { fixture } = create(); fixture.componentRef.setInput('page', { ...page, elements: [{ ...e, text: '<script>alert(1)</script>' }] }); fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('script')).toBeNull(); expect(fixture.nativeElement.textContent).toContain('<script>');
  });
  it('students can edit their own text; changes carry the expected object version', () => {
    const { c, emit } = create(); c.selectedId.set(e.id); c.editingText.set('Nuevo texto'); c.saveText();
    expect(emit).toHaveBeenCalledWith(expect.objectContaining({ type: 'put', expectedVersion: 1, pageId: page.id, element: expect.objectContaining({ text: 'Nuevo texto' }) }));
  });
  it('opens text on a click and writes directly in its canvas block', () => {
    const { c, fixture } = create();
    fixture.componentRef.setInput('tool', 'select'); fixture.detectChanges();
    const svg = fixture.nativeElement.querySelector('svg.live-canvas') as SVGSVGElement;
    const object = fixture.nativeElement.querySelector(`[data-element="${e.id}"]`) as Element;
    svg.getBoundingClientRect = () => ({ left: 0, top: 0, width: 3200, height: 1800 }) as DOMRect;
    const pointer = { currentTarget: svg, target: object, pointerId: 3, pointerType: 'mouse', button: 0, clientX: 900, clientY: 550, preventDefault() {} } as unknown as PointerEvent;
    c.pointerDown(pointer); c.pointerUp(pointer); fixture.detectChanges();
    expect(c.editingText()).toBe('Hola');
    const editor = fixture.nativeElement.querySelector('[data-text-editor]') as HTMLTextAreaElement;
    expect(editor).not.toBeNull(); expect(editor.value).toBe('Hola');
  });
  it('applies font and text color while preserving the current inline draft', () => {
    const text = { ...e, type: 'text' as const, textColor: '#2b2b2b' };
    const { c, fixture, emit } = create(); fixture.componentRef.setInput('page', { ...page, elements: [text] }); fixture.detectChanges(); c.selectedId.set(e.id); c.editingText.set('Draft');
    c.changeFontFamily({ target: { value: 'Georgia' } } as unknown as Event);
    expect(emit).toHaveBeenCalledWith(expect.objectContaining({ element: expect.objectContaining({ fontFamily: 'Georgia', text: 'Draft', version: 1 }) }));
    c.recolorSelected('#2f6f9f');
    expect(emit).toHaveBeenLastCalledWith(expect.objectContaining({ element: expect.objectContaining({ textColor: '#2f6f9f', text: 'Draft' }) }));
  });
  it('students cannot edit another participant object, but the teacher can', () => {
    const { c, fixture, emit } = create(false, 8); c.selectedId.set(e.id); c.editingText.set('Ajeno'); c.saveText(); c.remove();
    expect(emit).not.toHaveBeenCalled(); expect(c.deleting()).toBeNull();
    fixture.componentRef.setInput('owner', true); fixture.detectChanges(); c.saveText(); expect(emit).toHaveBeenCalledTimes(1);
  });
  it('deletion asks confirmation and preserves the selected object version', () => {
    const { c, emit } = create(); c.selectedId.set(e.id); c.remove();
    expect(emit).not.toHaveBeenCalled(); expect(c.deleting()?.id).toBe(e.id);
    c.confirmRemove(); expect(emit).toHaveBeenCalledWith(expect.objectContaining({ type: 'delete', expectedVersion: 1, elementId: e.id }));
  });
  it('locking editing prevents text, resize and delete actions', () => {
    const { c, emit } = create(true, 7, false); c.selectedId.set(e.id); c.editingText.set('Texto'); c.saveText(); c.remove(); c.resize(2);
    expect(emit).not.toHaveBeenCalled();
  });
  it('a teacher page change cancels a stroke instead of placing it on the new page', () => {
    const { c, fixture, emit } = create();
    const svg = fixture.nativeElement.querySelector('svg.live-canvas');
    svg.getBoundingClientRect = () => ({ left: 0, top: 0, width: 3200, height: 1800 });
    const ev = { currentTarget: svg, target: svg, pointerId: 1, pointerType: 'mouse', button: 0, clientX: 100, clientY: 100, preventDefault() {} } as unknown as PointerEvent;
    c.pointerDown(ev);
    fixture.componentRef.setInput('page', { ...page, id: 'page_0002' }); fixture.detectChanges();
    c.pointerUp({ ...ev, clientX: 200, clientY: 200 });
    expect(emit).not.toHaveBeenCalled(); expect(c.drafts()).toEqual([]);
  });
  it('the hand tool cannot accidentally select, move or draw objects', () => {
    const { c, fixture, emit } = create();
    fixture.componentRef.setInput('panning', true); fixture.componentRef.setInput('tool', 'note'); fixture.detectChanges();
    const svg = fixture.nativeElement.querySelector('svg.live-canvas');
    c.pointerDown({ currentTarget: svg, target: svg, pointerId: 1, pointerType: 'mouse', button: 0 } as PointerEvent);
    expect(emit).not.toHaveBeenCalled(); expect(c.drafts()).toEqual([]); expect(c.selectedId()).toBeNull();
  });
  it.each([400, 800])('drawing at a rendered width of %i px keeps the same board coordinates', width => {
    const { c, fixture, emit } = create();
    const svg = fixture.nativeElement.querySelector('svg.live-canvas');
    svg.getBoundingClientRect = () => ({ left: 0, top: 0, width, height: width * 9 / 16 });
    const ev = { currentTarget: svg, target: svg, pointerId: 1, pointerType: 'mouse', button: 0, clientX: width / 2, clientY: width * 9 / 32, preventDefault() {} } as unknown as PointerEvent;
    c.pointerDown(ev); c.pointerUp(ev);
    expect(emit).toHaveBeenCalledWith(expect.objectContaining({ element: expect.objectContaining({ points: [{ x: 800, y: 450 }] }) }));
  });
  it('supports touch marquee selection and group movement without Shift', () => {
    const second = { ...e, id: 'element_002', x: 500, y: 300, w: 120, h: 100 };
    const { c, fixture, emit } = create();
    fixture.componentRef.setInput('tool', 'select');
    fixture.componentRef.setInput('page', { ...page, elements: [e, second] }); fixture.detectChanges();
    const svg = fixture.nativeElement.querySelector('svg.live-canvas');
    svg.getBoundingClientRect = () => ({ left: 0, top: 0, width: 3200, height: 1800 });
    const pointer = (target: Element, x: number, y: number) => ({ currentTarget: svg, target, pointerId: 8, pointerType: 'touch', button: 0, clientX: x + 800, clientY: y + 450, preventDefault() {} } as unknown as PointerEvent);
    c.pointerDown(pointer(svg, 50, 50));
    c.pointerMove(pointer(svg, 700, 450)); expect(c.marquee()).toEqual({ x: 50, y: 50, w: 650, h: 400 }); c.pointerUp(pointer(svg, 700, 450));
    expect(c.selectedIds()).toEqual([e.id, second.id]); expect(emit).not.toHaveBeenCalled();
    const object = fixture.nativeElement.querySelector(`[data-element="${e.id}"]`);
    c.pointerDown(pointer(object, e.x + 20, e.y + 20)); c.pointerMove(pointer(object, e.x + 50, e.y + 70)); c.pointerUp(pointer(object, e.x + 50, e.y + 70));
    expect(emit).toHaveBeenCalledWith(expect.arrayContaining([
      expect.objectContaining({ type: 'put', expectedVersion: 1, element: expect.objectContaining({ id: e.id, x: 130, y: 150 }) }),
      expect.objectContaining({ type: 'put', expectedVersion: 1, element: expect.objectContaining({ id: second.id, x: 530, y: 350 }) })
    ]));
  });
  it('resizes a multi-selection from a corner handle on a touch pointer', () => {
    const second = { ...e, id: 'element_002', x: 500, y: 300, w: 120, h: 100 };
    const { c, fixture, emit } = create();
    fixture.componentRef.setInput('tool', 'select');
    fixture.componentRef.setInput('page', { ...page, elements: [e, second] }); fixture.detectChanges();
    c.selectedIds.set([e.id, second.id]); c.selectedId.set(second.id); fixture.detectChanges();
    const svg = fixture.nativeElement.querySelector('svg.live-canvas');
    svg.getBoundingClientRect = () => ({ left: 0, top: 0, width: 3200, height: 1800 });
    const handle = fixture.nativeElement.querySelector('[data-handle="se"]');
    const pointer = (target: Element, x: number, y: number) => ({ currentTarget: svg, target, pointerId: 9, pointerType: 'touch', button: 0, clientX: x + 800, clientY: y + 450, preventDefault() {} } as unknown as PointerEvent);
    c.pointerDown(pointer(handle, 625, 405));
    c.pointerMove(pointer(handle, 875, 605)); c.pointerUp(pointer(handle, 875, 605));
    expect(emit).toHaveBeenCalledTimes(1);
    const operations = emit.mock.calls[0][0] as any[];
    expect(operations).toHaveLength(2); expect(operations.every(op => op.type === 'put')).toBe(true);
    expect(operations[0].element.w).toBeGreaterThan(e.w);
  });
});
