# Fase 4: afiliados, comentarios, contenido por fechas y app instalable

Objetivo: cubrir lo que le queda a Hotmart frente a SpanishNow. Afiliados que venden a comisión, preguntas y respuestas en cada lección, liberación gradual de unidades y una app que se instala en el celular.

## Decisiones

- **Afiliados sin cuenta ni Stripe Connect.** El docente da de alta al afiliado (nombre, email, % de comisión) y le pasa dos links: el de venta con `?ref=CODIGO` y un panel privado (`/affiliate/<token secreto>`) donde ve sus ventas y comisiones. Los pagos al afiliado se hacen por fuera (PayPal, transferencia) y el docente los registra. Así no hay roles nuevos ni login para afiliados.
- **Atribución:** último click, ventana de 30 días guardada en `localStorage` del navegador del comprador. El código viaja en `POST /checkout` como `affiliateCode`. La comisión se calcula sobre el monto efectivamente cobrado (después del cupón); con cupón del 100 % la comisión es 0. Sin comisión si el email del comprador es el del afiliado (auto-referido). Reembolso total anula la comisión; parcial la reduce en proporción.
- **Comentarios por lección:** preguntas y respuestas de un nivel (comentario + respuestas). Leen y escriben los alumnos inscriptos y el docente del curso. El docente puede ocultar o borrar cualquiera; el autor puede editar y borrar el suyo. Las respuestas del docente llevan la marca "Profesor/a" (en inglés "Teacher"). Avisos por email: al docente por cada comentario nuevo de primer nivel; al alumno cuando el docente le responde. Límite: 10 comentarios por alumno por hora (el docente del curso no tiene límite).
- **Contenido por fechas (drip) por unidad:** `releaseAfterDays` (días desde la inscripción) y/o `releaseAt` (fecha fija). Si están los dos, se libera cuando se cumplen ambos. Se aplica en el backend (no solo se oculta en la pantalla). El docente nunca ve bloqueos.
- **App instalable (PWA)** con el service worker oficial de Angular: manifiesto, íconos, pantalla sin conexión. No se cachean respuestas de la API (tienen datos privados y dependen del token); solo el "app shell" y los assets estáticos.
- Idiomas como siempre: comprador, afiliado y páginas públicas en inglés; docente en español; alumno en el idioma actual de la app.

## Modelo de datos (migraciones idempotentes)

- `affiliates`: `id`, `teacherId` (FK), `name`, `email`, `code` STRING(40) único (`A-Z0-9-`), `commissionPercent` INTEGER (1–90), `dashboardToken` STRING(64) único (aleatorio, se puede regenerar), `active` BOOLEAN default true, `notes` TEXT nullable, timestamps.
- `orders`, columnas nuevas: `affiliateId` FK nullable, `commissionAmount` INTEGER default 0 (centavos, misma moneda de la orden), `commissionStatus` ENUM('none','pending','void') default 'none'.
- `affiliate_payouts`: `id`, `affiliateId` (FK), `amount` INTEGER, `currency` STRING(3), `paidAt` DATE, `note` STRING(300) nullable, timestamps.
- `lesson_comments`: `id`, `storyId` (FK, cascade), `userId` (FK), `parentId` FK nullable (a `lesson_comments`, solo un nivel), `body` TEXT (1–2000 caracteres), `hidden` BOOLEAN default false, `editedAt` DATE nullable, timestamps. Al borrar un comentario de primer nivel se borran sus respuestas.
- `units`, columnas nuevas: `releaseAfterDays` INTEGER nullable (0–3650), `releaseAt` DATE nullable.

## API

### Afiliados
Docente (solo los suyos):
- `GET /teacher/affiliates` → `[{ id, name, email, code, commissionPercent, active, notes, stats: [{ currency, orders, sales, commission, paid, owed }] }]` (stats por moneda; `owed = commission pendiente - paid`).
- `POST /teacher/affiliates`, `PUT /teacher/affiliates/:id` (`name`, `email`, `commissionPercent` — solo afecta ventas futuras —, `active`, `notes`), `POST /teacher/affiliates/:id/regenerate-token` → `{ dashboardToken }`. `DELETE` solo sin ventas (si tiene, 409 y se desactiva).
- `GET /teacher/affiliates/:id/orders` → órdenes atribuidas (misma forma que `/teacher/orders` + `commissionAmount`, `commissionStatus`).
- `POST /teacher/affiliates/:id/payouts` `{ amount, currency, paidAt, note }` y `GET /teacher/affiliates/:id/payouts`. `DELETE /teacher/affiliates/:id/payouts/:payoutId`.
- `GET /teacher/orders` y el CSV suman `affiliate: { id, name, code } | null` y `commissionAmount`.

Público:
- `GET /public/affiliates/:code` → `{ valid: boolean }` (para no guardar códigos inválidos; sin datos del afiliado).
- `POST /checkout` y `POST /checkout/quote` aceptan `affiliateCode` opcional; un código inválido, inactivo o de otro docente se ignora en silencio (nunca bloquea una compra).
- `GET /public/affiliate-dashboard/:token` → `{ affiliate: { name, code, commissionPercent }, links: [{ courseTitle, url }] (cursos publicados del docente con `?ref=`), stats: [...por moneda], orders: [{ paidAt, courseTitle, amount, currency, commissionAmount, commissionStatus }] (sin datos del comprador), payouts: [...] }`. 404 si el token no existe o el afiliado está inactivo.

### Comentarios
Alumno inscripto o docente del curso (con las reglas de drip: no se comenta en una unidad bloqueada):
- `GET /stories/:id/comments?page` → `{ rows: [{ id, body, author: { id, name, isTeacher }, createdAt, editedAt, hidden, canEdit, canDelete, replies: [...] }], total }`. Los ocultos solo los ve el docente (y el autor, marcados como ocultos). Más nuevos primero, respuestas en orden cronológico. 20 por página.
- `POST /stories/:id/comments` `{ body, parentId? }` → 201. 429 `{ error, code: 'rate_limited' }` si supera el límite.
- `PUT /comments/:id` `{ body }` (autor), `DELETE /comments/:id` (autor o docente) → 204.
- Docente: `PUT /comments/:id/hidden` `{ hidden }`; `GET /teacher/comments?status=unanswered|all&courseId&page` → bandeja con `{ rows: [{ id, body, author, createdAt, story: { id, title }, course: { id, title }, unit: { id, title }, replies: n, answeredByTeacher: boolean }], total }`. "Sin responder" = comentario de primer nivel de un alumno sin respuesta del docente.
- `GET /courses/:id` (alumno) suma `commentCount` por historia.

### Contenido por fechas
- `PUT /units/:id` acepta `releaseAfterDays` y `releaseAt` (null para quitar).
- `GET /courses/:id` para el alumno suma por unidad `locked: boolean` y `availableAt: ISO | null`; las historias de una unidad bloqueada se listan (título y orden) pero sin contenido.
- Bloqueo en el servidor: plan de lección del alumno, progreso (avanzar bloque, responder, completar), materiales de la unidad o sus historias, quiz de la unidad y comentarios responden 403 `{ error, code: 'content_locked', availableAt }`. Los materiales de nivel curso y el video de bienvenida nunca se bloquean.
- `GET /public/courses/:slug` suma por unidad `releaseAfterDays` (para mostrar "Unlocks on day N").
- El certificado sigue exigiendo todo: no cambia.

### Notificaciones por email (inglés para el alumno; español para el docente)
- Al docente: "Nueva pregunta en <lección>" con el texto y link a la lección en la gestión.
- Al alumno: "<Teacher name> replied to your question in <lesson>" (redacción sin pronombres de género), con la respuesta y link a la lección.

## Frontend

Docente (español):
- Menú "Negocio" suma "Afiliados": lista con estadísticas por moneda (ventas, comisión, pagado, adeudado), alta/edición, copiar link de venta con `?ref=` (elegir curso) y copiar link del panel del afiliado, regenerar token con confirmación, detalle con órdenes atribuidas y pagos (registrar pago, borrar pago).
- Órdenes: columna "Afiliado" y comisión.
- Menú "Enseñanza" suma "Comentarios": bandeja con filtro "Sin responder / Todos" y curso, responder en línea, ocultar, borrar, link a la lección. Badge con la cantidad sin responder en el menú.
- Modal de unidad: "Liberar a los N días de la inscripción" y/o "Liberar el día …" con explicación.
- En la gestión del curso, en cada historia, ícono con cantidad de comentarios.

Comprador (inglés):
- Si la URL trae `?ref=CODE`, validarlo con `/public/affiliates/:code` y guardarlo 30 días en `localStorage` (último click gana); mandarlo en quote y checkout. Nunca romper la página si falla.
- `/affiliate/:token` (inglés): panel del afiliado con sus links para copiar, estadísticas, ventas y pagos.

Alumno:
- Reproductor: sección "Preguntas y comentarios" debajo de cada lección (lista, publicar, responder, editar, borrar, marca "Teacher" en la respuesta del docente, estado oculto propio). Unidades bloqueadas en la barra lateral con candado y "Disponible el <fecha>"; al abrirlas, pantalla explicando cuándo se liberan.
- App instalable: botón "Instalar app" en el menú del usuario cuando el navegador lo permite (`beforeinstallprompt`), instrucciones para iPhone (Compartir → Agregar a inicio) cuando es Safari en iOS, aviso "Hay una versión nueva — Actualizar" cuando el service worker detecta una versión nueva, y aviso discreto "Sin conexión" cuando se pierde la red.

PWA:
- `@angular/service-worker` (versión que corresponda a Angular 21), `ngsw-config.json` con assetGroups para el app shell y assets; sin dataGroups para `/api`. Registro solo en build de producción.
- `manifest.webmanifest`: `name: "SpanishNow"`, `short_name: "SpanishNow"`, `start_url: "/student/dashboard"`, `display: "standalone"`, `theme_color` y `background_color` de la marca, íconos 192, 512 y maskable 512 generados a partir de `public/logo-mark.svg` (PNG versionados en el repo). Meta tags de iOS (`apple-touch-icon`, `apple-mobile-web-app-capable`).

## Pruebas
Backend (jest): atribución y comisión (cupón, 100 %, auto-referido, código inválido ignorado, afiliado inactivo, de otro docente), anulación por reembolso total y proporcional por parcial (idempotente con el webhook), stats por moneda y adeudado con pagos, panel público sin datos de compradores y 404 con token inválido o regenerado, CRUD de afiliados solo del dueño. Comentarios: permisos (inscripto, docente, ajeno, otro curso), respuestas de un nivel, ocultos, editar/borrar, límite por hora, bandeja sin responder, emails. Drip: cálculo de disponibilidad (días, fecha, ambos), 403 `content_locked` en cada endpoint protegido, el docente nunca bloqueado.
Frontend: build de producción sin errores con el service worker, tests unitarios de la atribución (guardar, vencer a los 30 días, último click), del cálculo de "Disponible el …" y de la detección de instalación/iOS.
