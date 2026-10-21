import { Injectable, inject, signal } from '@angular/core';
import { ToastService } from '../../../core/services/toast.service';

/** Reproductor de audio único del reproductor (fragmentos y lectura completa). */
@Injectable()
export class LessonAudioService {
  private toastService = inject(ToastService);

  isPlaying = signal(false);
  speed = signal<'slow' | 'normal'>('slow');
  error = signal('');
  private element: HTMLAudioElement | null = null;

  toggle(url: string | null | undefined): void {
    if (!url) { this.toastService.warning('Audio no disponible para esta historia'); return; }
    if (!this.element || this.element.src !== new URL(url, document.baseURI).href) {
      this.element?.pause();
      this.element = new Audio(url);
      this.element.addEventListener('ended', () => this.isPlaying.set(false));
      this.element.addEventListener('error', () => { this.error.set('No se pudo cargar el audio.'); this.isPlaying.set(false); });
    }
    if (this.isPlaying()) { this.element.pause(); this.isPlaying.set(false); }
    else { this.element.play().then(() => this.isPlaying.set(true)).catch(() => this.error.set('No se pudo iniciar el audio.')); }
  }

  switchSpeed(speed: 'slow' | 'normal', resolveUrl: () => string | null): void {
    const wasPlaying = this.isPlaying();
    this.stop();
    this.speed.set(speed);
    if (wasPlaying) setTimeout(() => this.toggle(resolveUrl()), 100);
  }

  stop(): void {
    this.element?.pause();
    this.element = null;
    this.isPlaying.set(false);
  }
}
