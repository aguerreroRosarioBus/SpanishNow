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

*(tabla final pendiente; notas de trabajo mientras se audita)*

Notas de trabajo (docente/admin, 1440 px, ES), a pasar a la tabla:
- C-06: funciona, el foco inicial de `/auth/login` queda en `INPUT#email`.
- D-01: funciona; sin habilitación de clases `GET /api/integrations/zoom` → 403 y las dos pantallas muestran «Tu cuenta no tiene este permiso. Pídelo a quien administra la plataforma.» sin estado vacío engañoso. Matiz: la causa es «docente no habilitado para clases» (`teacher_class_settings.classesEnabledAt`), no un permiso del catálogo; el texto habla de «permiso». Con permisos y habilitación cargados, el 403 desaparece.
- D-02: con permisos, `/admin/class-commerce` carga (6 `GET /api/admin/*` en 200). El estado 403 se comprobará con `docente2.audit@example.test` (sin permisos).
- D-03: funciona (tarjetas, «← Grupos de clases», «Abrir conversación» por integrante; al cambiar `/class-cohorts/1` → `/class-cohorts/2` por el router los datos se recargan). Ver D2-08 por textos contradictorios.
- D-04 / A-10: funciona; ninguna tarjeta de la agenda muestra el aviso «las reglas de zona difieren» (la semilla ahora tiene segundos en 0). Las propuestas con plazo vigente (hasta mañana 16:30) siguen «Esperando aceptación»; la expiración con worker se prueba más abajo.
- D-05, D-06: D-06 funciona en la lista (días); en la oferta falta (D2-02).
- D-07: funciona (filas de la misma altura, un solo estado «Vencido»).
- D-10: funciona. Abrir el compositor de una historia publicada no crea revisión (18 borradores antes y después en `lesson_plans`); cabecera «Publicada · revisión 1. Al guardar se crea la revisión 2.»; «Guardar borrador» creó la revisión 2 en borrador y «Publicar» la dejó publicada (BD: revisiones 1 y 2 `published`).
- D-12: funciona en parte: la zona sale precargada (America/Cordoba) y sin «IANA»; el selector «Alumno» filtra por quien tenga paquete, y en esta base todos los alumnos tienen uno (26 opciones).
- D-13: la lista muestra el tipo del último mensaje («Propuesta de horario»); tras enviar un mensaje de texto a `lucas` falta ver el extracto (se confirma en la pasada del alumno).
- A-08, C-04: confirmado en la base nueva: la lista de órdenes del docente muestra una orden por curso y alumno (`lucas`: 3 órdenes, una por curso).
- C-01: casi: queda «duplicalo» (D2-07).
- (alumno `lucas`, 1440 px, ES) A-01: funciona; `/nope-404` muestra «ERROR 404 · No encontramos esa página… Tu sesión sigue abierta.» y `localStorage.token` sigue.
- A-02: funciona; 0 filas de `lesson_blocks` con URL absoluta a `localhost` (todas `/seed-master/*.svg`); las imágenes del reproductor cargan.
- A-03: funciona; «Practicar vocabulario» ofrece Flashcards y «Emparejar vocabulario» y ya no muestra «Listen and repeat» sin actividades.
- A-04: funciona; con «Emparejar vocabulario» abierto, Escape lo cierra; la cabecera es verde con texto claro.
- A-05: funciona; «Siguiente curso de la serie: …» con «Ir al curso» enlaza directo a `/student/course/3/play`.
- A-07: funciona; `GET /api/users/teachers` devuelve solo `id`, `name`, `coursesCount`, sin email; `/teachers` muestra «Escribir» solo para el docente que recibe consultas.
- A-09: funciona; el quiz «Repaso: Presentarnos y conocernos» tiene tres preguntas distintas y se aprobó con 100 %.
- A-11: funciona; `/class-packages` ofrece «Ver agenda» en lugar de «Schedule a class».
- (docente) D-14: funciona; el eje del gráfico dice «nov 2026».
- (docente) D-05: funciona; `/teacher/class-offers/new` sin conversación redirige a `/messages`.
- C-03: los cuatro documentos se publicaron con texto de PRUEBA desde `/admin/legal` y `GET /api/public/legal/{terms,privacy,refunds}?locale={es,en}` devuelve 200. Nota: `/admin/legal` rechaza publicar con correos `@*.test` o `example.*` («Todavía no se puede publicar… Completa estos campos: Contacto, Consultas de privacidad»); se usó el dominio reservado `.invalid`.

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

#### D2-08 · Grupo de clases ya completo y con sesión confirmada sigue diciendo «falta aceptar el horario»
- Severidad: baja (texto incorrecto). Rutas: `/teacher/class-cohorts` y `/class-cohorts/1` (docente, 1440 px, ES).
- Observado: el grupo 1 (Emily Scott, Daniel Green) tiene `status = ready`, 2 de 2 invitaciones aceptadas y su sesión 25 está `confirmed` (y aparece «Confirmada» en la Agenda), pero la lista y el detalle dicen «Grupo pagado — falta aceptar el horario de la sesión · 2 de 2 invitaciones aceptadas», y el detalle añade «Podrás enviar las ofertas cuando todas las personas hayan aceptado su invitación.» aunque todas ya aceptaron. El grupo 2 igual (sesión 26 confirmada).
- Causa: `packages.group.status.ready` es la única etiqueta para `ready` y no mira si ya hay sesión confirmada (`features/packages/packages.i18n.ts:553`); el enum del modelo no tiene un estado «programado».
- Sugerencia: derivar «Clase confirmada para el …» cuando exista sesión confirmada y ocultar el aviso de ofertas cuando `accepted === total`.

#### D2-09 · Afiliados: la tabla no cabe a 1440 px y deja fuera la columna de acciones
- Severidad: baja. Ruta: `/teacher/affiliates` (1440 px, ES). La tabla mide 1124 px en un contenedor de 1038 px (`overflow-x: auto`), de modo que los botones de cada fila (ver, editar, enlace) quedan fuera de vista hasta desplazar. En el seed hay 4 afiliados; con más columnas de importes en otro idioma sería peor.
- Sugerencia: acortar encabezados («Comisión generada») o pasar las acciones a un menú «…» fijo a la derecha. `.data-table` compartido.

#### D2-10 · La Agenda pide el detalle de cada clase una por una (N+1) y carga la lista dos veces
- Severidad: baja (rendimiento; crece con las clases). Ruta: `/schedule` (docente, 1440 px).
- Observado: con 25 clases, una navegación directa hace `GET /api/class-sessions` (primero `net::ERR_ABORTED`, luego 200), `…/reminders`, `…/options` (también abortado y repetido) y luego 25 peticiones `GET /api/class-sessions/{id}` seguidas, una por clase. En la Agenda de `lucas` el registro de red de una sola sesión de pantalla acumuló más de 340 peticiones a `/api/class-sessions`.
- Sugerencia: devolver en el listado los campos que usa la tarjeta o cargar el detalle solo al desplegar; evitar la doble inicialización. `features/schedule/schedule.component.ts`.

#### A2-01 · «Reiniciar progreso» deja el curso «Completado» y con certificado, con 0/9 historias
- Severidad: media (dato contradictorio). Rutas: `/student/dashboard` y `/student/progress` (alumno `lucas`, 1440 px, ES).
- Pasos: en una tarjeta de curso completado → «Reiniciar progreso» → confirmar («Se borrarán tu avance por historia, tus respuestas y tus refuerzos completados»).
- Observado: `DELETE /api/enrollments/170/reset-progress` → 200 y toast «Progreso del curso reiniciado exitosamente.»; en la base `lesson_progress` queda con 0 filas y `GET /api/enrollments/170/progress` devuelve todo en cero. Pero la tarjeta sigue en «Completado · Repasar curso» tras recargar, y `/student/progress` muestra «Historias completadas 0/9 · 0% · Quizzes aprobados 0/3 · Tu certificado está listo · Código …». El certificado persiste (1 fila en `certificates`) y el estado «Completado» se deriva de él (`student-dashboard.component.ts:50`).
- Esperado: o bien el diálogo avisa de que el certificado se conserva y la tarjeta muestra el progreso real («0/9, certificado obtenido»), o el reinicio retira el estado de completado.
- Sugerencia: separar «certificado obtenido» de «curso completado» en la tarjeta y en `/student/progress`; si el certificado debe conservarse, decirlo en la confirmación.

#### C2-02 · Abrir la raíz `/` (o ser rechazado por `adminGuard`) cierra la sesión: A-01 sigue en parte
- Severidad: media. Rutas: `/` y `/admin/users` sin permiso (docente `docente2.audit@example.test` y alumno, 1440 px, ES).
- Pasos: iniciar sesión → escribir `http://localhost:4301/` en la barra (o abrir `/admin/users` siendo docente sin `users.manage`).
- Observado: se termina en `/auth/login` y `localStorage.token`/`user` quedan vacíos (comprobado dos veces). `app.routes.ts:20` redirige `''` a `auth/login` y `LoginComponent` llama a `logout()` en su constructor (`login.component.ts:49`); `adminGuard` devuelve `createUrlTree(['/'])` para quien no es admin (`auth.guard.ts:53`), con el mismo resultado. Los enlaces del logo de la propia app apuntan al dashboard, así que solo se llega por URL escrita, marcador o rechazo del guard. La página 404 de A-01 sí funciona (`/nope-404` conserva la sesión).
- Esperado: `/` con sesión lleva al dashboard del rol; un rechazo por permiso lleva a una pantalla «Sin acceso» o al dashboard, sin cerrar sesión.
- Sugerencia: `''` → guard que redirija según rol/sesión, y `adminGuard` → `/teacher/dashboard` o `/student/dashboard`. `frontend/src/app/app.routes.ts`, `core/guards/auth.guard.ts`.

#### C2-03 · El adaptador fake de Zoom devuelve enlaces del dominio real `zoom.us`
- Severidad: baja (seguridad de pruebas, no producción). Ruta: `GET /api/class-sessions/53/join` (alumno).
- Observado: `{"joinUrl":"https://zoom.us/j/333951588?pwd=b4bd…","manual":false}` con `INTEGRATIONS_FAKE=1`. «Entrar a la clase» abre un dominio real (no se pulsó); quien pruebe puede contactar sin querer a un tercero con identificadores inventados.
- Sugerencia: que el fake use un dominio inequívocamente falso (`https://zoom.fake.invalid/j/…`) o una página local de prueba. `backend/src/services/zoomFakeAdapter.js`.

*(se añaden más fichas durante la auditoría)*
