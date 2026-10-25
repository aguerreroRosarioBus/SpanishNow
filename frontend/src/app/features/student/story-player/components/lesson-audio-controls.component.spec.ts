import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { LessonAudioControlsComponent } from './lesson-audio-controls.component';
import { LessonAudioService } from '../lesson-audio.service';
import { LESSON_AUDIO_LOCALE } from '../audio-messages';
import { FakeAudio } from '../testing/fake-audio';

describe('Controles de audio compartidos', () => {
  let fixture: ComponentFixture<LessonAudioControlsComponent>;
  let audio: LessonAudioService;
  const locale = signal<'es' | 'en'>('es');
  const media = () => FakeAudio.instances.at(-1)!;
  const el = () => fixture.nativeElement as HTMLElement;
  const button = (text: string) => [...el().querySelectorAll('button')].find(b => b.textContent?.trim() === text)!;
  const input = (type: string) => el().querySelector(`input[type="${type}"]`) as HTMLInputElement;
  const change = (input: HTMLInputElement, value: string) => {
    input.value = value; input.dispatchEvent(new Event('input', { bubbles: true })); fixture.detectChanges();
  };
  beforeEach(async () => {
    FakeAudio.instances = []; locale.set('es'); vi.stubGlobal('Audio', FakeAudio);
    await TestBed.configureTestingModule({ imports: [LessonAudioControlsComponent], providers: [
      LessonAudioService, { provide: LESSON_AUDIO_LOCALE, useValue: locale },
    ] }).compileComponents();
    fixture = TestBed.createComponent(LessonAudioControlsComponent);
    audio = TestBed.inject(LessonAudioService);
  });
  afterEach(() => { fixture.destroy(); vi.unstubAllGlobals(); });

  it('explica metadata ausente y recurso sin seek, sin NaN ni Infinity', () => {
    fixture.componentRef.setInput('singleUrl', '/frame.mp3'); fixture.detectChanges();
    expect(input('range').disabled).toBe(true);
    expect(el().textContent).toContain('duración aún no');
    media().metadata(Infinity); fixture.detectChanges();
    expect(el().textContent).not.toMatch(/NaN|Infinity/);
    media().metadata(60, []); fixture.detectChanges();
    expect(input('range').disabled).toBe(true);
    expect(el().textContent).toContain('no permite buscar');
    expect(el().querySelector('.recordings')).toBeNull();
  });

  it('muestra ausencia de audio y deshabilita una grabación inexistente', () => {
    fixture.componentRef.setInput('slowUrl', null);
    fixture.componentRef.setInput('normalUrl', '/normal.mp3'); fixture.detectChanges();
    expect(button('Lento').disabled).toBe(true);
    expect(el().textContent).toContain('Audio no disponible');
    button('Normal').click(); fixture.detectChanges();
    expect(input('range')).toBeTruthy();
    expect(media().src).toContain('/normal.mp3');
    expect(media().play).not.toHaveBeenCalled();
  });

  it('incluye nombres accesibles, tiempos, saltos y seek sin arrastre', () => {
    fixture.componentRef.setInput('singleUrl', '/frame.mp3'); fixture.detectChanges();
    media().metadata(); fixture.detectChanges();
    expect(input('range').getAttribute('aria-label')).toBe('Posición del audio en segundos');
    change(input('range'), '25');
    (el().querySelector('[aria-label="Avanzar 10 segundos"]') as HTMLButtonElement).click(); fixture.detectChanges();
    expect(audio.currentTime()).toBe(35);
    expect(input('range').getAttribute('aria-valuetext')).toBe('0:35 / 1:00');
    (el().querySelector('[aria-label="Retroceder 10 segundos"]') as HTMLButtonElement).click();
    expect(audio.currentTime()).toBe(25);
  });

  it('valida límites escritos, marca A/B y conserva controles para salir de repetición', () => {
    fixture.componentRef.setInput('singleUrl', '/frame.mp3'); fixture.detectChanges(); media().metadata(); fixture.detectChanges();
    const numbers = [...el().querySelectorAll<HTMLInputElement>('input[type="number"]')];
    button('Activar repetición').click(); fixture.detectChanges();
    expect(el().querySelector('[role="alert"]')?.textContent).toContain('0 ≤ A < B');
    audio.seek(10); button('Marcar A aquí').click();
    change(numbers[1], '20'); button('Activar repetición').click(); fixture.detectChanges();
    expect(audio.repeat()).toEqual({ a: 10, b: 20 });
    expect(numbers[0].disabled).toBe(true);
    button('Salir de repetición').click(); fixture.detectChanges();
    expect(audio.repeat()).toBeNull(); expect(numbers[0].disabled).toBe(false);
  });

  it('anuncia la salida de A/B por seek fuera del fragmento y conserva la posición', () => {
    fixture.componentRef.setInput('singleUrl', '/frame.mp3'); fixture.detectChanges(); media().metadata();
    audio.setRepeat(10, 20); fixture.detectChanges();
    const notice = el().querySelector('.repeat-notice')!;
    expect(notice.getAttribute('role')).toBe('status');
    expect(notice.getAttribute('aria-live')).toBe('polite');
    expect(notice.textContent?.trim()).toBe('');
    change(input('range'), '35'); media().emit('timeupdate'); fixture.detectChanges();
    expect(audio.repeat()).toBeNull(); expect(audio.currentTime()).toBe(35);
    expect(notice.textContent).toContain('Repetición desactivada: buscaste fuera');
    expect(button('Activar repetición')).toBeTruthy();
    expect(input('number').disabled).toBe(false);
    locale.set('en'); fixture.detectChanges();
    expect(notice.textContent).toContain('Repeat disabled: you moved outside');
    audio.setRepeat(10, 20); fixture.detectChanges();
    expect(notice.textContent?.trim()).toBe('');
  });

  it('cambia ES/EN durante la reproducción sin perder posición, repetición ni elemento', async () => {
    fixture.componentRef.setInput('slowUrl', '/slow.mp3'); fixture.componentRef.setInput('normalUrl', '/normal.mp3');
    fixture.detectChanges(); media().metadata(); button('Reproducir audio').click();
    await Promise.resolve(); audio.setRepeat(10, 20); audio.seek(15); fixture.detectChanges();
    const current = media(); locale.set('en'); fixture.detectChanges();
    expect(button('Pause audio')).toBeTruthy(); expect(el().textContent).toContain('separate recordings');
    expect(audio.currentTime()).toBe(15); expect(audio.repeat()).toEqual({ a: 10, b: 20 });
    expect(media()).toBe(current); expect(audio.isPlaying()).toBe(true);
  });

  it('reintenta solo el medio y limpia A/B y recursos al cambiar de fuente o destruir', async () => {
    fixture.componentRef.setInput('singleUrl', '/frame.mp3'); fixture.detectChanges(); media().metadata();
    fixture.componentInstance.a.set('10'); fixture.componentInstance.b.set('20'); media().emit('error'); fixture.detectChanges();
    button('Reintentar audio').click(); await Promise.resolve(); fixture.detectChanges();
    expect(audio.error()).toBe(''); expect(audio.isPlaying()).toBe(true);
    const old = media(); fixture.componentRef.setInput('singleUrl', '/next.mp3'); fixture.detectChanges();
    expect(old.src).toBe(''); expect(fixture.componentInstance.a()).toBe(''); expect(audio.currentTime()).toBe(0);
    fixture.destroy(); expect(media().src).toBe(''); expect(audio.state()).toBe('idle');
  });
});
