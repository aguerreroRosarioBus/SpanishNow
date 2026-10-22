# W03 · Controles de audio

Entrega de Codex sobre `main` 8f7cff5, rama `w03-audio`. Issue #16, orquestación #23.

## Alcance y compatibilidad

- **AUDIO-01 / AC18:** un `LessonAudioService` por reproductor; controles compartidos en fragmentos y lectura completa. Reproducir/pausar, posición/duración, seek nativo accesible y ±10 segundos.
- **AUDIO-02:** estados `idle`, `loading`, `ready`, `playing`, `paused`, `ended`, `buffering`, `error`. Duración desconocida como `—`; ningún seek con duración no finita o sin `seekable`. Los destinos se limitan a la duración y se rechazan huecos de `TimeRanges`.
- **AUDIO-03:** A/B por campos de segundos o «Marcar aquí», validación finita `0 ≤ A < B ≤ duración` dentro de un mismo rango; activar y salir explícitamente. Si cambia duración/rango y deja de ser válido, se desactiva. Repetición basada en los eventos de tiempo del navegador, sin alineación de palabras ni precisión de edición de audio.
- **AUDIO-04:** lento/normal eligen las grabaciones existentes de historia, sin modificar `playbackRate`. Se anuncia que cambiar reinicia el audio actual y descarta A/B; continúa reproduciendo si estaba activo. Un keyframe conserva su única grabación `audioUrl`, sin simular una variante lenta que no existe.
- **AUDIO-05:** botones y campos nativos, nombres accesibles, `aria-pressed`, estados anunciados, foco visible y objetivos de al menos 44 px. Seek por teclado o toque; no exige arrastrar. Se conservan texto, ilustraciones y tooltips. Se retiró `aria-live` del contenedor de texto para no anunciar cada actualización de tiempo; los estados del audio tienen su propia región viva.
- **AUDIO-06:** pruebas con MP3 y WAV reales servidos localmente por HTTP, CORS y Range/206. Recuperación de error con recarga del medio, y de rechazo de `play()` con un nuevo gesto. El navegador puede interrumpir/pausar el audio; el botón permite retomarlo.

No hay escrituras de progreso desde el servicio ni desde los controles. Solo la navegación explícita conserva el endpoint de bloque actual; completar narrativa sigue siendo una acción independiente. Al cambiar de bloque/historia o destruir el reproductor se pausa el medio, se retiran listeners y `src`, se ejecuta `load()` para liberar el recurso y se invalidan promesas anteriores. No quedan timers que puedan reactivar un audio viejo.

Sin cambios de esquema, backend, permisos, rutas raíz, menús, variables de entorno ni proveedores. No requiere configuración nueva.

## Integración pendiente con W01

W01 todavía no está implementado en la base de esta entrega. Los textos propios están en `audio-messages.ts`, con claves estables `audio.*` en ES/EN. `LESSON_AUDIO_LOCALE` es un token `Signal<'es' | 'en'>`; su valor inicial ES conserva la interfaz actual. W01 puede proveer su señal global sin crear otro selector:

```ts
// En la configuración global cuando exista el servicio de W01:
{ provide: LESSON_AUDIO_LOCALE, useFactory: () => inject(ServicioDeIdiomaDeW01).locale }
```

El nombre del servicio es ilustrativo, no un contrato impuesto a W01. Si W01 adopta otro catálogo, trasladar las mismas claves y reemplazar ese adaptador local. Cambiar la señal solo traduce mensajes/etiquetas: no recrea el medio, no cambia posición, grabación, A/B ni progreso (cubierto por prueba). Esta entrega no afirma haber completado el selector ni la preferencia persistente global de W01.

## Verificación automatizada

Desde `frontend/`:

```sh
npm ci
npx ng test --watch=false
npm run build
```

Desde `e2e/`:

```sh
npm ci
npx playwright install chromium
npm run e2e:audio
npx tsc --noEmit
```

La configuración `audio.playwright.config.ts` usa frontend en **:4303**, API totalmente interceptada y un servidor de medios en loopback con puerto efímero. No ejecuta el `global-setup` general, no levanta backend y no crea ni borra bases. Bloquea peticiones del navegador a servicios externos; cuentas, token y progreso son ficticios en memoria. No usar `E2E_REAL_CLOUDINARY=1`: esa suite previa implica subidas reales y es ajena a W03.

El MP3 de 12 s es un tono sintético de 440 Hz generado con:

```sh
ffmpeg -y -f lavfi -i 'sine=frequency=440:duration=12' -ar 22050 -ac 1 -codec:a libmp3lame -b:a 24k e2e/fixtures/audio-controls.mp3
```

El WAV PCM se genera en memoria; no hace falta ffmpeg para ejecutar las pruebas. El navegador decodifica y reproduce ambos recursos reales. La instrumentación solo registra instancias del constructor nativo `Audio`, sin simular sus estados, duración, rangos ni eventos. Los casos unitarios sí usan un medio fake para metadata no finita, seek no soportado, buffering, autoplay bloqueado y promesas/eventos tardíos. En navegador también se verifica metadata demorada, salida con `play()` pendiente y bloqueo nativo de autoplay seguido de recuperación con teclado. La prueba de autoplay usa navegación CDP sin gesto y desactiva tracing: los snapshots/evaluaciones de Playwright aportan activación y enmascararían el bloqueo; se comprueba explícitamente que el documento no recibió activación antes del intento.

Los tests de integración del reproductor y los E2E comprueban que reproducir, buscar, repetir, terminar y reintentar no llaman a completar narrativa ni escriben progreso. La navegación comprueba liberación del medio anterior. El frontend existente conserva su suite completa. La suite E2E general que reconstruye MySQL no es necesaria para este cambio solo de audio.

Resultado de esta entrega: **304/304 pruebas unitarias** (41 archivos, 21 casos nuevos), **16/16 E2E** (Chromium escritorio y móvil con toque emulado), TypeScript E2E y build de producción aprobados. Se revisó visualmente la captura a 390 px. Persisten avisos previos de Sass y presupuestos de bundle/otros componentes; los controles nuevos no exceden su presupuesto.

## Prueba manual con cuenta ficticia

1. Abrir un curso de prueba con un keyframe con audio y una historia con ambas grabaciones. Iniciar audio, pausar, usar ±10 s y mover la barra con flechas/Home/End. Verificar posición/duración y que no aparece lectura completada.
2. Abrir «Repetir fragmento A–B». Ingresar A/B válidos o marcarlos en la posición actual, activar y dejar cruzar B. Salir explícitamente. Probar valores vacíos, invertidos o fuera de duración.
3. En lectura completa, cambiar lento/normal durante reproducción y en pausa. Confirmar reinicio desde cero, eliminación de A/B y conservación del estado de reproducción/pausa.
4. Simular red caída o archivo inválido: ver error, restaurar conexión y «Reintentar audio». No debe recargar la lección ni completar narrativa. Simular bloqueo de autoplay y volver a iniciar con un gesto.
5. Cambiar de fragmento, historia y salir del reproductor mientras suena. Confirmar silencio del medio anterior, incluso si finaliza una carga pendiente.
6. Repetir a 390 px con toque y con teclado. Revisar foco y etiquetas con lector de pantalla; los tooltips e ilustraciones deben seguir disponibles.

## Límites y operación

- Escritorio y móvil emulado no sustituyen una prueba en dispositivo físico. No se verificaron Safari/iOS real ni lectores de pantalla físicos en esta entrega.
- La prueba HTTP confirma medios locales reales y soporte de rangos/CORS de la fixture, no la configuración de todas las URLs de Cloudinary o proveedores futuros. Antes de activar, W09 debe verificar muestras autorizadas de cada origen/codec realmente publicado, incluyendo red móvil. No se realizaron subidas ni accesos a cuentas reales.
- No se promete audio en segundo plano ni offline. Restricciones del navegador siguen vigentes.
- Errores visibles y reintento local; no se registran URLs privadas ni se añade telemetría. Autorización, idempotencia comercial y outbox no aplican: no hay mutaciones de servidor desde el audio.
- Reversión: revertir los commits de W03. No hay migraciones, datos que restaurar ni flag global que activar.

## Superficies compartidas tocadas

Ninguna de las enumeradas en SPEC/COORDINACION. `e2e/package.json` añade solo el comando `e2e:audio`; el resto pertenece al módulo del reproductor, sus pruebas y documentación W03.
