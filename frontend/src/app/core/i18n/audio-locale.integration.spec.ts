import { TestBed } from '@angular/core/testing';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { appConfig } from '../../app.config';
import { I18nService, LOCALE_STORAGE_KEY } from './i18n.service';
import { LESSON_AUDIO_LOCALE } from '../../features/student/story-player/audio-messages';
import { LessonAudioService } from '../../features/student/story-player/lesson-audio.service';
import { FakeAudio } from '../../features/student/story-player/testing/fake-audio';

describe('W01 → W03: proveedor de idioma de la aplicación', () => {
  afterEach(() => { vi.unstubAllGlobals(); localStorage.removeItem(LOCALE_STORAGE_KEY); });

  it('conecta el token real de app.config y cambia etiquetas sin reiniciar reproducción/seek/A-B', async () => {
    vi.stubGlobal('Audio', FakeAudio);
    FakeAudio.instances = [];
    TestBed.configureTestingModule({ providers: [...appConfig.providers, provideHttpClientTesting(), LessonAudioService] });
    const i18n = TestBed.inject(I18nService);
    const locale = TestBed.inject(LESSON_AUDIO_LOCALE);
    expect(locale).toBe(i18n.locale);
    const audio = TestBed.inject(LessonAudioService);
    i18n.setLocale('es');
    audio.toggle('/ficticio.mp3');
    await Promise.resolve(); await Promise.resolve();
    const media = FakeAudio.instances.at(-1)!;
    media.metadata(60); audio.setRepeat(20, 30); audio.seek(21);
    expect(i18n.t('audio.play')).toBe('Reproducir audio');
    i18n.setLocale('en');
    expect(locale()).toBe('en');
    expect(i18n.t('audio.play')).toBe('Play audio');
    expect(audio.isPlaying()).toBe(true);
    expect(audio.currentTime()).toBe(21);
    expect(audio.repeat()).toEqual({ a: 20, b: 30 });
    expect(FakeAudio.instances).toHaveLength(1);
    expect(media.play).toHaveBeenCalledOnce();
    audio.stop();
  });
});
