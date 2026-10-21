import { ComponentFixture, TestBed } from '@angular/core/testing';
import { WhiteboardComponent } from './whiteboard.component';

function fakeContext(): any {
  const ctx: any = { canvas: null };
  for (const m of ['save', 'restore', 'beginPath', 'moveTo', 'lineTo', 'quadraticCurveTo', 'stroke', 'fill', 'arc', 'ellipse', 'rect', 'fillRect', 'clearRect', 'setTransform', 'drawImage']) ctx[m] = () => undefined;
  return ctx;
}

describe('WhiteboardComponent', () => {
  let fixture: ComponentFixture<WhiteboardComponent>;
  let component: WhiteboardComponent;
  let done: File[];
  let cancelled: number;
  let originalGetContext: any;
  let originalToBlob: any;

  function setup(backgroundUrl: string | null = null): void {
    TestBed.configureTestingModule({ imports: [WhiteboardComponent] });
    fixture = TestBed.createComponent(WhiteboardComponent);
    component = fixture.componentInstance;
    done = []; cancelled = 0;
    component.done.subscribe(f => done.push(f));
    component.cancelled.subscribe(() => cancelled++);
    fixture.componentRef.setInput('backgroundUrl', backgroundUrl);
    fixture.detectChanges();
    const live = el().querySelector('canvas.wb-live') as HTMLCanvasElement;
    live.getBoundingClientRect = () => ({ left: 0, top: 0, width: 600, height: 450, right: 600, bottom: 450, x: 0, y: 0, toJSON: () => ({}) });
  }

  const el = () => fixture.nativeElement as HTMLElement;
  const pointer = (type: string, x: number, y: number) => {
    const e: any = new MouseEvent(type, { clientX: x, clientY: y, bubbles: true, cancelable: true });
    e.pointerId = 1; e.pointerType = 'mouse'; e.pressure = 0.5;
    (el().querySelector('canvas.wb-live') as HTMLElement).dispatchEvent(e);
  };
  const drawStroke = () => { pointer('pointerdown', 10, 10); pointer('pointermove', 100, 80); pointer('pointermove', 200, 120); pointer('pointerup', 200, 120); fixture.detectChanges(); };
  const key = (k: string, init: KeyboardEventInit = {}) => { const e = new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...init }); document.dispatchEvent(e); fixture.detectChanges(); return e; };
  const btn = (label: string) => el().querySelector(`button[aria-label^="${label}"]`) as HTMLButtonElement;

  beforeEach(() => {
    originalGetContext = HTMLCanvasElement.prototype.getContext;
    originalToBlob = HTMLCanvasElement.prototype.toBlob;
    HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement) { const c = fakeContext(); c.canvas = this; return c; } as any;
    HTMLCanvasElement.prototype.toBlob = function (cb: BlobCallback) { cb(new Blob(['png'], { type: 'image/png' })); } as any;
  });
  afterEach(() => {
    HTMLCanvasElement.prototype.getContext = originalGetContext;
    HTMLCanvasElement.prototype.toBlob = originalToBlob;
    fixture?.destroy();
    vi.unstubAllGlobals();
  });

  it('muestra herramientas con icono, nombre accesible y atajo (sin botones de texto para el grosor)', () => {
    setup();
    for (const label of ['Lápiz (P)', 'Marcador (M)', 'Borrador (E)', 'Línea (L)', 'Rectángulo (R)', 'Elipse (O)']) {
      const b = btn(label);
      expect(b, label).toBeTruthy();
      expect(b.title).toBe(label);
      expect(b.querySelector('svg')).toBeTruthy();
    }
    const sizes = el().querySelectorAll('.wb-size');
    expect(sizes).toHaveLength(5);
    sizes.forEach(s => { expect(s.querySelector('.wb-dot')).toBeTruthy(); expect(s.textContent?.trim()).toBe(''); });
    expect(el().querySelectorAll('.wb-swatch:not(.wb-custom)').length).toBeGreaterThanOrEqual(10);
    expect(el().querySelector('input[type=color]')).toBeTruthy();
  });

  it('los atajos de teclado cambian de herramienta y el botón activo lo refleja', () => {
    setup();
    key('e');
    expect(component.tool()).toBe('eraser');
    expect(btn('Borrador').getAttribute('aria-pressed')).toBe('true');
    key('o'); expect(component.tool()).toBe('ellipse');
    key('r'); expect(component.tool()).toBe('rect');
    key('l'); expect(component.tool()).toBe('line');
    key('m'); expect(component.tool()).toBe('marker');
    key('p'); expect(component.tool()).toBe('pen');
  });

  it('elige grosor y color y los marca como activos', () => {
    setup();
    (el().querySelectorAll('.wb-size')[3] as HTMLElement).click();
    fixture.detectChanges();
    expect(component.sizeIndex()).toBe(3);
    expect(el().querySelectorAll('.wb-size')[3].classList.contains('active')).toBe(true);
    btn('Rojo').click();
    fixture.detectChanges();
    expect(btn('Rojo').getAttribute('aria-pressed')).toBe('true');
  });

  it('dibujar habilita deshacer/usar; deshacer y rehacer con atajos', () => {
    setup();
    expect(btn('Deshacer').disabled).toBe(true);
    expect((el().querySelector('.wb-primary') as HTMLButtonElement).disabled).toBe(true);
    drawStroke();
    expect(btn('Deshacer').disabled).toBe(false);
    expect((el().querySelector('.wb-primary') as HTMLButtonElement).disabled).toBe(false);
    key('z', { ctrlKey: true });
    expect(component.hasStrokes()).toBe(false);
    expect(btn('Rehacer').disabled).toBe(false);
    key('z', { ctrlKey: true, shiftKey: true });
    expect(component.hasStrokes()).toBe(true);
    key('z', { metaKey: true });
    key('y', { ctrlKey: true });
    expect(component.hasStrokes()).toBe(true);
  });

  it('una forma se dibuja arrastrando y un clic sin arrastre no crea nada', () => {
    setup();
    key('r');
    pointer('pointerdown', 50, 50); pointer('pointerup', 50, 50);
    expect(component.hasStrokes()).toBe(false);
    pointer('pointerdown', 50, 50); pointer('pointermove', 150, 120); pointer('pointerup', 150, 120);
    expect(component.hasStrokes()).toBe(true);
  });

  it('«Usar como ilustración» emite un PNG', async () => {
    setup();
    drawStroke();
    (el().querySelector('.wb-primary') as HTMLButtonElement).click();
    await fixture.whenStable();
    expect(done).toHaveLength(1);
    expect(done[0].type).toBe('image/png');
    expect(done[0].name).toBe('ilustracion.png');
  });

  it('Escape sin trazos cierra sin pedir confirmación y no llega al compositor', () => {
    setup();
    const outside = vi.fn();
    document.addEventListener('keydown', outside);
    key('Escape');
    document.removeEventListener('keydown', outside);
    expect(cancelled).toBe(1);
    expect(outside).not.toHaveBeenCalled();
  });

  it('con trazos, Escape y Cancelar piden confirmar antes de descartar', () => {
    setup();
    drawStroke();
    key('Escape');
    expect(cancelled).toBe(0);
    expect(el().querySelector('.wb-confirm')?.textContent).toContain('sin usar');
    key('Escape'); // cierra el aviso, no el diálogo
    expect(el().querySelector('.wb-confirm')).toBeNull();
    (el().querySelector('.wb-secondary') as HTMLButtonElement).click();
    fixture.detectChanges();
    const discard = [...el().querySelectorAll('.wb-confirm button')].find(b => b.textContent?.includes('Descartar')) as HTMLButtonElement;
    discard.click();
    expect(cancelled).toBe(1);
  });

  it('borrar todo pide confirmación y se puede deshacer', () => {
    setup();
    drawStroke();
    btn('Borrar todo').click(); fixture.detectChanges();
    expect(component.confirm()).toBe('clear');
    (el().querySelectorAll('.wb-confirm button')[1] as HTMLButtonElement).click(); fixture.detectChanges();
    expect(component.hasStrokes()).toBe(false);
    key('z', { ctrlKey: true });
    expect(component.hasStrokes()).toBe(true);
  });

  it('Tab queda atrapado dentro del diálogo', () => {
    setup();
    const buttons = [...el().querySelectorAll<HTMLElement>('.wb-dialog button:not([disabled]), .wb-dialog input:not([disabled])')];
    buttons[buttons.length - 1].focus();
    const e = key('Tab');
    expect(e.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(buttons[0]);
  });

  it('si la imagen actual no se puede cargar muestra un aviso amable y deja dibujar desde cero', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('cors')));
    setup('https://cdn.example/x.png');
    await fixture.whenStable();
    fixture.detectChanges();
    expect(el().querySelector('.wb-warn')?.textContent).toContain('dibujar desde cero');
    expect(el().querySelector('.wb-bg input[type=checkbox]')).toBeNull();
    drawStroke();
    expect(component.hasStrokes()).toBe(true);
  });
});
