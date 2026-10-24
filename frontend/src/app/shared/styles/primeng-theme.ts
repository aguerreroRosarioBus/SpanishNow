import { definePreset } from '@primeuix/themes';
import Aura from '@primeuix/themes/aura';
import { Injectable, inject } from '@angular/core';
import { PrimeNG } from 'primeng/config';

/** Los componentes del piloto comparten la paleta de SpanishNow. */
export const SPANISHNOW_PRESET = definePreset(Aura, {
  semantic: {
    primary: {
      50: '#fff1e8', 100: '#fde6d8', 200: '#fac9ae', 300: '#f7a37a', 400: '#ef7944',
      500: '#e8632b', 600: '#c94a14', 700: '#a53c0f', 800: '#8a320d', 900: '#702b12', 950: '#3d1407',
    },
    colorScheme: { light: { primary: { color: '{primary.600}', inverseColor: '#ffffff', hoverColor: '{primary.700}', activeColor: '{primary.800}' } } },
  },
});

/** Se activa al cargar los componentes del piloto, sin configurar otro tema en app.config. */
@Injectable({ providedIn: 'root' })
export class PilotTheme {
  constructor() {
    inject(PrimeNG).theme.set({ preset: SPANISHNOW_PRESET, options: { darkModeSelector: false, cssLayer: { name: 'primeng', order: 'primeng, app' } } });
  }
}
