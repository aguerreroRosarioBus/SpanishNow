import { ApplicationConfig, inject, LOCALE_ID, provideBrowserGlobalErrorListeners } from '@angular/core';
import { registerLocaleData } from '@angular/common';
import localeEs from '@angular/common/locales/es';
import { provideRouter } from '@angular/router';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideServiceWorker } from '@angular/service-worker';
import { routes } from './app.routes';
import { authInterceptor } from './core/interceptors/auth.interceptor';
import { environment } from '../environments/environment';
import { I18N_CATALOGS, I18nService } from './core/i18n/i18n.service';
import { AUDIO_MESSAGES, LESSON_AUDIO_LOCALE } from './features/student/story-player/audio-messages';
import { LEGAL_SALES_MESSAGES } from './features/legal/legal-messages';
import { CHAT_MESSAGES } from './features/chat/chat.i18n';
import { PACKAGE_MESSAGES } from './features/packages/packages.i18n';
import { SCHEDULE_MESSAGES } from './features/schedule/schedule.messages';
import { CALENDAR_MESSAGES } from './features/integrations/calendar.messages';
import { TUTORIAL_MESSAGES } from './core/tutorials/tutorial.messages';

// Fechas y números en español (21 oct 2026)
registerLocaleData(localeEs);

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes),
    provideHttpClient(withInterceptors([authInterceptor])),
    { provide: LOCALE_ID, useValue: 'es' },
    // W01 → W03: un único idioma, sin recrear controles ni cambiar el estado del medio.
    { provide: I18N_CATALOGS, multi: true, useValue: AUDIO_MESSAGES },
    { provide: I18N_CATALOGS, multi: true, useValue: LEGAL_SALES_MESSAGES },
    { provide: LESSON_AUDIO_LOCALE, useFactory: () => inject(I18nService).locale },
    // W04: textos chat.* del chat privado
    { provide: I18N_CATALOGS, multi: true, useValue: CHAT_MESSAGES },
    { provide: I18N_CATALOGS, multi: true, useValue: PACKAGE_MESSAGES },
    { provide: I18N_CATALOGS, multi: true, useValue: SCHEDULE_MESSAGES },
    { provide: I18N_CATALOGS, multi: true, useValue: CALENDAR_MESSAGES },
    { provide: I18N_CATALOGS, multi: true, useValue: TUTORIAL_MESSAGES },
    // Service worker solo en el build de producción (en desarrollo no se registra: cachearía el código viejo)
    provideServiceWorker('ngsw-worker.js', {
      enabled: environment.production,
      registrationStrategy: 'registerWhenStable:30000'
    })
  ]
};
