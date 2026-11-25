# Auditoría QA/UX, segunda pasada (docente, alumno y administración)

Fecha: 25/11/2026 · Paquete W16 (#111) · Rama `w16-auditoria-2` · Solo revisión, sin cambios de código de la aplicación.

> Informe cerrado el 25/11/2026. Cada hallazgo se reprodujo en la base desechable descrita abajo; lo que no se pudo comprobar figura en «No cubierto».

## 1. Resumen

### Entorno usado
- Base desechable propia: MySQL local, base `spanishnow_master_audit2_test` (el seed maestro solo acepta `spanishnow_main` o `spanishnow_master_*test`). Construida con `npm run db:rebuild` (migraciones + seed curado + verificación) y luego `db:seed:master` con dos docentes: `admin@gmail.com` y `docente2.audit@example.test` (creado solo en esta base) y los alumnos existentes `lucas@gmail.com` y `jane.smith@example.test`, más los 24 alumnos ficticios `master.*@example.test`. Con audio local (`--audio`, voz `Paulina`).
- Backend en el puerto 3102 (`node src/server.js`) y `ng serve --configuration lan` en el 4301 (sin SSL) con un proxy local no versionado hacia `http://localhost:3102` (`/api` y `/uploads-dev`). No se tocaron el 3001, el 4200 ni `spanishnow_main`.
- `.env` propio del worktree (ignorado por git): solo `DB_HOST/PORT/USER/PASSWORD` tomados del `.env` de desarrollo (no se imprimieron), más `DB_NAME` propio, `JWT_SECRET` de prueba, `PORT=3102`, `FRONTEND_URL=http://localhost:4301`, `OUTBOX_WORKER=1`, `MEDIA_FAKE_UPLOADS=1`, `PAYMENTS_FAKE=1`, `INTEGRATIONS_FAKE=1`, `MAIL_TRANSPORT=log` y los `FEATURE_*` de chat, paquetes, agenda, Calendar y Zoom. SMTP, Zoom, Google, Hotmart, Cloudinary y buscadores de imágenes quedaron **sin definir**.
- Comprobación previa de que no sale nada a terceros: `PAYMENTS_FAKE=1` simula el cobro y no llama a Hotmart ni Stripe (`config/payments.js`); `INTEGRATIONS_FAKE=1` sustituye Calendar y Zoom por adaptadores falsos (`config/features.js`, `zoomAdapter.js`); `MAIL_TRANSPORT=log` escribe los correos en consola y `backend/tmp/mail/` en vez de enviarlos (`mailService.js`); `MEDIA_FAKE_UPLOADS=1` guarda en `uploads-dev/` sin Cloudinary. Todos esos modos se niegan a arrancar en producción.
- Navegador integrado sobre `http://localhost:4301`. Para errores de red y consola se usó el registro de red del panel y un gancho a `fetch`/XHR.

### Cuentas
Contraseña de prueba local (`backend/seeds/local-test-accounts.json` y `SEED_MASTER_PASSWORD` por defecto coinciden): docentes `admin@gmail.com` (permisos `users.manage`, `test_users.manage` desde el seed; el resto se asignó desde `/admin/users` durante la prueba) y `docente2.audit@example.test`; alumnos `lucas@gmail.com`, `jane.smith@example.test` y `master.*@example.test`.

### Cobertura
- Tamaños: escritorio 1440x900 y teléfono 390x844 (el preset «mobile» del panel mide 375; se usó un tamaño personalizado de 390). Idiomas: ES en casi todo y EN en `/admin/users`, panel docente (class-packages, dashboard, agenda, mensajes, ventas, class-commerce) y el área del alumno (dashboard, reproductor, mensajes, certificados). Se restauró el preset `desktop` al terminar.
- **Docente `admin@gmail.com` y administración, con efecto real en la base desechable:** permisos desde `/admin/users`; habilitar docentes y ventas desde `/admin/class-commerce` y `/teacher/class-packages`; conectar Google Calendar y Zoom (fake); proponer clases; paquetes (nueva versión con integración de pago de prueba y activación); enviar oferta con paquete y ver su detalle; mensajes; responder, ocultar y listar comentarios; editar curso; añadir vocabulario; compositor de lección (abrir, guardar borrador, publicar); cupón y afiliado nuevos; marcar una orden como reembolsada (proveedor fake); «Quitar acceso»; crear, editar e iniciar una pizarra; cancelar clases (con y sin referencias de Zoom/Calendar); publicar los cuatro textos legales de PRUEBA.
- **Docente `docente2.audit@example.test`:** estados 403 de `/admin/class-commerce` y `/admin/users`, agenda y cancelación de una clase, Zoom sin conectar.
- **Alumno `lucas@gmail.com` y `jane.smith@example.test`:** dashboard, 404, `/teachers`, `/live` y entrada a una pizarra de curso, paquetes, agenda (confirmar zona, aceptar propuesta con Zoom/Calendar fake, rechazar por API), oferta → «Continuar al pago» → «Simular pago confirmado» (flujo fake), reproductor (historia con audio, vocabulario, emparejar, quiz con envío), progreso, certificados (público y PDF), «Mis compras», «Reiniciar progreso», mensajes (envío y extracto en la lista). Público: `/courses`, `/legal/terms`, `/contact`, `/checkout/thanks`, `/auth/login`.
- Worker de la cola activo: `calendar.sync`/`zoom.sync` se procesaron al aceptar una clase (referencias `ready`) y al cancelarla (referencias `cancelled`); una propuesta recién creada con vencimiento adelantado en la base (`proposal.expire`) pasó a `expired` en menos de 20 s sin intervención; los correos salieron solo a `backend/tmp/mail/` (transporte `log`).

### No cubierto y motivo
- **Reprogramar una clase confirmada** («Proponer otro horario» sobre una confirmada) y la sincronización del movimiento en Calendar/Zoom: no se alcanzó; quedan sin verificar CAL/ZOOM de reprogramación. Rechazar una propuesta se probó solo por API (`POST …/proposals/1/decline` → 200, sesión `declined`), no por la interfaz.
- Pizarras del historial y A-06: la semilla maestra solo crea pizarras de clases **completadas**, y el historial se limita a la fecha de creación de las cuentas (hoy), así que `live_classes` empezó vacía; se probó solo una pizarra creada a mano.
- Alta de cuentas de prueba, «Entrar como» y borrado de cuentas de prueba en `/admin/users`; reembolsos de paquetes y ajuste de créditos auditado en `/admin/class-commerce`; pausar/reanudar compras; aceptación de ofertas de grupo; invitaciones a grupos; checkout real de cursos (Hotmart) y registro/recuperación de contraseña (correo); `Tab` en el login (la pulsación de `Tab` del panel no movió el foco en una prueba y no se pudo atribuir a la aplicación); dark mode (no existe selector); edición de preguntas, quiz del docente y «Nueva unidad/historia»; «Buscar imágenes» (necesita un buscador externo, sin configurar a propósito).
- No se pulsó «Iniciar reunión»/«Entrar a la clase» sobre una reunión creada: el adaptador fake devuelve enlaces del dominio real `zoom.us` (ver C2-03) y habría abierto un tercero.
- Móvil (390 px): solo se midió desbordamiento de página (0 px en todas las pantallas docentes revisadas y en el reproductor) y se miró `/teacher/orders`, `/live/1`, `/admin/users` y el reproductor; no se recorrió cada pantalla.

### Conteo de hallazgos nuevos
14 hallazgos: **alta 0, media 3, baja 11**. Por rol: docente 10 (0 alta, 1 media, 9 baja), alumno 1 (0 alta, 1 media, 0 baja), comunes 3 (0 alta, 1 media, 2 baja). Los defectos de la primera pasada ya arreglados no se cuentan.

## 2. Verificación de los arreglos de la primera pasada

Leyenda: **funciona** = comprobado en la interfaz o con la API de la base nueva; **parcial** = el arreglo funciona pero queda un resto, que tiene ficha nueva.

| ID | Resultado | Evidencia (base desechable, ES salvo que se indique) |
|---|---|---|
| A-01 | **parcial** | `/nope-404` (alumno) muestra «ERROR 404 · No encontramos esa página… Tu sesión sigue abierta.» y `localStorage.token` sigue. Pero `/` y el rechazo de `adminGuard` siguen cerrando la sesión: ver C2-02. |
| A-03 | funciona | «Practicar vocabulario» ofrece Flashcards y «Emparejar vocabulario»; ya no aparece «Listen and repeat» sin actividades. |
| A-04 | funciona | Con «Emparejar vocabulario» abierto, Escape lo cierra; cabecera verde con texto claro. |
| A-05 | funciona | «Siguiente curso de la serie: Historias cotidianas…» → «Ir al curso» enlaza a `/student/course/3/play` sin pasar por la página de venta. |
| A-07 | funciona | `GET /api/users/teachers` devuelve `id`, `name`, `coursesCount`, sin email; `/teachers` muestra «Escribir» solo en el docente que recibe consultas. |
| A-11 | funciona | `/class-packages` ofrece «Ver agenda»; la agenda vacía/propuestas se explican desde el docente. |
| C-01 | **parcial** | Una sola palabra con voseo en `frontend/src/app`: «duplicalo» (D2-07). |
| C-02 | funciona | `/contact` ya no promete «Envíanos un mensaje»; muestra «¿Tienes preguntas? Estamos aquí para ayudarte» y los dos correos. |
| C-05 | funciona | `/checkout/thanks` abierto directo dice «Gracias · Si completaste la compra, te enviaremos por email cómo acceder…». |
| C-06 | funciona | En `/auth/login` el foco inicial queda en `INPUT#email`. |
| D-01 | funciona (con matiz) | Sin habilitación, `GET /api/integrations/zoom` → 403 y las dos pantallas muestran «Tu cuenta no tiene este permiso. Pídelo a quien administra la plataforma.» sin estado vacío engañoso. Matiz: la causa es «docente no habilitado para clases», no un permiso del catálogo. Con permisos y habilitación cargados, Zoom y Calendar se conectan (fake). |
| D-02 | funciona | `docente2.audit@example.test` (sin permisos) ve en `/admin/class-commerce` «Tu cuenta no tiene este permiso…»; con el admin de pruebas la pantalla carga (6 `GET /api/admin/*` en 200). |
| D-03 | funciona (con reservas) | `/class-cohorts/1`: tarjetas, «← Grupos de clases», «Abrir conversación» por integrante; al cambiar de `/class-cohorts/1` a `/2` por el router los datos se recargan. Reservas: textos contradictorios (D2-08). |
| D-04 | funciona | Una propuesta con plazo vencido (sin job de expiración) aparece en «Historial» como «Venció · Plazo de respuesta vencido: …» y sin botones; con el worker, `proposal.expire` la pasó a `expired` en menos de 20 s. |
| D-05 | funciona | `/teacher/class-offers/new` sin `conversationId` redirige a `/messages`. |
| D-06 | **parcial** | La lista de paquetes dice «30 días / 90 días»; el formulario y el detalle de oferta siguen en horas («2.160 h»): D2-02. |
| D-07 | funciona | Filas de cupones de la misma altura y un solo estado («Vencido») en el cupón caducado. |
| D-08 | funciona | `/teacher/orders` a 390 px muestra sombra de desplazamiento en el borde derecho de la tabla; ninguna pantalla revisada desborda la página. |
| D-10 | funciona | Abrir el compositor no crea revisión (18 borradores antes y después); cabecera «Publicada · revisión 1. Al guardar se crea la revisión 2.»; «Guardar borrador» crea la 2 y «Publicar» la deja publicada. |
| D-12 | funciona | Zona precargada (`America/Cordoba`) y rótulo «Zona horaria de la clase» sin «IANA»; el selector «Alumno» filtra por quien tiene paquete (en esta base todos). |
| D-13 | funciona | Tras enviar un mensaje, la lista muestra «You: Hello, test message from the student (audit 2).»; con una oferta como último mensaje muestra «Paquete: 4 × 50 min — individual». |
| D-14 | funciona | El eje del gráfico mensual dice «nov 2026». |

Artefactos de la primera pasada en la base nueva: **A-10** no aparece (52 de 52 sesiones sembradas con segundos en 0 y ninguna tarjeta muestra «las reglas de zona difieren»); **A-02** no aparece (0 filas de `lesson_blocks` con URL absoluta a `localhost`, imágenes cargan); **A-08** no aparece (una orden por curso y alumno, tres órdenes de `lucas` en el panel docente y seis en «Mis compras», títulos distintos por docente; recibo «—» por diseño); **C-04** no aparece (11 cursos, 11 títulos distintos en la base y 9 en el catálogo público, sin duplicados); **A-09** no aparece (quiz con tres preguntas distintas y aprobado con 100 %). **C-03**: los cuatro textos legales se publicaron con texto de PRUEBA y `GET /api/public/legal/{terms,privacy,refunds}?locale={es,en}` devuelve 200.

Pendientes conocidos, solo si algo cambió: **D-09** sin cambios (`/live/1` a 390 px arranca al 18 % de zoom y con la barra vertical alta); **A-06** sin cambios en el texto («Tus ideas, tus alumnos y una pizarra para compartir.» para el alumno; el alumno vio la pizarra de su curso, que es lo previsto); **D-11** sin cambios («Calendar y Zoom» en el menú, «Pedidos» frente a «Órdenes» como título, sin botón de ayuda en `/teacher/dashboard`; en `/teacher/integrations` y las agendas sí hay «Ayuda de esta pantalla»).

## 3. Índice de hallazgos nuevos

| ID | Rol | Pantalla / ruta | Tipo | Severidad | Título |
|---|---|---|---|---|---|
| D2-01 | Docente | `/schedule` | funcional | media | Clase confirmada antes de conectar Zoom/Calendar: sin reunión y los botones no ayudan |
| D2-02 | Docente | oferta de paquete | pantalla mal resuelta | baja | Vigencia en horas (2.160 h) frente a 90 días |
| D2-03 | Docente | `/teacher/integrations/zoom` | pantalla mal resuelta | baja | Horas en UTC mientras la Agenda usa la zona del docente |
| D2-04 | Docente/Alumno | `/schedule`, `/messages/:id` | pantalla mal resuelta | baja | «Horario del docente» repite «Tu horario» (alias de zona) |
| D2-05 | Docente/Alumno | `/schedule` | pantalla mal resuelta | baja | «Proponer»/«Aceptar» desactivados sin decir que falta confirmar la zona |
| D2-06 | Admin | `/admin/users` | funcional | baja | Casillas de permisos pulsadas seguidas dejan la pantalla distinta del servidor |
| D2-07 | Docente | `/teacher/class-packages` | estilo | baja | «duplicalo» sobrevive (C-01 incompleto) |
| D2-08 | Docente | `/teacher/class-cohorts`, `/class-cohorts/:id` | pantalla mal resuelta | baja | Grupo completo y con sesión confirmada dice «falta aceptar el horario» |
| D2-09 | Docente | `/teacher/affiliates` | pantalla mal resuelta | baja | La tabla no cabe a 1440 px y oculta las acciones |
| D2-10 | Docente | `/schedule` | rendimiento | baja | Una petición de detalle por clase (N+1) y lista cargada dos veces |
| A2-01 | Alumno | `/student/dashboard`, `/student/progress` | pantalla mal resuelta | media | «Reiniciar progreso» deja «Completado» y certificado con 0/9 historias |
| C2-01 | Común (dev) | `/teacher/integrations` | documentación | baja | El modo fake de Calendar/Zoom exige variables que no se documentan |
| C2-02 | Común | `/`, `/admin/users` sin permiso | funcional | media | Abrir la raíz o ser rechazado por el guard cierra la sesión |
| C2-03 | Común (dev) | `GET /api/class-sessions/:id/join` | seguridad de pruebas | baja | El fake de Zoom devuelve enlaces del dominio real `zoom.us` |

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
- También en la vista del alumno (`/messages/26`, EN, 390 px): «Your time · America/Argentina/Cordoba · UTC-03:00» seguido de «Teacher time: Fri Dec 25 2026 · 07:32–08:22 · America/Cordoba · UTC-03:00», con el mismo horario y dos nombres de zona para lo mismo.
- Sugerencia: ocultar «Horario del docente» cuando quien mira es el docente o cuando ambas zonas dan el mismo desfase. `features/schedule/schedule.component.html`.

#### D2-05 · «Proponer una clase» queda desactivado sin decir por qué cuando la zona no está confirmada
- Severidad: baja. Ruta: `/schedule` → «Proponer una clase» (docente con zona sin confirmar).
- Observado: con alumno, compra y fecha válidos aparece el resumen «Revisa el horario propuesto» pero el botón del panel sigue desactivado; la causa es `!zoneReady()` (zona sin confirmar, el botón «Confirmar zona» está detrás del panel). No hay aviso dentro del panel. Tras confirmar la zona el mismo formulario se envía bien (clase 53 creada). Lo mismo le pasa al alumno: «Aceptar esta propuesta» aparece desactivado hasta pulsar «Confirmar zona» y solo el texto de la tarjeta superior lo insinúa.
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
