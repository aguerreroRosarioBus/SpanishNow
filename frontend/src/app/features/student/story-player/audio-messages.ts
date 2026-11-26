import { InjectionToken, Signal, signal } from '@angular/core';

/** Punto de integración de W01: proveer una señal del idioma global, sin otro selector. */
export const LESSON_AUDIO_LOCALE = new InjectionToken<Signal<'es' | 'en'>>('LESSON_AUDIO_LOCALE', {
  providedIn: 'root', factory: () => signal<'es' | 'en'>('es').asReadonly(),
});

export const AUDIO_MESSAGES = {
  es: {
    'audio.controls': 'Controles de audio',
    'audio.play': 'Reproducir audio', 'audio.pause': 'Pausar audio',
    'audio.back': 'Retroceder 10 segundos', 'audio.forward': 'Avanzar 10 segundos',
    'audio.seek': 'Posición del audio en segundos', 'audio.speed': 'Grabación',
    'audio.slow': 'Lento', 'audio.normal': 'Normal',
    'audio.restartNotice': 'Lento y normal son grabaciones distintas. Cambiar reinicia el audio actual.',
    'audio.loading': 'Cargando audio…', 'audio.ready': 'Audio listo',
    'audio.playing': 'Reproduciendo', 'audio.paused': 'Audio pausado',
    'audio.ended': 'Audio finalizado', 'audio.buffering': 'Esperando audio…',
    'audio.unavailable': 'Audio no disponible para este contenido.',
    'audio.metadata': 'La duración aún no está disponible. Puedes reproducir; el avance y la repetición se habilitarán cuando el archivo permita buscar.',
    'audio.noSeek': 'Este archivo no permite buscar. El avance y la repetición no están disponibles.',
    'audio.loadError': 'No se pudo cargar el audio. Reintenta la carga.',
    'audio.playError': 'No se pudo iniciar el audio. Pulsa reproducir para volver a intentarlo.',
    'audio.blocked': 'El navegador interrumpió o bloqueó el audio. Pulsa reproducir para continuar.',
    'audio.seekError': 'No se pudo cambiar la posición. Reintenta la carga.',
    'audio.retry': 'Reintentar audio',
    'audio.repeatButton': 'Repetir', 'audio.repeatActive': 'Repetición activa: arrastra las manijas para acotar el tramo.',
    'audio.loopStart': 'Inicio del tramo', 'audio.loopEnd': 'Fin del tramo',
    'audio.rate': 'Velocidad', 'audio.rate075': '0,75×', 'audio.rate1': '1×',
    'audio.repeatStoppedBySeek': 'Repetición desactivada: buscaste fuera del tramo.',
  },
  en: {
    'audio.controls': 'Audio controls',
    'audio.play': 'Play audio', 'audio.pause': 'Pause audio',
    'audio.back': 'Back 10 seconds', 'audio.forward': 'Forward 10 seconds',
    'audio.seek': 'Audio position in seconds', 'audio.speed': 'Recording',
    'audio.slow': 'Slow', 'audio.normal': 'Normal',
    'audio.restartNotice': 'Slow and normal are separate recordings. Switching restarts the current audio.',
    'audio.loading': 'Loading audio…', 'audio.ready': 'Audio ready',
    'audio.playing': 'Playing', 'audio.paused': 'Audio paused',
    'audio.ended': 'Audio ended', 'audio.buffering': 'Waiting for audio…',
    'audio.unavailable': 'Audio is not available for this content.',
    'audio.metadata': 'Duration is not available yet. You can play; seeking and repeat will be enabled when the file supports seeking.',
    'audio.noSeek': 'This file does not support seeking. Seeking and repeat are unavailable.',
    'audio.loadError': 'Audio could not be loaded. Retry loading.',
    'audio.playError': 'Audio could not start. Press play to try again.',
    'audio.blocked': 'The browser interrupted or blocked audio. Press play to continue.',
    'audio.seekError': 'The position could not be changed. Retry loading.',
    'audio.retry': 'Retry audio',
    'audio.repeatButton': 'Repeat', 'audio.repeatActive': 'Repeat on: drag the handles to narrow the segment.',
    'audio.loopStart': 'Segment start', 'audio.loopEnd': 'Segment end',
    'audio.rate': 'Speed', 'audio.rate075': '0.75×', 'audio.rate1': '1×',
    'audio.repeatStoppedBySeek': 'Repeat disabled: you moved outside the segment.',
  },
} as const;
export type AudioMessageKey = keyof typeof AUDIO_MESSAGES.es;
