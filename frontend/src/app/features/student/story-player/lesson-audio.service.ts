import { Injectable, OnDestroy, computed, inject, signal } from '@angular/core';
import { AUDIO_MESSAGES, AudioMessageKey, LESSON_AUDIO_LOCALE } from './audio-messages';

export type AudioState = 'idle' | 'loading' | 'ready' | 'playing' | 'paused' | 'ended' | 'buffering' | 'error';
export type AudioSpeed = 'slow' | 'normal';
interface SeekRange { start: number; end: number }

/** Un único medio por lección. Nunca escribe progreso ni completa la narrativa. */
@Injectable()
export class LessonAudioService implements OnDestroy {
  private locale = inject(LESSON_AUDIO_LOCALE);
  readonly state = signal<AudioState>('idle');
  readonly isPlaying = signal(false);
  readonly speed = signal<AudioSpeed>('slow');
  readonly currentTime = signal(0);
  readonly duration = signal<number | null>(null);
  readonly seekRanges = signal<SeekRange[]>([]);
  readonly canSeek = computed(() => this.duration() !== null && this.seekRanges().length > 0 && this.state() !== 'error');
  readonly repeat = signal<{ a: number; b: number } | null>(null);
  readonly errorCode = signal<AudioMessageKey | null>(null);
  readonly error = computed(() => {
    const code = this.errorCode();
    return code ? AUDIO_MESSAGES[this.locale()][code] : '';
  });
  private element: HTMLAudioElement | null = null;
  private source: string | null = null;
  private listeners: Array<() => void> = [];
  private playAttempt = 0;

  /** Precarga metadata sin autoplay. Una fuente nueva libera por completo la anterior. */
  prepare(url: string | null | undefined): void {
    let source: string | null = null;
    try { source = url ? new URL(url, document.baseURI).href : null; } catch { /* URL inválida */ }
    if (source === this.source && this.element) return;
    this.stop();
    if (!source) return;
    this.source = source;
    const media = this.element = new Audio();
    media.preload = 'metadata';
    this.state.set('loading');
    const on = (type: string, handler: () => void) => {
      const guarded = () => { if (this.element === media) handler(); };
      media.addEventListener(type, guarded);
      this.listeners.push(() => media.removeEventListener(type, guarded));
    };
    on('loadedmetadata', () => { this.readMetadata(media); if (this.state() === 'loading') this.state.set('ready'); });
    on('durationchange', () => this.readMetadata(media));
    on('progress', () => this.readMetadata(media));
    on('canplay', () => { this.readMetadata(media); if (!this.isPlaying() && this.state() === 'loading') this.state.set('ready'); });
    on('timeupdate', () => {
      this.readMetadata(media);
      const loop = this.repeat();
      if (loop && (media.currentTime >= loop.b || media.currentTime < loop.a)) this.seek(loop.a);
    });
    on('playing', () => {
      this.errorCode.set(null); this.isPlaying.set(true); this.state.set('playing');
    });
    on('pause', () => {
      this.playAttempt++;
      this.isPlaying.set(false);
      if (this.state() !== 'error' && this.state() !== 'ended') this.state.set('paused');
    });
    on('waiting', () => { if (this.isPlaying()) this.state.set('buffering'); });
    on('stalled', () => { if (this.isPlaying()) this.state.set('buffering'); });
    on('ended', () => {
      this.isPlaying.set(false);
      if (this.repeat()) { this.seek(this.repeat()!.a); this.play(); }
      else { this.readMetadata(media); this.state.set('ended'); }
    });
    on('error', () => this.fail('audio.loadError'));
    media.src = source;
    media.load();
  }

  toggle(url: string | null | undefined): void {
    this.prepare(url);
    if (!this.element) return;
    if (this.isPlaying()) this.pause();
    else this.play();
  }

  private play(): void {
    const media = this.element;
    if (!media) return;
    this.errorCode.set(null);
    if (this.state() === 'ended') {
      try { media.currentTime = this.repeat()?.a ?? 0; } catch { this.fail('audio.seekError'); return; }
    }
    const loop = this.repeat();
    if (loop && (media.currentTime < loop.a || media.currentTime >= loop.b)) this.seek(loop.a);
    const attempt = ++this.playAttempt;
    this.isPlaying.set(true);
    this.state.set('buffering');
    // Se invoca dentro del gesto del usuario (sin setTimeout) para respetar autoplay móvil.
    try {
      media.play().then(() => {
        if (this.element === media && attempt === this.playAttempt) this.state.set('playing');
      }).catch(error => {
        if (this.element !== media || attempt !== this.playAttempt) return;
        this.fail(error?.name === 'NotAllowedError' || error?.name === 'AbortError' ? 'audio.blocked' : 'audio.playError');
      });
    } catch { this.fail('audio.playError'); }
  }

  pause(): void {
    this.playAttempt++;
    this.element?.pause();
    this.isPlaying.set(false);
    if (this.element && this.state() !== 'error') this.state.set('paused');
  }

  retry(): void {
    const source = this.source;
    this.stop();
    this.prepare(source);
    this.play();
  }

  switchSpeed(speed: AudioSpeed, resolveUrl: () => string | null): void {
    if (speed === this.speed()) return;
    const wasPlaying = this.isPlaying();
    this.speed.set(speed);
    this.stop();
    this.prepare(resolveUrl());
    if (wasPlaying) this.play();
  }

  seek(time: number): boolean {
    if (!this.element || !this.canSeek() || !Number.isFinite(time)) return false;
    const target = Math.max(0, Math.min(this.duration()!, time));
    // No afirmar que se puede buscar en huecos de TimeRanges.
    if (!this.seekRanges().some(range => target >= range.start && target <= range.end)) return false;
    try {
      this.element.currentTime = target;
      this.currentTime.set(target);
      if (this.state() === 'ended') this.state.set('paused');
      return true;
    } catch { this.fail('audio.seekError'); return false; }
  }

  skip(seconds: number): void { this.seek(this.currentTime() + seconds); }

  setRepeat(a: number, b: number): boolean {
    if (!this.canSeek() || !Number.isFinite(a) || !Number.isFinite(b) || a < 0 || a >= b || b > this.duration()! ||
        !this.seekRanges().some(range => a >= range.start && b <= range.end)) return false;
    this.repeat.set({ a, b });
    this.seek(a);
    return true;
  }

  clearRepeat(): void { this.repeat.set(null); }

  stop(): void {
    this.playAttempt++;
    this.listeners.splice(0).forEach(remove => remove());
    const media = this.element;
    this.element = null;
    this.source = null;
    if (media) {
      media.pause();
      media.removeAttribute('src');
      media.load();
    }
    this.isPlaying.set(false);
    this.state.set('idle');
    this.currentTime.set(0);
    this.duration.set(null);
    this.seekRanges.set([]);
    this.repeat.set(null);
    this.errorCode.set(null);
  }

  ngOnDestroy(): void { this.stop(); }

  private readMetadata(media: HTMLAudioElement): void {
    const duration = Number.isFinite(media.duration) && media.duration > 0 ? media.duration : null;
    this.duration.set(duration);
    this.currentTime.set(Number.isFinite(media.currentTime) ? Math.max(0, Math.min(duration ?? Infinity, media.currentTime)) : 0);
    const ranges: SeekRange[] = [];
    if (duration) {
      for (let index = 0; index < media.seekable.length; index++) {
        const start = Math.max(0, media.seekable.start(index));
        const end = Math.min(duration, media.seekable.end(index));
        if (Number.isFinite(start) && Number.isFinite(end) && end > start) ranges.push({ start, end });
      }
    }
    this.seekRanges.set(ranges);
    const loop = this.repeat();
    if (loop && (!duration || !ranges.some(range => loop.a >= range.start && loop.b <= range.end))) this.clearRepeat();
  }

  private fail(code: AudioMessageKey): void {
    this.playAttempt++;
    this.errorCode.set(code);
    this.state.set('error');
    this.isPlaying.set(false);
    this.element?.pause();
  }
}
