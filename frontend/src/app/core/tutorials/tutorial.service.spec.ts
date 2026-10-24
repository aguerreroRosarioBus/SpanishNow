import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { provideRouter, Router } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Config, Driver } from 'driver.js';
import { AuthService } from '../services/auth.service';
import { I18N_CATALOGS, I18nService } from '../i18n/i18n.service';
import { User } from '../models/user.model';
import { TUTORIAL_MESSAGES } from './tutorial.messages';
import { TUTORIALS } from './tutorials';
import { TUTORIAL_DRIVER, TutorialService } from './tutorial.service';

describe('Tutoriales: ciclo de vida y práctica segura', () => {
  const account = signal<User | null>(null);
  let root: HTMLElement;
  let trigger: HTMLButtonElement;
  let config: Config;
  let instance: Driver;
  let loader: ReturnType<typeof vi.fn>;
  let service: TutorialService;
  const tour = TUTORIALS.find(t => t.id === 'schedule')!;

  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem('spanishnow.locale', 'es');
    account.set({ id: 7, name: 'Prueba', email: 'prueba@example.test', role: 'teacher' });
    root = document.createElement('section');
    root.innerHTML = '<button data-testid="open-schedule-form">Abrir formulario</button>';
    trigger = document.createElement('button');
    document.body.append(root, trigger);
    vi.spyOn(HTMLElement.prototype, 'getClientRects').mockImplementation(function (this: HTMLElement) {
      return (this.hidden ? [] : [{ width: 100, height: 40 }]) as unknown as DOMRectList;
    });
    instance = {
      drive: vi.fn(), destroy: vi.fn(() => config.onDestroyed?.(undefined, {}, {} as never)),
      moveNext: vi.fn(), movePrevious: vi.fn(), isLastStep: () => false,
      isFirstStep: () => false, getActiveIndex: () => 0,
    } as unknown as Driver;
    loader = vi.fn(async () => ({ driver: (options: Config) => { config = options; return instance; } }));
    TestBed.configureTestingModule({ providers: [
      provideRouter([]), { provide: AuthService, useValue: { currentUser: account } },
      { provide: TUTORIAL_DRIVER, useValue: loader },
      { provide: I18N_CATALOGS, multi: true, useValue: TUTORIAL_MESSAGES },
    ] });
    service = TestBed.inject(TutorialService);
    TestBed.tick();
  });
  afterEach(() => {
    service.stop(); root.remove(); trigger.remove(); localStorage.clear(); vi.restoreAllMocks();
  });

  it('carga el motor solo al iniciar y conserva los controles de lectura sin interacción', async () => {
    expect(loader).not.toHaveBeenCalled();
    await service.start(tour, root, trigger);
    expect(loader).toHaveBeenCalledOnce();
    expect(config.disableActiveInteraction).toBe(true);
    expect(config.steps?.find(step => step.popover?.title?.includes('zona horaria'))?.disableActiveInteraction).toBe(true);
    expect(instance.moveNext).not.toHaveBeenCalled();
  });

  it('no abre el formulario ni avanza sin una acción y su resultado visible', async () => {
    await service.start(tour, root, trigger);
    const step = config.steps!.find(step => step.disableActiveInteraction === false)!;
    const button = root.querySelector('button')!;
    step.onHighlightStarted?.(button, step, {} as never);
    expect(root.querySelector('form')).toBeNull();
    button.click();
    await Promise.resolve();
    expect(instance.moveNext).not.toHaveBeenCalled();
    const form = document.createElement('form');
    form.dataset['testid'] = 'schedule-form'; root.append(form);
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(instance.moveNext).toHaveBeenCalledOnce();
  });

  it('omitir práctica no ejecuta la acción del control', async () => {
    const click = vi.fn(); root.querySelector('button')!.addEventListener('click', click);
    await service.start(tour, root, trigger);
    config.onNextClick?.(undefined, {}, {} as never);
    expect(instance.moveNext).toHaveBeenCalledOnce();
    expect(click).not.toHaveBeenCalled();
  });

  it('Escape cierra solo la guía, restaura foco y no la marca completada', async () => {
    await service.start(tour, root, trigger);
    const background = vi.fn(); document.addEventListener('keydown', background);
    trigger.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    TestBed.tick();
    await new Promise(resolve => setTimeout(resolve, 0));
    document.removeEventListener('keydown', background);
    expect(background).not.toHaveBeenCalled();
    expect(service.active()).toBe(false);
    await vi.waitFor(() => expect(document.activeElement).toBe(trigger));
    expect(service.status(tour)).toBeNull();
  });

  it('solo Terminar completa la guía, con memoria separada por cuenta y rol', async () => {
    await service.start(tour, root, trigger);
    config.onDoneClick?.(undefined, {}, {} as never);
    expect(service.status(tour)).toBe('completed');
    account.set({ ...account()!, id: 8 }); TestBed.tick();
    expect(service.status(tour)).toBeNull();
    account.set({ ...account()!, id: 7, role: 'student' }); TestBed.tick();
    expect(service.status(tour)).toBeNull();
  });

  it('cierra al cambiar idioma y conserva los datos del formulario', async () => {
    const input = document.createElement('input'); input.value = 'borrador'; root.append(input);
    await service.start(tour, root, trigger);
    const i18n = TestBed.inject(I18nService);
    i18n.setLocale(i18n.locale() === 'es' ? 'en' : 'es'); TestBed.tick();
    expect(service.active()).toBe(false);
    expect(input.value).toBe('borrador');
    expect(service.status(tour)).toBeNull();
  });

  it('cancela la importación pendiente al navegar y no abre una guía antigua', async () => {
    let resolve!: (value: unknown) => void;
    loader.mockImplementation(() => new Promise(r => resolve = r));
    const pending = service.start(tour, root, trigger);
    await TestBed.inject(Router).navigateByUrl('/');
    resolve({ driver: () => instance }); await pending;
    expect(instance.drive).not.toHaveBeenCalled();
    expect(service.loading()).toBe(false);
  });

  it('no abre guías para roles no permitidos o sin sesión', async () => {
    const teacherTour = TUTORIALS.find(t => t.id === 'composer')!;
    account.set({ ...account()!, role: 'student' });
    await service.start(teacherTour, root, trigger);
    account.set(null); await service.start(tour, root, trigger);
    expect(loader).not.toHaveBeenCalled();
  });

  it('permite reintentar si la carga falla', async () => {
    loader.mockRejectedValueOnce(new Error('sin conexión'));
    await service.start(tour, root, trigger);
    expect(service.error()).toBe(true); expect(service.loading()).toBe(false);
    await service.start(tour, root, trigger);
    expect(service.error()).toBe(false); expect(service.active()).toBe(true);
  });

  it('sigue funcionando cuando localStorage está bloqueado', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('bloqueado'); });
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('bloqueado'); });
    service.dismiss(tour);
    expect(service.status(tour)).toBe('dismissed');
  });

  it('elimina los listeners de práctica al cerrar', async () => {
    await service.start(tour, root, trigger);
    const step = config.steps!.find(step => step.disableActiveInteraction === false)!;
    step.onHighlightStarted?.(root.querySelector('button')!, step, {} as never);
    service.stop();
    root.querySelector('button')!.click();
    root.insertAdjacentHTML('beforeend', '<form data-testid="schedule-form"></form>');
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(instance.moveNext).not.toHaveBeenCalled();
  });

  it('ambos idiomas cubren todos los pasos con IDs estables y no contienen HTML', () => {
    for (const locale of ['es', 'en'] as const) {
      const messages = TUTORIAL_MESSAGES[locale];
      expect(Object.keys(messages).sort()).toEqual(Object.keys(TUTORIAL_MESSAGES.es).sort());
      for (const text of Object.values(messages)) {
        expect(typeof text).toBe('string');
        expect(text).not.toMatch(/<\/?[a-z]/i);
      }
    }
    expect(new Set(TUTORIALS.map(t => t.id)).size).toBe(TUTORIALS.length);
  });
});
