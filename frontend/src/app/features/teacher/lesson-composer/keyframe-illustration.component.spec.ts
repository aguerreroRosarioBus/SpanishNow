import { I18nService } from '../../../core/i18n/i18n.service';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { KeyframeIllustrationComponent } from './keyframe-illustration.component';
import { LessonBlock } from '../../../core/services/lesson-plan.service';
import { WhiteboardService } from './whiteboard/whiteboard.service';

const TEXT = 'María llega a la fiesta. Busca a su amiga Ana entre los invitados.';
const kf = (extra: Partial<LessonBlock> = {}): LessonBlock => ({ blockKey: 'k1', type: 'keyframe', phase: 'during', active: true, required: false, text: TEXT, ...extra });
const png = (size = 10, type = 'image/png') => new File([new Uint8Array(size)], 'a.png', { type });

describe('KeyframeIllustrationComponent', () => {
  let fixture: ComponentFixture<KeyframeIllustrationComponent>;
  let component: KeyframeIllustrationComponent;
  let http: HttpTestingController;
  let board: WhiteboardService;
  let imageChange: any[];
  let altChange: any[];

  function setup(block: LessonBlock, dirty = false, ensureSaved = async () => true): void {
    TestBed.configureTestingModule({ imports: [KeyframeIllustrationComponent], providers: [provideHttpClient(), provideHttpClientTesting()] });
    http = TestBed.inject(HttpTestingController);
    board = TestBed.inject(WhiteboardService);
    TestBed.inject(I18nService).setLocale('es');
    fixture = TestBed.createComponent(KeyframeIllustrationComponent);
    component = fixture.componentInstance;
    imageChange = []; altChange = [];
    component.imageChange.subscribe(e => imageChange.push(e));
    component.altChange.subscribe(e => altChange.push(e));
    fixture.componentRef.setInput('storyId', 7);
    fixture.componentRef.setInput('block', block);
    fixture.componentRef.setInput('dirty', dirty);
    fixture.componentRef.setInput('ensureSaved', ensureSaved);
    fixture.detectChanges();
  }

  const el = () => fixture.nativeElement as HTMLElement;
  const buttonByText = (text: string) => [...el().querySelectorAll('button')].find(b => b.textContent?.includes(text)) as HTMLButtonElement;
  const pickFile = (file: File) => {
    const input = el().querySelector('input[type=file]') as HTMLInputElement;
    Object.defineProperty(input, 'files', { value: [file], configurable: true });
    input.dispatchEvent(new Event('change'));
  };
  const imageReq = () => http.expectOne(r => r.url.endsWith('/lesson-plans/story/7/draft/blocks/k1/image'));

  afterEach(() => http.verify());

  it('sin imagen ofrece Dibujar y Subir imagen, y no muestra la descripción', () => {
    setup(kf());
    expect(buttonByText('Dibujar').querySelector('svg')).toBeTruthy();
    expect(buttonByText('Subir imagen').querySelector('svg')).toBeTruthy();
    expect((el().querySelector('input[type=file]') as HTMLInputElement).accept).toBe('image/png,image/jpeg,image/webp,image/gif');
    expect(el().querySelector('input[type=text]')).toBeNull();
  });

  it('sube la imagen como multipart «image», notifica la URL y rellena la descripción con la primera frase', async () => {
    setup(kf());
    pickFile(png());
    const req = imageReq();
    expect(req.request.method).toBe('POST');
    expect((req.request.body as FormData).get('image')).toBeInstanceOf(File);
    req.flush({ blockKey: 'k1', imageUrl: 'https://cdn/i.png' });
    await fixture.whenStable();
    expect(imageChange).toEqual([{ blockKey: 'k1', imageUrl: 'https://cdn/i.png' }]);
    expect(altChange).toEqual([{ blockKey: 'k1', imageAlt: 'María llega a la fiesta.' }]);
  });

  it('una imagen de Google usa el mismo guardado previo y upload del fragmento', async () => {
    const saved = vi.fn(async () => true);
    setup(kf(), true, saved);
    const pending = component.upload(png());
    await fixture.whenStable();
    expect(saved).toHaveBeenCalledOnce();
    imageReq().flush({ blockKey: 'k1', imageUrl: 'https://cdn/google.png' });
    await pending;
    expect(imageChange).toEqual([{ blockKey: 'k1', imageUrl: 'https://cdn/google.png' }]);
  });

  it('no pisa una descripción ya escrita', async () => {
    setup(kf({ imageAlt: 'Mi descripción' }));
    pickFile(png());
    imageReq().flush({ blockKey: 'k1', imageUrl: 'u' });
    await fixture.whenStable();
    expect(altChange).toEqual([]);
  });

  it('valida tipo y tamaño en el cliente sin llamar al backend', async () => {
    setup(kf());
    pickFile(new File(['x'], 'a.pdf', { type: 'application/pdf' }));
    await fixture.whenStable();
    expect(component.error()).toContain('PNG, JPG, WebP o GIF');
    pickFile(png(5 * 1024 * 1024 + 1));
    await fixture.whenStable();
    expect(component.error()).toContain('5 MB');
    http.expectNone(() => true);
  });

  it('con cambios sin guardar guarda el borrador antes de subir', async () => {
    const order: string[] = [];
    setup(kf(), true, async () => { order.push('save'); return true; });
    pickFile(png());
    await fixture.whenStable();
    order.push('upload');
    imageReq().flush({ blockKey: 'k1', imageUrl: 'u' });
    expect(order).toEqual(['save', 'upload']);
  });

  it('si no se puede guardar el borrador no sube la imagen', async () => {
    setup(kf(), true, async () => false);
    pickFile(png());
    await fixture.whenStable();
    http.expectNone(() => true);
    expect(component.error()).toContain('guardar');
  });

  it('un error del backend con código conocido se traduce', async () => {
    setup(kf());
    pickFile(png());
    imageReq().flush({ code: 'provider_unavailable' }, { status: 502, statusText: 'Bad Gateway' });
    await fixture.whenStable();
    fixture.detectChanges();
    expect(el().querySelector('[role=alert]')?.textContent).toContain('servicio externo');
    expect(imageChange).toEqual([]);
    expect(component.busy()).toBe(false);
  });

  it('«Dibujar» abre la pizarra en blanco y sube el PNG resultante', async () => {
    setup(kf());
    buttonByText('Dibujar').click();
    expect(board.request()).toEqual({ backgroundUrl: null, titleKey: 'teacherComposer.wb.titleIllustration' });
    board.finish(png(20));
    await fixture.whenStable();
    imageReq().flush({ blockKey: 'k1', imageUrl: 'https://cdn/d.png' });
    await fixture.whenStable();
    expect(imageChange[0].imageUrl).toBe('https://cdn/d.png');
  });

  it('con imagen: miniatura con alt, «Editar dibujo» parte de la imagen actual y cancelar no sube nada', async () => {
    setup(kf({ imageUrl: 'https://cdn/i.png', imageAlt: 'María en la fiesta' }));
    const img = el().querySelector('.ill-thumb img') as HTMLImageElement;
    expect(img.alt).toBe('María en la fiesta');
    expect(img.getAttribute('loading')).toBe('lazy');
    buttonByText('Editar dibujo').click();
    expect(board.request()?.backgroundUrl).toBe('https://cdn/i.png');
    board.finish(null);
    await fixture.whenStable();
    http.expectNone(() => true);
  });

  it('ampliar la miniatura abre una vista y Escape la cierra sin propagarse', () => {
    setup(kf({ imageUrl: 'https://cdn/i.png' }));
    (el().querySelector('.ill-thumb') as HTMLButtonElement).click();
    fixture.detectChanges();
    const box = el().querySelector('.ill-lightbox') as HTMLElement;
    expect(box.getAttribute('role')).toBe('dialog');
    const esc = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    const outside = vi.fn();
    document.addEventListener('keydown', outside);
    box.dispatchEvent(esc);
    document.removeEventListener('keydown', outside);
    fixture.detectChanges();
    expect(el().querySelector('.ill-lightbox')).toBeNull();
    expect(outside).not.toHaveBeenCalled();
  });

  it('quitar pide confirmación y luego hace DELETE', async () => {
    setup(kf({ imageUrl: 'https://cdn/i.png' }));
    buttonByText('Quitar').click();
    fixture.detectChanges();
    http.expectNone(() => true);
    (el().querySelector('.ill-confirm .ill-danger') as HTMLButtonElement).click();
    const req = imageReq();
    expect(req.request.method).toBe('DELETE');
    req.flush({ blockKey: 'k1', imageUrl: null });
    await fixture.whenStable();
    expect(imageChange).toEqual([{ blockKey: 'k1', imageUrl: null }]);
  });

  it('la descripción edita imageAlt y ofrece la sugerencia cuando está vacía', () => {
    setup(kf({ imageUrl: 'https://cdn/i.png' }));
    const input = el().querySelector('input[type=text]') as HTMLInputElement;
    expect(input.placeholder).toBe('María llega a la fiesta.');
    buttonByText('Usar sugerencia').click();
    expect(altChange).toEqual([{ blockKey: 'k1', imageAlt: 'María llega a la fiesta.' }]);
    input.value = 'Una fiesta'; input.dispatchEvent(new Event('input'));
    expect(altChange[1]).toEqual({ blockKey: 'k1', imageAlt: 'Una fiesta' });
  });
});
