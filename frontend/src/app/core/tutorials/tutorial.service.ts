import { DOCUMENT } from '@angular/common';
import { DestroyRef, effect, inject, Injectable, InjectionToken, signal } from '@angular/core';
import { NavigationStart, Router } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import type { Driver, DriveStep, PopoverDOM } from 'driver.js';
import { I18nService } from '../i18n/i18n.service';
import { AuthService } from '../services/auth.service';
import { TutorialDefinition, TutorialRole, TutorialStep } from './tutorial.model';

/** Carga diferida: las rutas sin tutorial no descargan el motor. */
export const TUTORIAL_DRIVER = new InjectionToken('TUTORIAL_DRIVER', {
  providedIn: 'root', factory: () => () => import('driver.js'),
});

export function visibleTarget(root: Element, selector: string): HTMLElement | undefined {
  return [...root.querySelectorAll<HTMLElement>(selector)].find(element =>
    element.isConnected && element.getClientRects().length > 0 &&
    getComputedStyle(element).visibility !== 'hidden' && !element.closest('[hidden], [inert]'));
}

@Injectable({ providedIn: 'root' })
export class TutorialService {
  private readonly document = inject(DOCUMENT);
  private readonly i18n = inject(I18nService);
  private readonly auth = inject(AuthService);
  private readonly loader = inject(TUTORIAL_DRIVER);
  private readonly destroy = inject(DestroyRef);
  private driver?: Driver;
  private generation = 0;
  private focusFrame?: number;
  private returnFocus?: HTMLElement;
  private cleanupStep: () => void = () => {};
  private cleanupTour: () => void = () => {};
  private readonly memory = new Map<string, string>();
  readonly active = signal(false);
  readonly loading = signal(false);
  readonly error = signal(false);
  readonly revision = signal(0);

  constructor() {
    inject(Router).events.pipe(takeUntilDestroyed()).subscribe(event => {
      if (event instanceof NavigationStart) this.stop();
    });
    let context = '';
    effect(() => {
      const user = this.auth.currentUser();
      const next = `${user?.id}:${user?.role}:${this.i18n.locale()}`;
      if (context && context !== next) this.stop();
      context = next;
    });
    this.destroy.onDestroy(() => { this.stop(); this.cancelFocus(); });
  }

  status(tour: TutorialDefinition): string | null {
    this.revision();
    const key = this.key(tour);
    if (!key) return null;
    try { return this.memory.get(key) ?? this.document.defaultView?.localStorage.getItem(key) ?? null; }
    catch { return this.memory.get(key) ?? null; }
  }

  dismiss(tour: TutorialDefinition): void { this.remember(tour, 'dismissed'); }

  async start(tour: TutorialDefinition, root: HTMLElement, trigger: HTMLElement): Promise<void> {
    this.stop();
    this.cancelFocus();
    const user = this.auth.currentUser();
    if (!user || !tour.roles.includes(user.role) || !root.isConnected) return;
    const generation = this.generation;
    const accountKey = this.key(tour);
    this.loading.set(true);
    this.error.set(false);
    try {
      const { driver } = await this.loader();
      if (generation !== this.generation || !root.isConnected || accountKey !== this.key(tour)) return;
      const role: TutorialRole = user.role;
      const definitions = tour.steps.filter(step => !step.role || step.role === role);
      const prefix = `tutorial.${tour.id}`;
      const escape = (text: string) => {
        const span = this.document.createElement('span');
        span.textContent = text;
        return span.innerHTML;
      };
      const t = (key: string) => escape(this.i18n.t(key));
      const steps: DriveStep[] = [
        { popover: { title: t(`${prefix}.title`), description: t(`${prefix}.purpose`) } },
        ...definitions.map(definition => ({
          element: () => visibleTarget(root, definition.target) as Element,
          skipMissingElement: true,
          disableActiveInteraction: !definition.practice,
          popover: {
            title: t(`${prefix}.${definition.id}.title`),
            description: t(`${prefix}.${definition.id}.description`),
            nextBtnText: t(definition.practice ? 'tutorial.skip' : 'tutorial.next'),
          },
          onHighlightStarted: (element: Element | undefined) => {
            this.cleanupStep();
            if (element && definition.practice) this.watchPractice(element, definition, root);
          },
          onDeselected: () => this.cleanupStep(),
        })),
        { popover: { title: t('tutorial.finishTitle'), description: t('tutorial.finish') } },
      ];
      const finish = () => {
        // Solo «Terminar», nunca Escape, cerrar o navegar, marca el recorrido completo.
        if (accountKey === this.key(tour)) this.remember(tour, 'completed');
        this.stop();
      };
      const instance = driver({
        steps, animate: !this.document.defaultView?.matchMedia?.('(prefers-reduced-motion: reduce)').matches,
        smoothScroll: false, allowClose: true, overlayClickBehavior: 'none',
        disableActiveInteraction: true, allowKeyboardControl: false,
        stagePadding: 6, stageRadius: 10, overlayOpacity: 0.55,
        popoverClass: 'spanishnow-tour', showProgress: true,
        nextBtnText: t('tutorial.next'), prevBtnText: t('tutorial.previous'),
        doneBtnText: t('tutorial.done'), closeBtnLabel: this.i18n.t('tutorial.close'),
        onNextClick: () => instance.isLastStep() ? finish() : instance.moveNext(),
        onDoneClick: finish,
        onCloseClick: () => this.stop(),
        onPrevClick: () => instance.movePrevious(),
        onPopoverRender: (popover, options) => {
          this.renderPopover(popover, definitions, root, options.index ?? 0);
        },
        onDestroyed: () => this.release(),
      });
      this.driver = instance;
      this.returnFocus = trigger;
      this.active.set(true);
      // Captura antes de los atajos del editor/pizarra. Escape cierra solo la guía.
      const keyboard = (event: KeyboardEvent) => this.onKeydown(event, root, definitions);
      const keyup = (event: KeyboardEvent) => { if (['Escape', 'ArrowLeft', 'ArrowRight'].includes(event.key)) event.stopImmediatePropagation(); };
      this.document.defaultView?.addEventListener('keydown', keyboard, true);
      this.document.defaultView?.addEventListener('keyup', keyup, true);
      const observer = new MutationObserver(() => { if (!root.isConnected) this.stop(); });
      observer.observe(this.document.body, { childList: true, subtree: true });
      this.cleanupTour = () => {
        observer.disconnect();
        this.document.defaultView?.removeEventListener('keydown', keyboard, true);
        this.document.defaultView?.removeEventListener('keyup', keyup, true);
      };
      instance.drive();
    } catch {
      if (generation === this.generation) { this.stop(); this.error.set(true); }
    } finally {
      if (generation === this.generation) this.loading.set(false);
    }
  }

  stop(): void {
    this.generation++;
    const instance = this.driver;
    this.driver = undefined;
    instance?.destroy();
    // La limpieza propia también cubre un elemento eliminado durante la transición
    // de Driver.js, cuando el motor puede no invocar onDestroyed.
    this.release();
  }

  private release(): void {
    this.cleanupStep();
    this.cleanupStep = () => {};
    this.cleanupTour();
    this.cleanupTour = () => {};
    this.driver = undefined;
    this.active.set(false);
    this.loading.set(false);
    const trigger = this.returnFocus;
    this.returnFocus = undefined;
    if (trigger) {
      this.cancelFocus();
      const view = this.document.defaultView;
      // Espera al renderizado del iniciador y a que termine la restauración nativa
      // del motor. También funciona si no hay un render de Angular (diálogo editor).
      this.focusFrame = view?.requestAnimationFrame(() => {
        this.focusFrame = view.requestAnimationFrame(() => {
          if (!this.active() && trigger.isConnected) trigger.focus({ preventScroll: true });
        });
      });
    }
  }

  private cancelFocus(): void {
    if (this.focusFrame !== undefined) this.document.defaultView?.cancelAnimationFrame(this.focusFrame);
    this.focusFrame = undefined;
  }

  private watchPractice(element: Element, definition: TutorialStep, root: HTMLElement): void {
    const practice = definition.practice!;
    let observer: MutationObserver | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let finished = false;
    const advance = () => {
      if (finished || !visibleTarget(root, practice.ready)) return;
      finished = true;
      this.cleanupStep();
      this.driver?.moveNext();
    };
    const action = () => {
      if (observer) return;
      observer = new MutationObserver(advance);
      observer.observe(root, { childList: true, subtree: true, attributes: true });
      // Deja que Angular renderice el resultado de la interacción.
      queueMicrotask(advance);
      timer = setTimeout(() => this.cleanupStep(), 5000);
    };
    element.addEventListener(practice.event, action);
    this.cleanupStep = () => {
      element.removeEventListener(practice.event, action);
      observer?.disconnect();
      if (timer) clearTimeout(timer);
    };
  }

  private renderPopover(popover: PopoverDOM, definitions: readonly TutorialStep[], root: HTMLElement, index: number): void {
    popover.wrapper.setAttribute('role', 'dialog');
    popover.wrapper.setAttribute('aria-modal', 'true');
    popover.title.id = 'screen-tutorial-title';
    popover.description.id = 'screen-tutorial-description';
    popover.wrapper.setAttribute('aria-labelledby', popover.title.id);
    popover.wrapper.setAttribute('aria-describedby', popover.description.id);
    popover.closeButton.setAttribute('aria-label', this.i18n.t('tutorial.close'));
    // Cuenta los pasos disponibles, incluidos los que aparecen al practicar.
    const visible = definitions.map(step => !!visibleTarget(root, step.target));
    const total = visible.filter(Boolean).length + 2;
    const current = index === 0 ? 1 : index > definitions.length ? total
      : visible.slice(0, index).filter(Boolean).length + 1;
    popover.progress.textContent = this.i18n.t('tutorial.progress', { current, total });
    queueMicrotask(() => {
      if (!popover.wrapper.isConnected) return;
      popover.nextButton.focus({ preventScroll: true });
    });
  }

  private onKeydown(event: KeyboardEvent, root: HTMLElement, definitions: readonly TutorialStep[]): void {
    const instance = this.driver;
    if (!instance) return;
    const popover = this.document.querySelector<HTMLElement>('.spanishnow-tour');
    const index = instance.getActiveIndex() ?? 0;
    const definition = definitions[index - 1];
    const practice = definition?.practice ? visibleTarget(root, definition.target) : undefined;
    const target = event.target as Node | null;
    if (event.key === 'Escape') {
      event.preventDefault(); event.stopImmediatePropagation(); this.stop(); return;
    }
    if (event.key === 'Tab') {
      const selector = 'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), summary, [tabindex="0"]';
      const controls = [
        ...(practice ? [practice, ...practice.querySelectorAll<HTMLElement>(selector)] : []),
        ...popover?.querySelectorAll<HTMLElement>(selector) ?? [],
      ].filter(el => el.getClientRects().length && el.tabIndex >= 0);
      if (!controls.length) return;
      const current = controls.indexOf(this.document.activeElement as HTMLElement);
      const next = event.shiftKey ? (current <= 0 ? controls.length - 1 : current - 1) : (current + 1) % controls.length;
      event.preventDefault(); event.stopImmediatePropagation(); controls[next].focus(); return;
    }
    // Los selectores y campos de práctica conservan sus teclas nativas.
    if (target && practice?.contains(target)) { event.stopPropagation(); return; }
    if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
      event.preventDefault(); event.stopImmediatePropagation();
      if (event.key === 'ArrowRight' && !instance.isLastStep()) instance.moveNext();
      if (event.key === 'ArrowLeft' && !instance.isFirstStep()) instance.movePrevious();
    } else if (!target || !popover?.contains(target)) {
      event.preventDefault(); event.stopImmediatePropagation();
    } else {
      event.stopPropagation();
    }
  }

  private key(tour: TutorialDefinition): string | null {
    const user = this.auth.currentUser();
    return user ? `spanishnow.tutorial.${user.id}.${user.role}.${tour.id}.v1` : null;
  }

  private remember(tour: TutorialDefinition, status: string): void {
    const key = this.key(tour);
    if (!key) return;
    this.memory.set(key, status);
    try { this.document.defaultView?.localStorage.setItem(key, status); } catch { /* Sigue en memoria. */ }
    this.revision.update(value => value + 1);
  }
}
