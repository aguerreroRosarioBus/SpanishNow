import { Component, OnDestroy, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { LessonAudioService, AudioSpeed } from '../lesson-audio.service';
import { AUDIO_MESSAGES, AudioMessageKey, LESSON_AUDIO_LOCALE } from '../audio-messages';

let nextControlId = 0;
/** Largo mínimo del tramo repetido, en segundos. */
const MIN_LOOP = 0.5;

/** Controles comunes; el audio de keyframe tiene una sola grabación, la historia puede tener dos. */
@Component({
  selector: 'app-lesson-audio-controls',
  standalone: true,
  templateUrl: './lesson-audio-controls.component.html',
  styleUrl: './lesson-audio-controls.component.scss',
})
export class LessonAudioControlsComponent implements OnDestroy {
  readonly audio = inject(LessonAudioService);
  private locale = inject(LESSON_AUDIO_LOCALE);
  readonly singleUrl = input<string | null | undefined>();
  readonly slowUrl = input<string | null | undefined>();
  readonly normalUrl = input<string | null | undefined>();
  readonly hasVariants = computed(() => this.singleUrl() === undefined);
  readonly url = computed(() => this.hasVariants()
    ? this.audio.speed() === 'slow' ? this.slowUrl() : this.normalUrl()
    : this.singleUrl());
  /** Tramo en edición mientras se arrastra una manija; null cuando no hay arrastre. */
  private draft = signal<{ a: number; b: number } | null>(null);
  readonly loop = computed(() => this.draft() ?? this.audio.repeat());
  readonly descriptionId = `lesson-audio-${++nextControlId}`;
  readonly status = computed<AudioMessageKey | null>(() => {
    const state = this.audio.state();
    return state === 'idle' || state === 'error' ? null : `audio.${state}`;
  });

  constructor() {
    effect(() => {
      const url = this.url();
      untracked(() => {
        this.draft.set(null);
        this.audio.prepare(url);
      });
    });
  }

  text(key: AudioMessageKey): string { return AUDIO_MESSAGES[this.locale()][key]; }
  time(seconds: number | null): string {
    if (seconds === null || !Number.isFinite(seconds)) return '—';
    const whole = Math.max(0, Math.floor(seconds));
    return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
  }
  switchSpeed(speed: AudioSpeed): void {
    this.audio.switchSpeed(speed, () => this.url() || null);
  }
  percent(seconds: number): number {
    const duration = this.audio.duration();
    return duration ? Math.max(0, Math.min(100, (seconds / duration) * 100)) : 0;
  }
  toggleRepeat(): void {
    if (this.audio.repeat()) { this.draft.set(null); this.audio.clearRepeat(); return; }
    const duration = this.audio.duration();
    if (duration) this.audio.setRepeat(0, duration);
  }
  /** Mueve una manija sin salir del tramo mínimo de 0,5 s; el bucle se aplica al soltar. */
  moveHandle(bound: 'a' | 'b', input: HTMLInputElement): void {
    const current = this.loop();
    if (!current) return;
    const value = input.valueAsNumber;
    const next = bound === 'a'
      ? { a: Math.max(0, Math.min(value, current.b - MIN_LOOP)), b: current.b }
      : { a: current.a, b: Math.min(this.audio.duration() ?? value, Math.max(value, current.a + MIN_LOOP)) };
    input.value = String(bound === 'a' ? next.a : next.b);
    this.draft.set(next);
  }
  commitLoop(): void {
    const draft = this.draft();
    this.draft.set(null);
    if (draft) this.audio.setRepeat(draft.a, draft.b);
  }
  ngOnDestroy(): void { this.audio.stop(); }
}
