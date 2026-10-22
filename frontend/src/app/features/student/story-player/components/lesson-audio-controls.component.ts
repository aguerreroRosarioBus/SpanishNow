import { Component, OnDestroy, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { LessonAudioService, AudioSpeed } from '../lesson-audio.service';
import { AUDIO_MESSAGES, AudioMessageKey, LESSON_AUDIO_LOCALE } from '../audio-messages';

let nextControlId = 0;

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
  readonly a = signal('');
  readonly b = signal('');
  readonly invalidRepeat = signal(false);
  readonly descriptionId = `lesson-audio-${++nextControlId}`;
  readonly status = computed<AudioMessageKey | null>(() => {
    const state = this.audio.state();
    return state === 'idle' || state === 'error' ? null : `audio.${state}`;
  });

  constructor() {
    effect(() => {
      const url = this.url();
      untracked(() => {
        this.a.set(''); this.b.set(''); this.invalidRepeat.set(false);
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
  setBound(bound: 'a' | 'b', value: string): void {
    this[bound].set(value); this.invalidRepeat.set(false);
  }
  mark(bound: 'a' | 'b'): void { this.setBound(bound, String(Math.round(this.audio.currentTime() * 10) / 10)); }
  toggleRepeat(): void {
    if (this.audio.repeat()) { this.audio.clearRepeat(); return; }
    const a = this.a().trim() ? Number(this.a()) : NaN;
    const b = this.b().trim() ? Number(this.b()) : NaN;
    this.invalidRepeat.set(!this.audio.setRepeat(a, b));
  }
  ngOnDestroy(): void { this.audio.stop(); }
}
