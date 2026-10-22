import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { LessonAudioService } from './lesson-audio.service';
import { LESSON_AUDIO_LOCALE } from './audio-messages';
import { FakeAudio } from './testing/fake-audio';

describe('LessonAudioService — AUDIO-01–06', () => {
  let audio: LessonAudioService;
  const media = () => FakeAudio.instances.at(-1)!;
  const flush = async () => { await Promise.resolve(); await Promise.resolve(); };
  beforeEach(() => {
    FakeAudio.instances = [];
    vi.stubGlobal('Audio', FakeAudio);
    TestBed.configureTestingModule({ providers: [LessonAudioService] });
    audio = TestBed.inject(LessonAudioService);
  });
  afterEach(() => { audio.stop(); vi.unstubAllGlobals(); });

  it('precarga sin reproducir; no permite seek sin metadata finita y rango disponible', () => {
    audio.prepare('/slow.mp3');
    expect(audio.state()).toBe('loading');
    expect(media().preload).toBe('metadata');
    expect(media().play).not.toHaveBeenCalled();
    expect(audio.duration()).toBeNull();
    expect(audio.seek(20)).toBe(false);
    for (const duration of [NaN, Infinity, 0, -1]) {
      media().metadata(duration);
      expect(audio.duration()).toBeNull();
      expect(audio.canSeek()).toBe(false);
    }
    media().metadata(60, []);
    expect(audio.duration()).toBe(60);
    expect(audio.canSeek()).toBe(false);
    media().ranges = [[0, 60]];
    media().emit('progress');
    expect(audio.canSeek()).toBe(true);
  });

  it('reproduce, pausa y refleja buffering y pausa del sistema', async () => {
    audio.toggle('/slow.mp3');
    expect(audio.state()).toBe('buffering');
    await flush();
    expect(audio.isPlaying()).toBe(true);
    expect(audio.state()).toBe('playing');
    media().emit('waiting');
    expect(audio.state()).toBe('buffering');
    media().emit('playing');
    expect(audio.state()).toBe('playing');
    media().emit('pause');
    expect(audio.isPlaying()).toBe(false);
    expect(audio.state()).toBe('paused');
    audio.toggle('/slow.mp3');
    audio.toggle('/slow.mp3');
    await flush();
    expect(audio.isPlaying()).toBe(false);
    expect(audio.state()).toBe('paused');
    expect(FakeAudio.instances).toHaveLength(1);
  });

  it('limita saltos a 0/duración y rechaza NaN y huecos entre rangos', () => {
    audio.prepare('/slow.mp3'); media().metadata();
    audio.skip(-10); expect(audio.currentTime()).toBe(0);
    audio.seek(55); audio.skip(10); expect(media().currentTime).toBe(60);
    expect(audio.seek(NaN)).toBe(false);
    media().metadata(60, [[0, 10], [40, 60]]);
    expect(audio.seek(25)).toBe(false);
    expect(audio.seek(45)).toBe(true);
  });

  it('valida A/B, repite al cruzar B y permite salir explícitamente', async () => {
    audio.toggle('/slow.mp3'); await flush(); media().metadata();
    for (const [a, b] of [[-1, 10], [5, 5], [10, 5], [0, 61], [NaN, 10], [0, Infinity]]) {
      expect(audio.setRepeat(a, b)).toBe(false);
      expect(audio.repeat()).toBeNull();
    }
    expect(audio.setRepeat(10, 20)).toBe(true);
    expect(media().currentTime).toBe(10);
    media().currentTime = 20.5; media().emit('timeupdate');
    expect(media().currentTime).toBe(10);
    expect(audio.isPlaying()).toBe(true);
    audio.clearRepeat();
    media().currentTime = 25; media().emit('timeupdate');
    expect(audio.currentTime()).toBe(25);
    media().metadata(60, [[0, 15], [20, 60]]);
    expect(audio.setRepeat(10, 25)).toBe(false);
  });

  it('al fin reinicia con un gesto nuevo; B=duración también repite', async () => {
    audio.toggle('/slow.mp3'); await flush(); media().metadata();
    media().currentTime = 60; media().emit('ended');
    expect(audio.state()).toBe('ended'); expect(audio.isPlaying()).toBe(false);
    audio.toggle('/slow.mp3'); await flush();
    expect(media().currentTime).toBe(0);
    audio.setRepeat(50, 60); media().currentTime = 60; media().emit('ended'); await flush();
    expect(media().currentTime).toBe(50);
    expect(audio.isPlaying()).toBe(true);
  });

  it('descarta repetición cuando la duración o los rangos dejan de admitirla', () => {
    audio.prepare('/slow.mp3'); media().metadata(); audio.setRepeat(10, 50);
    media().metadata(30);
    expect(audio.repeat()).toBeNull();
  });

  it('recupera error de carga y autoplay bloqueado con reintento', async () => {
    audio.prepare('/slow.mp3'); media().emit('error');
    expect(audio.state()).toBe('error'); expect(audio.canSeek()).toBe(false);
    expect(audio.error()).toContain('cargar');
    const old = media(); audio.retry(); await flush();
    expect(media()).not.toBe(old); expect(audio.isPlaying()).toBe(true);
    audio.pause();
    media().play.mockRejectedValueOnce(new DOMException('bloqueado', 'NotAllowedError'));
    audio.toggle('/slow.mp3'); await flush();
    expect(audio.errorCode()).toBe('audio.blocked'); expect(audio.isPlaying()).toBe(false);
    audio.toggle('/slow.mp3'); await flush();
    expect(audio.error()).toBe(''); expect(audio.isPlaying()).toBe(true);
  });

  it('libera listeners, recurso y promesas al detener o cambiar de lección', async () => {
    audio.prepare('/slow.mp3'); const old = media();
    let reject!: (error: Error) => void;
    old.play.mockImplementationOnce(() => new Promise((_, r) => { reject = r; }));
    audio.toggle('/slow.mp3'); audio.stop();
    expect(old.pause).toHaveBeenCalled(); expect(old.src).toBe('');
    expect(old.load).toHaveBeenCalledTimes(2);
    reject(new Error('tardío')); old.emit('playing'); old.emit('error'); old.metadata();
    await flush();
    expect(audio.state()).toBe('idle'); expect(audio.duration()).toBeNull(); expect(audio.error()).toBe('');
    audio.toggle('/next.mp3'); await flush();
    old.emit('ended'); old.emit('pause');
    expect(audio.isPlaying()).toBe(true);
    TestBed.resetTestingModule();
    expect(media().src).toBe('');
  });

  it('cambia grabación desde cero sin timers y no revive después de salir', async () => {
    audio.toggle('/slow.mp3'); await flush(); media().metadata(); audio.seek(25); audio.setRepeat(20, 30);
    const slow = media();
    audio.switchSpeed('normal', () => '/normal.mp3');
    expect(media().play).toHaveBeenCalledOnce();
    expect(slow.src).toBe(''); expect(audio.currentTime()).toBe(0); expect(audio.repeat()).toBeNull();
    audio.stop(); await flush(); expect(audio.state()).toBe('idle');
    audio.prepare('/slow.mp3');
    audio.switchSpeed('slow', () => '/slow.mp3');
    expect(media().play).not.toHaveBeenCalled();
    audio.switchSpeed('normal', () => null);
    expect(audio.state()).toBe('idle');
  });

  it('un fallo al buscar no activa repetición y deja un error recuperable', () => {
    audio.prepare('/slow.mp3'); media().metadata();
    Object.defineProperty(media(), 'currentTime', { get: () => 0, set: () => { throw new DOMException('sin seek'); } });
    expect(audio.setRepeat(10, 20)).toBe(false);
    expect(audio.repeat()).toBeNull(); expect(audio.errorCode()).toBe('audio.seekError');
    media().emit('loadedmetadata');
    expect(audio.state()).toBe('error');
  });

  it('un play pendiente que resuelve después de pausar no cambia el estado', async () => {
    audio.prepare('/slow.mp3');
    let resolve!: () => void;
    media().play.mockImplementationOnce(() => new Promise<void>(r => { resolve = r; }));
    audio.toggle('/slow.mp3'); audio.pause(); resolve(); await flush();
    expect(audio.isPlaying()).toBe(false); expect(audio.state()).toBe('paused');
  });

  it('maneja ausencia y URL inválida sin crear medios', () => {
    audio.toggle(null); audio.prepare('http://[');
    expect(FakeAudio.instances).toHaveLength(0); expect(audio.state()).toBe('idle');
  });

  it('traduce un error al cambiar la señal de W01 sin recrear el medio', () => {
    TestBed.resetTestingModule();
    const locale = signal<'es' | 'en'>('es');
    TestBed.configureTestingModule({ providers: [LessonAudioService, { provide: LESSON_AUDIO_LOCALE, useValue: locale }] });
    audio = TestBed.inject(LessonAudioService);
    audio.prepare('/slow.mp3'); media().emit('error');
    locale.set('en'); expect(audio.error()).toContain('could not be loaded');
    expect(FakeAudio.instances).toHaveLength(1);
  });
});
