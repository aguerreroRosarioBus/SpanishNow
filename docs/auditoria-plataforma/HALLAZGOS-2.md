# Auditoría QA/UX, segunda pasada (docente, alumno y administración)

Fecha: 25/11/2026 · Paquete W16 (#111) · Rama `w16-auditoria-2` · Solo revisión, sin cambios de código de la aplicación.

> **Estado: borrador incremental.** Este archivo se va completando durante la auditoría; las secciones «Resumen», «Verificación» e «Índice» se cierran al final.

## 1. Resumen

### Entorno usado
- Base desechable propia: MySQL local, base `spanishnow_master_audit2_test` (el seed maestro solo acepta `spanishnow_main` o `spanishnow_master_*test`). Construida con `npm run db:rebuild` (migraciones + seed curado + verificación) y luego `db:seed:master` con dos docentes: `admin@gmail.com` y `docente2.audit@example.test` (creado solo en esta base) y los alumnos existentes `lucas@gmail.com` y `jane.smith@example.test`, más los 24 alumnos ficticios `master.*@example.test`. Con audio local (`--audio`, voz `Paulina`).
- Backend en el puerto 3102 (`node src/server.js`) y `ng serve --configuration lan` en el 4301 (sin SSL) con un proxy local no versionado hacia `http://localhost:3102` (`/api` y `/uploads-dev`). No se tocaron el 3001, el 4200 ni `spanishnow_main`.
- `.env` propio del worktree (ignorado por git): solo `DB_HOST/PORT/USER/PASSWORD` tomados del `.env` de desarrollo (no se imprimieron), más `DB_NAME` propio, `JWT_SECRET` de prueba, `PORT=3102`, `FRONTEND_URL=http://localhost:4301`, `OUTBOX_WORKER=1`, `MEDIA_FAKE_UPLOADS=1`, `PAYMENTS_FAKE=1`, `INTEGRATIONS_FAKE=1`, `MAIL_TRANSPORT=log` y los `FEATURE_*` de chat, paquetes, agenda, Calendar y Zoom. SMTP, Zoom, Google, Hotmart, Cloudinary y buscadores de imágenes quedaron **sin definir**.
- Comprobación previa de que no sale nada a terceros: `PAYMENTS_FAKE=1` simula el cobro y no llama a Hotmart ni Stripe (`config/payments.js`); `INTEGRATIONS_FAKE=1` sustituye Calendar y Zoom por adaptadores falsos (`config/features.js`, `zoomAdapter.js`); `MAIL_TRANSPORT=log` escribe los correos en consola y `backend/tmp/mail/` en vez de enviarlos (`mailService.js`); `MEDIA_FAKE_UPLOADS=1` guarda en `uploads-dev/` sin Cloudinary. Todos esos modos se niegan a arrancar en producción.
- Navegador integrado sobre `http://localhost:4301`. Para errores de red y consola se usó el registro de red del panel y un gancho a `fetch`/XHR.

### Cuentas
Contraseña de prueba local (`backend/seeds/local-test-accounts.json` y `SEED_MASTER_PASSWORD` por defecto coinciden): docentes `admin@gmail.com` (permisos `users.manage`, `test_users.manage` desde el seed; el resto se asignó desde `/admin/users` durante la prueba) y `docente2.audit@example.test`; alumnos `lucas@gmail.com`, `jane.smith@example.test` y `master.*@example.test`.

*(resto del resumen, cobertura y conteos: pendiente)*

## 2. Verificación de los arreglos de la primera pasada

*(pendiente)*

## 3. Índice de hallazgos nuevos

*(pendiente)*

## 4. Fichas

### Fichas (docente y administración)

#### D2-01 · Una clase confirmada antes de conectar Zoom/Calendar nunca se sincroniza y los botones no ayudan
- Severidad: **media**. Ruta: `/schedule` (docente `admin@gmail.com`, escritorio 1440 px, ES), clases confirmadas del seed.
- Pasos: con Zoom y Google Calendar ya conectados (adaptadores fake), abrir una clase confirmada creada antes de conectar → pulsar «Iniciar reunión»; luego desplegar «Calendario y reunión» → «Reintentar sincronización».
- Esperado: o bien la conexión posterior sincroniza las clases futuras ya confirmadas (o lo ofrece), o los botones explican qué falta.
- Observado: «Iniciar reunión» → `GET /api/class-sessions/25/join` **503**, alerta «El servicio externo no está disponible por el momento. Intenta más tarde.» con «Reintentar». «Reintentar sincronización» → `POST /api/class-sessions/25/sync/retry` **409** `{"code":"integration_not_connected"}`; la pantalla muestra, lejos del botón, «Conecta el servicio necesario antes de continuar.» aunque Zoom y Calendar figuran «Conectado». `sync: []` en `GET /api/class-sessions/25`.
- Causa (código): `classSessionService.retrySync` solo reintenta proveedores que ya tienen fila en `external_sync_refs`; las sesiones confirmadas antes de conectar no tienen ninguna, así que no hay camino para crearla (`zoomService.js:184` devuelve 503 `provider_unavailable` si el docente no tiene `externalId`). No es artefacto: es el caso normal de una docente que conecta Zoom/Calendar con clases ya confirmadas (el seed lo reproduce porque no crea referencias externas).
- Sugerencia: al conectar (o en «Reintentar») encolar `zoom.sync`/`calendar.sync` para las sesiones confirmadas futuras sin referencia; mientras tanto, mensaje específico («Esta clase no tiene reunión: créala o reintenta»). `backend/src/services/classSessionService.js` (`retrySync`), `zoomService.js`, y el manejo del error en `features/schedule/schedule.component.ts`.

#### D2-02 · Oferta de paquete: la vigencia sigue en horas (2.160 h) aunque el paquete dice 90 días
- Severidad: baja. Rutas: `/teacher/class-offers/new?conversationId=25` y `/class-offers/65` (docente, 1440 px, ES).
- Observado: en `/teacher/class-packages` el paquete «4 × 50 min» muestra «Vigencia 90 días transcurridos desde el pago» (D-06 arreglado), pero el formulario de oferta y el detalle muestran «Vigencia 2.160 h transcurridos desde el pago».
- Sugerencia: reutilizar el formateador en días de D-06 en el resumen de oferta. `features/packages/` (componente de oferta/resumen de paquete).

#### D2-03 · Reuniones Zoom: horas en UTC mientras la Agenda usa la zona del docente
- Severidad: baja. Ruta: `/teacher/integrations/zoom` (docente, ES).
- Observado: «28 de nov de 2026, 10:32 a. m. UTC · 50 min» para la misma clase que la Agenda muestra «sáb 28 nov 2026 · 07:32–08:22 · America/Argentina/Cordoba · UTC-03:00». Los valores son equivalentes, pero obligan a convertir mentalmente y chocan con la regla de mostrar la zona de quien mira.
- Sugerencia: formatear con la zona confirmada del docente. `features/zoom/zoom-card.component.ts`.

#### D2-04 · Agenda del docente: «Horario del docente» duplica «Tu horario» cuando la zona del dispositivo es un alias de la de la clase
- Severidad: baja. Ruta: `/schedule` tras «Confirmar zona» (docente, zona del dispositivo `America/Cordoba`, clase en `America/Argentina/Cordoba`).
- Observado: cada tarjeta añade un bloque «Horario del docente / sáb 28 nov 2026 · 07:32–08:22 / America/Argentina/Cordoba · UTC-03:00» justo debajo de «Tu horario · America/Argentina/Cordoba · UTC-03:00», es decir, el docente ve su propio horario dos veces (y con dos nombres de zona para lo mismo). El falso aviso de A-10 ya no aparece.
- Sugerencia: ocultar «Horario del docente» cuando quien mira es el docente o cuando ambas zonas dan el mismo desfase. `features/schedule/schedule.component.html`.

#### D2-05 · «Proponer una clase» queda desactivado sin decir por qué cuando la zona no está confirmada
- Severidad: baja. Ruta: `/schedule` → «Proponer una clase» (docente con zona sin confirmar).
- Observado: con alumno, compra y fecha válidos aparece el resumen «Revisa el horario propuesto» pero el botón del panel sigue desactivado; la causa es `!zoneReady()` (zona sin confirmar, el botón «Confirmar zona» está detrás del panel). No hay aviso dentro del panel. Tras confirmar la zona el mismo formulario se envía bien (clase 53 creada).
- Sugerencia: aviso en el panel («Confirma tu zona horaria para proponer») o botón «Confirmar zona» dentro del panel. `schedule.component.html` (~línea 275).

#### D2-06 · Permisos de `/admin/users`: marcar varias casillas seguidas deja la pantalla distinta del servidor
- Severidad: baja (condición de carrera, difícil con clics humanos). Ruta: `/admin/users` → «Administrar usuario» (admin, 1440 px, ES).
- Pasos: en el panel de `admin@gmail.com`, marcar 8 permisos en menos de un segundo (automatización).
- Observado: las 11 casillas quedaron marcadas en pantalla, pero la base solo guardó 8 (`class_packages.manage_all`, `class_payments.review` y `class_sessions.support` no se guardaron). Al desmarcar y volver a marcar esas tres, quedó correcto.
- Causa (código): `togglePermission` arma la lista nueva a partir de `u.permissions` local y envía la lista completa; con dos cambios antes de la respuesta del primero, el segundo parte de una lista vieja y pisa el anterior (`admin-users.component.ts:255`).
- Sugerencia: deshabilitar las casillas del usuario mientras `busy`, o enviar el cambio puntual (añadir/quitar una clave) y reconciliar con la respuesta.

#### D2-07 · «Duplicalo» sobrevive en una confirmación (C-01 incompleto)
- Severidad: baja. Ruta: `/teacher/class-packages` → archivar un paquete (ES). Texto: «Si quieres volver a usarlo, duplicalo.» en `features/packages/packages.i18n.ts`. Es la única palabra con voseo que queda en `frontend/src/app` (búsqueda por la lista de imperativos y formas en -ás/-és).

#### C2-01 · Los adaptadores fake de Calendar y Zoom no funcionan solo con `INTEGRATIONS_FAKE=1` (faltan variables que nada documenta para ese modo)
- Severidad: baja (documentación / experiencia de desarrollo; no es producción). Ruta: `/teacher/integrations` → «Conectar Google Calendar».
- Observado: con `INTEGRATIONS_FAKE=1` y `FEATURE_GOOGLE_CALENDAR=1`, `POST /api/integrations/google-calendar/connect` → **500** «Ocurrió un error. Por favor intenta de nuevo.» (log: «Falta configurar la clave de cifrado de Google en el servidor.», `GOOGLE_TOKEN_ENCRYPTION_KEY`). Con la clave definida, el «consentimiento» fake redirige a `http://localhost:3000/api/integrations/google-calendar/callback` (valor por defecto de `GOOGLE_CALENDAR_REDIRECT_URI`) y en un entorno con otro puerto la pantalla queda en blanco y la conexión en «Conectando…»; hay que definir `GOOGLE_CALENDAR_REDIRECT_URI` y `ZOOM_REDIRECT_URI` apuntando al backend propio.
- Esperado: el modo fake debería funcionar con solo el flag (o la documentación decir qué más hace falta); la falta de clave debería ser un 503 con mensaje claro y no un 500 genérico.
- Sugerencia: documentar en `backend/.env.example` y `CONFIGURAR-INTEGRACIONES.md` que `INTEGRATIONS_FAKE=1` sigue exigiendo `GOOGLE_TOKEN_ENCRYPTION_KEY` y los `*_REDIRECT_URI` (los de .env.example apuntan al puerto 3000), o derivar la URL de `PORT`/`FRONTEND_URL` en modo fake.

*(se añaden más fichas durante la auditoría)*
