import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';
import { PwaService } from './pwa.service';

function promptEvent(outcome: 'accepted' | 'dismissed') {
  const event = new Event('beforeinstallprompt', { cancelable: true }) as Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };
  event.prompt = vi.fn().mockResolvedValue(undefined);
  event.userChoice = Promise.resolve({ outcome });
  return event;
}

describe('PwaService', () => {
  it('ofrece instalar cuando el navegador dispara beforeinstallprompt y evita el mini-aviso nativo', () => {
    const pwa = TestBed.inject(PwaService);
    pwa.start();
    expect(pwa.canInstall()).toBe(false);
    const event = promptEvent('accepted');
    window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    expect(pwa.canInstall()).toBe(true);
  });

  it('install() muestra el diálogo, informa la elección y no se puede reutilizar', async () => {
    const pwa = TestBed.inject(PwaService);
    pwa.start();
    const event = promptEvent('accepted');
    window.dispatchEvent(event);
    expect(await pwa.install()).toBe(true);
    expect(event.prompt).toHaveBeenCalledOnce();
    expect(pwa.canInstall()).toBe(false);
    expect(await pwa.install()).toBe(false);
  });

  it('si el usuario rechaza, install() devuelve false', async () => {
    const pwa = TestBed.inject(PwaService);
    pwa.start();
    window.dispatchEvent(promptEvent('dismissed'));
    expect(await pwa.install()).toBe(false);
  });

  it('appinstalled oculta el botón', () => {
    const pwa = TestBed.inject(PwaService);
    pwa.start();
    window.dispatchEvent(promptEvent('accepted'));
    window.dispatchEvent(new Event('appinstalled'));
    expect(pwa.canInstall()).toBe(false);
    expect(pwa.installed()).toBe(true);
    expect(pwa.showIosHelp()).toBe(false);
  });

  it('refleja la falta de conexión', () => {
    const pwa = TestBed.inject(PwaService);
    pwa.start();
    window.dispatchEvent(new Event('offline'));
    expect(pwa.offline()).toBe(true);
    window.dispatchEvent(new Event('online'));
    expect(pwa.offline()).toBe(false);
  });

  it('sin service worker no hay aviso de versión nueva', () => {
    const pwa = TestBed.inject(PwaService);
    pwa.start();
    expect(pwa.updateAvailable()).toBe(false);
  });
});
