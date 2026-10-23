import { I18nService } from '../../../core/i18n/i18n.service';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { InlineVocabularyFormComponent } from './inline-vocabulary-form.component';
import { WhiteboardService } from './whiteboard/whiteboard.service';

describe('InlineVocabularyFormComponent (imagen)', () => {
  let fixture: ComponentFixture<InlineVocabularyFormComponent>;
  let component: InlineVocabularyFormComponent;
  let http: HttpTestingController;
  let board: WhiteboardService;
  let created: any[];

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [InlineVocabularyFormComponent], providers: [provideHttpClient(), provideHttpClientTesting()] });
    http = TestBed.inject(HttpTestingController);
    board = TestBed.inject(WhiteboardService);
    TestBed.inject(I18nService).setLocale('es');
    fixture = TestBed.createComponent(InlineVocabularyFormComponent);
    component = fixture.componentInstance;
    created = [];
    component.created.subscribe(v => created.push(v));
    fixture.componentRef.setInput('unitId', 3);
    fixture.detectChanges();
  });
  afterEach(() => http.verify());

  const el = () => fixture.nativeElement as HTMLElement;
  const buttonByText = (text: string) => [...el().querySelectorAll('button')].find(b => b.textContent?.includes(text)) as HTMLButtonElement;
  const fill = (word: string, tr: string) => { component.word.set(word); component.translation.set(tr); fixture.detectChanges(); };
  const pickFile = (file: File) => {
    const input = el().querySelector('input[type=file]') as HTMLInputElement;
    Object.defineProperty(input, 'files', { value: [file], configurable: true });
    input.dispatchEvent(new Event('change'));
    fixture.detectChanges();
  };

  it('ofrece Dibujar y Subir imagen con icono', () => {
    expect(buttonByText('Dibujar').querySelector('svg')).toBeTruthy();
    expect(buttonByText('Subir imagen').querySelector('svg')).toBeTruthy();
  });

  it('sin imagen crea la expresión como antes (sin campo image)', async () => {
    fill('me llamo', 'my name is');
    const done = component.submit();
    const req = http.expectOne(r => r.url.endsWith('/vocabulary'));
    expect((req.request.body as FormData).has('image')).toBe(false);
    req.flush({ id: 1, unitId: 3, word: 'me llamo', translation: 'my name is' });
    await done;
    expect(created).toHaveLength(1);
  });

  it('con imagen subida la envía como multipart «image»', async () => {
    fill('la casa', 'the house');
    pickFile(new File(['x'], 'casa.png', { type: 'image/png' }));
    expect(component.image()?.name).toBe('casa.png');
    expect(buttonByText('Quitar imagen')).toBeTruthy();
    const done = component.submit();
    const req = http.expectOne(r => r.url.endsWith('/vocabulary'));
    const body = req.request.body as FormData;
    expect(body.get('image')).toBeInstanceOf(File);
    expect(body.get('word')).toBe('la casa');
    expect(body.get('unitId')).toBe('3');
    req.flush({ id: 2, unitId: 3, word: 'la casa', translation: 'the house', imageUrl: 'https://cdn/c.png' });
    await done;
    expect(created[0].imageUrl).toBe('https://cdn/c.png');
  });

  it('con un dibujo de la pizarra lo adjunta; un archivo inválido muestra error', async () => {
    fill('el gato', 'the cat');
    buttonByText('Dibujar').click();
    expect(board.request()?.titleKey).toBe('teacherComposer.wb.titleExpression');
    board.finish(new File(['p'], 'ilustracion.png', { type: 'image/png' }));
    await fixture.whenStable();
    expect(component.image()?.name).toBe('ilustracion.png');
    pickFile(new File(['x'], 'a.pdf', { type: 'application/pdf' }));
    expect(component.error()).toContain('PNG');
    expect(component.image()?.name).toBe('ilustracion.png');
  });
});
