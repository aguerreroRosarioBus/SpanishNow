import { describe, expect, it } from 'vitest';
import { isIos, isIosSafari, isStandalone, shouldShowIosInstructions } from './pwa-detect';

const IPHONE_SAFARI = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1';
const IPHONE_CHROME = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/123.0.0.0 Mobile/15E148 Safari/604.1';
const IPHONE_FIREFOX = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/124.0 Mobile/15E148 Safari/605.1.15';
const ANDROID_CHROME = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Mobile Safari/537.36';
const MAC_SAFARI = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15';

describe('pwa-detect', () => {
  it('detecta iPhone/iPad por user agent', () => {
    expect(isIos({ userAgent: IPHONE_SAFARI })).toBe(true);
    expect(isIos({ userAgent: ANDROID_CHROME })).toBe(false);
  });

  it('iPadOS que se presenta como Mac se detecta por pantalla táctil; un Mac real no', () => {
    expect(isIos({ userAgent: MAC_SAFARI, platform: 'MacIntel', maxTouchPoints: 5 })).toBe(true);
    expect(isIos({ userAgent: MAC_SAFARI, platform: 'MacIntel', maxTouchPoints: 0 })).toBe(false);
  });

  it('solo Safari de iOS permite agregar a inicio', () => {
    expect(isIosSafari({ userAgent: IPHONE_SAFARI })).toBe(true);
    expect(isIosSafari({ userAgent: IPHONE_CHROME })).toBe(false);
    expect(isIosSafari({ userAgent: IPHONE_FIREFOX })).toBe(false);
    expect(isIosSafari({ userAgent: ANDROID_CHROME })).toBe(false);
  });

  it('detecta la app ya instalada por navigator.standalone o display-mode', () => {
    expect(isStandalone({ userAgent: IPHONE_SAFARI, standaloneFlag: true })).toBe(true);
    expect(isStandalone({ userAgent: ANDROID_CHROME, displayModeStandalone: true })).toBe(true);
    expect(isStandalone({ userAgent: ANDROID_CHROME })).toBe(false);
  });

  it('las instrucciones de iPhone se muestran solo en Safari iOS sin instalar', () => {
    expect(shouldShowIosInstructions({ userAgent: IPHONE_SAFARI })).toBe(true);
    expect(shouldShowIosInstructions({ userAgent: IPHONE_SAFARI, standaloneFlag: true })).toBe(false);
    expect(shouldShowIosInstructions({ userAgent: IPHONE_CHROME })).toBe(false);
    expect(shouldShowIosInstructions({ userAgent: MAC_SAFARI })).toBe(false);
  });
});
