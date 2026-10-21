import { Component, computed, inject, input } from '@angular/core';
import { DomSanitizer } from '@angular/platform-browser';

/** Únicos orígenes de embed aceptados (los mismos que normaliza el backend). */
export const ALLOWED_EMBED_PREFIXES = [
  'https://www.youtube-nocookie.com/embed/',
  'https://player.vimeo.com/video/',
  'https://iframe.mediadelivery.net/embed/'
] as const;

/** Una URL es incrustable solo si empieza con uno de los orígenes permitidos y tiene un id a continuación. */
export function isAllowedEmbedUrl(url: string | null | undefined): url is string {
  if (!url || typeof url !== 'string') return false;
  const value = url.trim();
  if (value !== url || /[\s\\<>"']/.test(value)) return false;
  return ALLOWED_EMBED_PREFIXES.some(prefix => value.startsWith(prefix) && value.length > prefix.length);
}

/**
 * Video incrustado 16:9 responsive y lazy. Solo renderiza URLs de los tres proveedores admitidos;
 * cualquier otra cosa no genera iframe (no se sanitiza ni se confía en ella).
 */
@Component({
  selector: 'app-video-embed',
  standalone: true,
  template: `
    @if (safeUrl(); as src) {
      <div class="video-embed">
        <iframe [src]="src" [attr.title]="title()" loading="lazy" allow="fullscreen; picture-in-picture"
                allowfullscreen referrerpolicy="strict-origin-when-cross-origin"
                sandbox="allow-scripts allow-same-origin allow-presentation allow-popups allow-popups-to-escape-sandbox"></iframe>
      </div>
    }
  `,
  styles: [`
    :host { display: block; }
    .video-embed {
      position: relative;
      width: 100%;
      aspect-ratio: 16 / 9;
      overflow: hidden;
      background: #000;
      border-radius: var(--radius-lg);
    }
    iframe { position: absolute; inset: 0; width: 100%; height: 100%; border: 0; }
  `]
})
export class VideoEmbedComponent {
  private sanitizer = inject(DomSanitizer);

  /** URL de embed normalizada por el servidor. */
  url = input<string | null | undefined>(null);
  /** Nombre accesible del iframe. */
  title = input('Video');

  safeUrl = computed(() => {
    const url = this.url();
    // Solo aquí se marca algo como confiable, y únicamente después de validar el origen.
    return isAllowedEmbedUrl(url) ? this.sanitizer.bypassSecurityTrustResourceUrl(url) : null;
  });
}
