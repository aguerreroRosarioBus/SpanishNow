/** Detección de plataforma para la app instalable. Funciones puras: reciben lo que leen del navegador. */

export interface PlatformInfo {
  userAgent: string;
  /** navigator.platform */
  platform?: string;
  /** navigator.maxTouchPoints (iPadOS 13+ se presenta como Mac con pantalla táctil). */
  maxTouchPoints?: number;
  /** navigator.standalone (solo Safari iOS) */
  standaloneFlag?: boolean;
  /** matchMedia('(display-mode: standalone)').matches */
  displayModeStandalone?: boolean;
}

export function isIos(p: PlatformInfo): boolean {
  if (/iPad|iPhone|iPod/.test(p.userAgent)) return true;
  return p.platform === 'MacIntel' && (p.maxTouchPoints ?? 0) > 1;
}

/** Safari de iOS: excluye los navegadores que corren sobre WebKit pero no permiten «Agregar a inicio» (Chrome, Firefox, Edge, Opera). */
export function isIosSafari(p: PlatformInfo): boolean {
  if (!isIos(p)) return false;
  return !/CriOS|FxiOS|EdgiOS|OPiOS|OPT\/|GSA\/|DuckDuckGo|YaBrowser/.test(p.userAgent);
}

/** La app ya está abierta como app instalada. */
export function isStandalone(p: PlatformInfo): boolean {
  return !!p.standaloneFlag || !!p.displayModeStandalone;
}

/** Mostrar las instrucciones de iPhone: Safari en iOS y todavía no instalada. */
export function shouldShowIosInstructions(p: PlatformInfo): boolean {
  return isIosSafari(p) && !isStandalone(p);
}

/** Lee la información del navegador actual (seguro si falta alguna API). */
export function currentPlatform(): PlatformInfo {
  try {
    return {
      userAgent: navigator.userAgent ?? '',
      platform: navigator.platform,
      maxTouchPoints: navigator.maxTouchPoints,
      standaloneFlag: (navigator as unknown as { standalone?: boolean }).standalone,
      displayModeStandalone: typeof matchMedia === 'function' ? matchMedia('(display-mode: standalone)').matches : false
    };
  } catch {
    return { userAgent: '' };
  }
}
