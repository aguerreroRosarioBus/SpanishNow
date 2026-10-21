import { DOCUMENT } from '@angular/common';
import { Injectable, computed, inject, signal } from '@angular/core';
import { SwUpdate, VersionReadyEvent } from '@angular/service-worker';
import { filter } from 'rxjs';
import { currentPlatform, PlatformInfo, shouldShowIosInstructions, isStandalone } from '../../shared/utils/pwa-detect';

/** Evento no estándar de Chromium: permite mostrar nuestro propio botón de instalación. */
export interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

/**
 * App instalable (PWA): botón «Instalar app», instrucciones para iPhone, aviso de versión nueva y de falta de conexión.
 * Todo es opcional: si el navegador o el service worker no están disponibles, las señales quedan en falso.
 */
@Injectable({ providedIn: 'root' })
export class PwaService {
  private swUpdate = inject(SwUpdate, { optional: true });
  private document = inject(DOCUMENT);
  private started = false;
  private deferredPrompt: BeforeInstallPromptEvent | null = null;

  private platform = signal<PlatformInfo>({ userAgent: '' });
  private installPromptReady = signal(false);
  readonly installed = signal(false);
  readonly offline = signal(false);
  readonly updateAvailable = signal(false);

  /** El navegador ofrece instalar (Chrome/Edge/Android) y la app todavía no está instalada. */
  readonly canInstall = computed(() => this.installPromptReady() && !this.installed());
  /** Safari en iPhone/iPad: hay que explicar Compartir → Agregar a inicio. */
  readonly showIosHelp = computed(() => !this.installed() && shouldShowIosInstructions(this.platform()));

  /** Se llama una vez al arrancar la app. */
  start(): void {
    const win = this.document.defaultView;
    if (this.started || !win) return;
    this.started = true;

    this.platform.set(currentPlatform());
    this.installed.set(isStandalone(this.platform()));
    this.offline.set(win.navigator.onLine === false);

    win.addEventListener('beforeinstallprompt', event => {
      event.preventDefault();
      this.deferredPrompt = event as BeforeInstallPromptEvent;
      this.installPromptReady.set(true);
    });
    win.addEventListener('appinstalled', () => {
      this.deferredPrompt = null;
      this.installPromptReady.set(false);
      this.installed.set(true);
    });
    win.addEventListener('online', () => this.offline.set(false));
    win.addEventListener('offline', () => this.offline.set(true));

    if (this.swUpdate?.isEnabled) {
      this.swUpdate.versionUpdates
        .pipe(filter((e): e is VersionReadyEvent => e.type === 'VERSION_READY'))
        .subscribe(() => this.updateAvailable.set(true));
    }
  }

  /** Abre el diálogo nativo de instalación. Devuelve true si el usuario aceptó. */
  async install(): Promise<boolean> {
    const prompt = this.deferredPrompt;
    if (!prompt) return false;
    this.deferredPrompt = null;
    this.installPromptReady.set(false); // el evento solo se puede usar una vez
    try {
      await prompt.prompt();
      const { outcome } = await prompt.userChoice;
      return outcome === 'accepted';
    } catch {
      return false;
    }
  }

  /** Activa la versión nueva y recarga para usarla. */
  async applyUpdate(): Promise<void> {
    try {
      await this.swUpdate?.activateUpdate();
    } catch { /* si falla, la recarga igual trae lo último */ }
    this.document.defaultView?.location.reload();
  }

  dismissUpdate(): void { this.updateAvailable.set(false); }
}
