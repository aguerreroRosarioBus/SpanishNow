import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastService } from './toast.service';

describe('ToastService', () => {
  let toast: ToastService;
  beforeEach(() => { vi.useFakeTimers(); toast = TestBed.inject(ToastService); });
  afterEach(() => vi.useRealTimers());

  it('el error dura más que el éxito', () => {
    toast.success('ok'); toast.error('mal');
    vi.advanceTimersByTime(4100);
    expect(toast.getToasts().map(t => t.message)).toEqual(['mal']);
    vi.advanceTimersByTime(3000);
    expect(toast.getToasts()).toEqual([]);
  });

  it('no duplica el mismo mensaje: reinicia su tiempo', () => {
    toast.error('mal');
    vi.advanceTimersByTime(5000);
    toast.error('mal');
    expect(toast.getToasts().length).toBe(1);
    vi.advanceTimersByTime(5000);
    expect(toast.getToasts().length).toBe(1);
    vi.advanceTimersByTime(2100);
    expect(toast.getToasts().length).toBe(0);
  });

  it('se pausa con el mouse o el foco y sigue al reanudar', () => {
    toast.success('ok');
    const id = toast.getToasts()[0].id;
    vi.advanceTimersByTime(3000);
    toast.pause(id);
    vi.advanceTimersByTime(20000);
    expect(toast.getToasts().length).toBe(1);
    toast.resume(id);
    vi.advanceTimersByTime(1100);
    expect(toast.getToasts().length).toBe(0);
  });
});
