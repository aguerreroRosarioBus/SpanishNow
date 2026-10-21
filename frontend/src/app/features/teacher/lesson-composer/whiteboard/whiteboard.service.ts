import { Injectable, signal } from '@angular/core';

export interface WhiteboardRequest { backgroundUrl: string | null; title?: string; }

/**
 * Abre la pizarra como diálogo sobre el compositor. La pizarra se renderiza una sola vez, en la raíz del compositor
 * (fuera de las tarjetas arrastrables, que robarían el gesto de dibujo), y quien la pide recibe el PNG o null.
 */
@Injectable({ providedIn: 'root' })
export class WhiteboardService {
  readonly request = signal<WhiteboardRequest | null>(null);
  private resolver: ((file: File | null) => void) | null = null;

  open(request: WhiteboardRequest): Promise<File | null> {
    this.finish(null);
    this.request.set(request);
    return new Promise(resolve => { this.resolver = resolve; });
  }

  finish(file: File | null): void {
    const resolve = this.resolver;
    this.resolver = null;
    this.request.set(null);
    resolve?.(file);
  }
}
