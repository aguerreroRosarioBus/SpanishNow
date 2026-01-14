import { Injectable, signal } from '@angular/core';

export interface Toast {
  id: number;
  type: 'success' | 'error' | 'warning' | 'info';
  message: string;
  duration?: number;
}

@Injectable({
  providedIn: 'root'
})
export class ToastService {
  private toasts = signal<Toast[]>([]);
  private nextId = 0;

  getToasts = this.toasts.asReadonly();

  show(type: Toast['type'], message: string, duration: number = 4000): void {
    const toast: Toast = {
      id: this.nextId++,
      type,
      message,
      duration
    };

    this.toasts.update(toasts => [...toasts, toast]);

    if (duration > 0) {
      setTimeout(() => this.remove(toast.id), duration);
    }
  }

  success(message: string, duration?: number): void {
    this.show('success', message, duration);
  }

  error(message: string, duration?: number): void {
    this.show('error', message, duration);
  }

  warning(message: string, duration?: number): void {
    this.show('warning', message, duration);
  }

  info(message: string, duration?: number): void {
    this.show('info', message, duration);
  }

  remove(id: number): void {
    this.toasts.update(toasts => toasts.filter(t => t.id !== id));
  }
}
