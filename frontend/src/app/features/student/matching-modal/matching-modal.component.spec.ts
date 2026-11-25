import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MatchingModalComponent } from './matching-modal.component';

describe('A-04: el modal de Match vocabulary se cierra con Escape', () => {
  beforeEach(() => TestBed.configureTestingModule({ providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()] }));

  const open = async (show: boolean) => {
    const fixture = TestBed.createComponent(MatchingModalComponent);
    fixture.componentInstance.unitId = 1;
    fixture.componentInstance.show = show;
    document.body.appendChild(fixture.nativeElement);
    fixture.detectChanges();
    await fixture.whenStable();
    const closed = vi.fn();
    fixture.componentInstance.close.subscribe(closed);
    return { fixture, closed };
  };

  it('Escape con el modal abierto emite close', async () => {
    const { fixture, closed } = await open(true);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(closed).toHaveBeenCalledTimes(1);
    fixture.nativeElement.remove();
  });

  it('con el modal cerrado Escape no hace nada', async () => {
    const { fixture, closed } = await open(false);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(closed).not.toHaveBeenCalled();
    fixture.nativeElement.remove();
  });
});
