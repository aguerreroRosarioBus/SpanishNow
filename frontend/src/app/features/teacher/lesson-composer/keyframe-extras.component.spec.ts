import { TestBed, ComponentFixture } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { KeyframeExtrasComponent } from './keyframe-extras.component';
import { KeyframeTooltip, LessonBlock } from '../../../core/services/lesson-plan.service';

const TEXT = 'María llega a la fiesta';
const kf = (extra: Partial<LessonBlock> = {}): LessonBlock => ({ blockKey: 'k1', type: 'keyframe', phase: 'during', active: true, required: false, text: TEXT, ...extra });

describe('KeyframeExtrasComponent', () => {
  let fixture: ComponentFixture<KeyframeExtrasComponent>;
  let component: KeyframeExtrasComponent;
  let http: HttpTestingController;
  let audioChange: any[];
  let tooltipsChange: any[];

  function setup(block: LessonBlock, saved: LessonBlock | null, dirty = false, ensureSaved = async () => true): void {
    TestBed.configureTestingModule({ imports: [KeyframeExtrasComponent], providers: [provideHttpClient(), provideHttpClientTesting()] });
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(KeyframeExtrasComponent);
    component = fixture.componentInstance;
    audioChange = []; tooltipsChange = [];
    component.audioChange.subscribe(e => audioChange.push(e));
    component.tooltipsChange.subscribe(e => tooltipsChange.push(e));
    fixture.componentRef.setInput('storyId', 7);
    fixture.componentRef.setInput('block', block);
    fixture.componentRef.setInput('saved', saved);
    fixture.componentRef.setInput('dirty', dirty);
    fixture.componentRef.setInput('ensureSaved', ensureSaved);
    fixture.detectChanges();
  }

  const el = () => fixture.nativeElement as HTMLElement;
  const pickFile = (file: File) => {
    const input = el().querySelector('input[type=file]') as HTMLInputElement;
    Object.defineProperty(input, 'files', { value: [file], configurable: true });
    input.dispatchEvent(new Event('change'));
  };
  const audioReq = () => http.expectOne(r => r.url.endsWith('/lesson-plans/story/7/draft/blocks/k1/audio'));

  afterEach(() => http.verify());

  describe('audio', () => {
    it('sube el archivo como multipart y notifica la nueva URL', async () => {
      setup(kf(), kf());
      expect((el().querySelector('input[type=file]') as HTMLInputElement).accept).toBe('audio/*');
      pickFile(new File(['x'], 'a.mp3', { type: 'audio/mpeg' }));
      const req = audioReq();
      expect(req.request.method).toBe('POST');
      expect((req.request.body as FormData).get('audio')).toBeInstanceOf(File);
      req.flush({ blockKey: 'k1', audioUrl: 'https://cdn/a.mp3' });
      await fixture.whenStable();
      expect(audioChange).toEqual([{ blockKey: 'k1', audioUrl: 'https://cdn/a.mp3' }]);
      expect(component.audioError()).toBe('');
    });

    it('un error 502 muestra el mensaje del backend', async () => {
      setup(kf(), kf());
      pickFile(new File(['x'], 'a.mp3', { type: 'audio/mpeg' }));
      audioReq().flush({ error: 'No se pudo subir el audio a Cloudinary' }, { status: 502, statusText: 'Bad Gateway' });
      await fixture.whenStable();
      fixture.detectChanges();
      expect(el().querySelector('[role=alert]')?.textContent).toContain('Cloudinary');
      expect(audioChange).toEqual([]);
      expect(component.uploading()).toBe(false);
    });

    it('rechaza archivos que no son audio sin llamar al backend', async () => {
      setup(kf(), kf());
      pickFile(new File(['x'], 'a.pdf', { type: 'application/pdf' }));
      await fixture.whenStable();
      expect(component.audioError()).toContain('no es un audio');
    });

    it('con cambios sin guardar guarda el borrador antes de subir', async () => {
      const order: string[] = [];
      setup(kf(), kf(), true, async () => { order.push('save'); return true; });
      pickFile(new File(['x'], 'a.mp3', { type: 'audio/mpeg' }));
      await fixture.whenStable();
      order.push('upload');
      audioReq().flush({ blockKey: 'k1', audioUrl: 'u' });
      expect(order).toEqual(['save', 'upload']);
    });

    it('si no se puede guardar el borrador no sube el audio', async () => {
      setup(kf(), kf(), true, async () => false);
      pickFile(new File(['x'], 'a.mp3', { type: 'audio/mpeg' }));
      await fixture.whenStable();
      http.expectNone(r => r.url.endsWith('/audio'));
      expect(component.audioError()).toContain('guardar');
    });

    it('muestra vista previa y permite quitar el audio', async () => {
      setup(kf({ audioUrl: 'https://cdn/a.mp3' }), kf({ audioUrl: 'https://cdn/a.mp3' }));
      expect(el().querySelector('audio')?.getAttribute('src')).toBe('https://cdn/a.mp3');
      const remove = [...el().querySelectorAll('button')].find(b => b.textContent?.includes('Quitar audio')) as HTMLButtonElement;
      remove.click();
      const req = audioReq();
      expect(req.request.method).toBe('DELETE');
      req.flush({ blockKey: 'k1', audioUrl: null });
      await fixture.whenStable();
      expect(audioChange).toEqual([{ blockKey: 'k1', audioUrl: null }]);
    });
  });

  describe('tooltips', () => {
    const select = (start: number, end: number) => {
      const ta = el().querySelector('textarea.kf-select') as HTMLTextAreaElement;
      ta.setSelectionRange(start, end);
      ta.dispatchEvent(new Event('select'));
      fixture.detectChanges();
    };
    const open = () => { (el().querySelector('details') as HTMLDetailsElement).open = true; };

    it('crea el tooltip con offsets relativos al texto guardado del keyframe', async () => {
      setup(kf(), kf({ tooltips: [] }));
      open();
      select(6, 11); // "llega"
      expect(component.canCreate()).toBe(true);
      (el().querySelector('.small-button') as HTMLButtonElement).click();
      fixture.detectChanges();
      component.newContent.set('verbo llegar');
      const created = component.createTooltip();
      const req = http.expectOne(r => r.url.endsWith('/tooltips'));
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({ targetType: 'keyframe', targetId: 7, blockKey: 'k1', startOffset: 6, endOffset: 11, selectedText: 'llega', tooltipContent: 'verbo llegar' });
      expect(req.request.body.selectedText).toBe(TEXT.slice(6, 11));
      req.flush({ id: 3, startOffset: 6, endOffset: 11, selectedText: 'llega', tooltipContent: 'verbo llegar', isActive: true });
      await created;
      expect(tooltipsChange[0].tooltips).toEqual([{ id: 3, startOffset: 6, endOffset: 11, selectedText: 'llega', tooltipContent: 'verbo llegar', isActive: true }]);
    });

    it('usa el texto guardado (no el editado) y deshabilita la creación si el texto cambió', () => {
      setup(kf({ text: TEXT + ' hoy' }), kf());
      open();
      expect(component.tooltipBlockReason()).toContain('sin guardar');
      expect(el().querySelector('textarea.kf-select')).toBeNull();
      expect(component.canCreate()).toBe(false);
    });

    it('avisa si el bloque aún no está guardado', () => {
      setup(kf(), null);
      expect(component.tooltipBlockReason()).toContain('Guarda el borrador');
    });

    it('no permite crear sobre un tooltip activo solapado', () => {
      setup(kf(), kf({ tooltips: [{ id: 1, startOffset: 0, endOffset: 5, selectedText: 'María', tooltipContent: 'x', isActive: true }] }));
      open();
      select(3, 8);
      expect(component.selectionOverlaps()).toBe(true);
      expect(component.canCreate()).toBe(false);
    });

    it('marca los inactivos, y permite editar y borrar', async () => {
      const tips: KeyframeTooltip[] = [
        { id: 1, startOffset: 0, endOffset: 5, selectedText: 'María', tooltipContent: 'a', isActive: true },
        { id: 2, startOffset: 6, endOffset: 11, selectedText: 'llega', tooltipContent: 'b', isActive: false },
      ];
      setup(kf(), kf({ tooltips: tips }));
      const items = el().querySelectorAll('.kf-list li');
      expect(items[1].classList.contains('kf-inactive')).toBe(true);
      expect(items[1].textContent).toContain('Inactivo');
      expect(items[0].classList.contains('kf-inactive')).toBe(false);

      component.startEdit(tips[0]);
      component.editContent.set('nuevo');
      const edit = component.saveEdit(tips[0]);
      const put = http.expectOne(r => r.url.endsWith('/tooltips/1'));
      expect(put.request.method).toBe('PUT');
      expect(put.request.body).toEqual({ tooltipContent: 'nuevo' });
      put.flush({ id: 1, tooltipContent: 'nuevo' });
      await edit;
      expect(tooltipsChange[0].tooltips[0]).toMatchObject({ id: 1, selectedText: 'María', tooltipContent: 'nuevo', isActive: true });

      const del = component.deleteTooltip(tips[1]);
      const d = http.expectOne(r => r.url.endsWith('/tooltips/2'));
      expect(d.request.method).toBe('DELETE');
      d.flush({ message: 'ok' });
      await del;
      expect(tooltipsChange[1].tooltips.map((t: KeyframeTooltip) => t.id)).toEqual([1]);
    });

    it('muestra el error del backend si falla la creación', async () => {
      setup(kf(), kf({ tooltips: [] }));
      select(0, 5);
      component.newContent.set('x');
      const p = component.createTooltip();
      http.expectOne(r => r.url.endsWith('/tooltips')).flush({ error: 'El texto seleccionado no coincide' }, { status: 400, statusText: 'Bad Request' });
      await p;
      expect(component.tooltipError()).toContain('no coincide');
    });
  });
});
