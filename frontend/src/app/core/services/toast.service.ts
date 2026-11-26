import { effect, inject, Injectable, signal, untracked } from '@angular/core';

export type ToastType = 'success' | 'error' | 'warning' | 'info';

export interface Toast {
  id: number;
  type: ToastType;
  message: string;
  /** Título opcional que se muestra sobre el mensaje. */
  title?: string;
  duration?: number;
}

/** Duración por defecto (ms): los errores se quedan más tiempo para poder leerlos. */
const DEFAULT_DURATION: Record<ToastType, number> = {
  success: 4000,
  info: 4000,
  warning: 5500,
  error: 7000
};

interface Timer {
  handle: ReturnType<typeof setTimeout> | null;
  remaining: number;
  startedAt: number;
}

@Injectable({
  providedIn: 'root'
})
export class ToastService {
  private toasts = signal<Toast[]>([]);
  private nextId = 0;
  private timers = new Map<number, Timer>();

  getToasts = this.toasts.asReadonly();

  /**
   * Muestra un aviso flotante. Si ya hay uno visible con el mismo tipo, título y mensaje,
   * no se duplica: se reinicia su tiempo.
   */
  show(type: ToastType, message: string, duration?: number, title?: string): void {
    const time = duration ?? DEFAULT_DURATION[type];
    const existing = this.toasts().find(t => t.type === type && t.message === message && t.title === title);
    if (existing) {
      existing.duration = time;
      this.schedule(existing.id, time);
      return;
    }

    const toast: Toast = { id: this.nextId++, type, message, title, duration: time };
    this.toasts.update(toasts => [...toasts, toast]);
    this.schedule(toast.id, time);
  }

  success(message: string, duration?: number, title?: string): void {
    this.show('success', message, duration, title);
  }

  error(message: string, duration?: number, title?: string): void {
    this.show('error', message, duration, title);
  }

  warning(message: string, duration?: number, title?: string): void {
    this.show('warning', message, duration, title);
  }

  info(message: string, duration?: number, title?: string): void {
    this.show('info', message, duration, title);
  }

  remove(id: number): void {
    this.clearTimer(id);
    this.timers.delete(id);
    this.toasts.update(toasts => toasts.filter(t => t.id !== id));
  }

  /** Detiene el temporizador (mouse encima o foco dentro del aviso). */
  pause(id: number): void {
    const timer = this.timers.get(id);
    if (!timer || timer.handle === null) return;
    this.clearTimer(id);
    timer.remaining = Math.max(timer.remaining - (Date.now() - timer.startedAt), 1000);
  }

  /** Reanuda el temporizador con el tiempo que quedaba. */
  resume(id: number): void {
    const timer = this.timers.get(id);
    if (!timer || timer.handle !== null) return;
    this.schedule(id, timer.remaining);
  }

  private schedule(id: number, time: number): void {
    this.clearTimer(id);
    if (time <= 0) {
      this.timers.delete(id);
      return;
    }
    const handle = setTimeout(() => this.remove(id), time);
    this.timers.set(id, { handle, remaining: time, startedAt: Date.now() });
  }

  private clearTimer(id: number): void {
    const timer = this.timers.get(id);
    if (timer?.handle != null) clearTimeout(timer.handle);
    if (timer) timer.handle = null;
  }
}

/**
 * Muestra un aviso flotante cada vez que `source` pasa a tener un mensaje.
 * Sirve para componentes que ya calculan el mensaje de error (o de éxito) como señal.
 * Debe llamarse en un contexto de inyección (constructor o inicializador de campo).
 */
export function toastFrom(source: () => string | null | undefined, type: ToastType = 'error'): void {
  const toast = inject(ToastService);
  effect(() => {
    const message = source();
    if (message) untracked(() => toast.show(type, message));
  });
}

/**
 * Muestra un aviso cuando `flag` pasa a verdadero (p. ej. «guardado»). El texto se calcula
 * sin seguimiento, para que cambiar de idioma no repita el aviso.
 */
export function toastWhen(flag: () => boolean, message: () => string, type: ToastType = 'success'): void {
  const toast = inject(ToastService);
  effect(() => {
    if (flag()) untracked(() => toast.show(type, message()));
  });
}
