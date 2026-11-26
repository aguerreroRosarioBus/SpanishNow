import { TestBed } from '@angular/core/testing';
import { ToastService } from '../../core/services/toast.service';

/** Mensajes de los avisos flotantes visibles, unidos para usar con `toContain`. */
export function toastText(): string {
  return TestBed.inject(ToastService).getToasts().map(t => t.message).join(' | ');
}

/** Tipos de los avisos visibles (success, error...). */
export function toastTypes(): string[] {
  return TestBed.inject(ToastService).getToasts().map(t => t.type);
}
