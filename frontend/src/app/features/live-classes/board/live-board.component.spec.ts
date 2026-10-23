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
    fixture.detectChanges(); return { fixture, c: fixture.componentInstance, emit: vi.spyOn(fixture.componentInstance.change, 'emit') };
  }
  it('renders teacher text as text, not markup', () => {
    const { fixture } = create(); fixture.componentRef.setInput('page', { ...page, elements: [{ ...e, text: '<script>alert(1)</script>' }] }); fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('script')).toBeNull(); expect(fixture.nativeElement.textContent).toContain('<script>');
  });
  it('students can edit their own text; changes carry the expected object version', () => {
    const { c, emit } = create(); c.selectedId.set(e.id); c.editingText.set('Nuevo texto'); c.saveText();
    expect(emit).toHaveBeenCalledWith(expect.objectContaining({ type: 'put', expectedVersion: 1, pageId: page.id, element: expect.objectContaining({ text: 'Nuevo texto' }) }));
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
    svg.getBoundingClientRect = () => ({ left: 0, top: 0, width: 1600, height: 900 });
    const ev = { currentTarget: svg, target: svg, pointerId: 1, pointerType: 'mouse', button: 0, clientX: 100, clientY: 100, preventDefault() {} } as unknown as PointerEvent;
    c.pointerDown(ev);
    fixture.componentRef.setInput('page', { ...page, id: 'page_0002' }); fixture.detectChanges();
    c.pointerUp({ ...ev, clientX: 200, clientY: 200 });
    expect(emit).not.toHaveBeenCalled(); expect(c.drawing()).toBeNull();
  });
  it('the hand tool cannot accidentally select, move or draw objects', () => {
    const { c, fixture, emit } = create();
    fixture.componentRef.setInput('panning', true); fixture.componentRef.setInput('tool', 'note'); fixture.detectChanges();
    const svg = fixture.nativeElement.querySelector('svg.live-canvas');
    c.pointerDown({ currentTarget: svg, target: svg, pointerId: 1, pointerType: 'mouse', button: 0 } as PointerEvent);
    expect(emit).not.toHaveBeenCalled(); expect(c.drawing()).toBeNull(); expect(c.selectedId()).toBeNull();
  });
  it.each([400, 800])('drawing at a rendered width of %i px keeps the same board coordinates', width => {
    const { c, fixture, emit } = create();
    const svg = fixture.nativeElement.querySelector('svg.live-canvas');
    svg.getBoundingClientRect = () => ({ left: 0, top: 0, width, height: width * 9 / 16 });
    const ev = { currentTarget: svg, target: svg, pointerId: 1, pointerType: 'mouse', button: 0, clientX: width / 2, clientY: width * 9 / 32, preventDefault() {} } as unknown as PointerEvent;
    c.pointerDown(ev); c.pointerUp(ev);
    expect(emit).toHaveBeenCalledWith(expect.objectContaining({ element: expect.objectContaining({ points: [{ x: 800, y: 450 }] }) }));
  });
});
