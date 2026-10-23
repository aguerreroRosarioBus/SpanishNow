# Contrato técnico W00: clases, chat, paquetes e integraciones

Versión **1.8** · 22/10/2026 · Paquete W00 ([#13](https://github.com/aguerreroRosarioBus/SpanishNow/issues/13)) · Responsable: orquestador de turno.

Este documento convierte la [guía](SPEC.md) §13 en un contrato que los paquetes W01–W09 consumen sin renegociar. La guía manda sobre el *qué*; este contrato fija nombres, tablas, estados, invariantes, formatos y rutas. Cambiarlo exige un PR que suba la versión, actualice la tabla de cambios del final y avise en el issue «Orquestación» (#23) a los paquetes afectados.

Estado de la implementación en W00: el esquema completo (§3) existe como migración y modelos; la mecánica transversal (ledger de saldo, outbox/jobs, flags, capacidades, limpieza de cuentas de prueba, utilidades de dinero) está implementada con pruebas. Ninguna ruta de §9 existe todavía: cada paquete implementa las suyas respetando esta tabla.

---

## 1. Convenciones

### 1.1 Dinero (PACK-01)

- Importe: **entero en unidades menores** (`INT`), nunca `DECIMAL`/`FLOAT` ni texto. USD 15 = `1500`.
- Moneda: columna `currency` `CHAR(3)` con código ISO 4217 **en mayúsculas** (`USD`). Las órdenes de cursos existentes guardan minúsculas (`usd`); no se tocan, y nada mezcla importes de ambas tablas.
- Nunca se suman importes de monedas distintas: las utilidades lanzan error (`money.assertSameCurrency`).
- Utilidades generales de prorrateos y repartos (no constituyen una política de devolución automática; P01 §7.7): `money.allocate(total, pesos)` con **mayor resto** determinista; ante empate de restos gana el índice menor. La suma de partes es exactamente `total` y ninguna parte es negativa. Reembolso de *k* unidades no usadas de *n*: `money.prorate(pagado, n, k)` = parte de las *k* últimas en `allocate(pagado, [1×n])`, por lo que la suma de todos los reembolsos parciales posibles nunca supera lo pagado.
- En API: `{ "amount": 9000, "currency": "USD" }`. El cliente formatea con `Intl.NumberFormat` según su idioma; el idioma no cambia la moneda (I18N-02).

### 1.2 Tiempo (TZ-01–TZ-06, TZ-16)

- **Persistencia**: columnas `DATETIME` en **UTC**. La conexión Sequelize fija `timezone: '+00:00'` de forma explícita (`src/config/database.js`); el resultado no depende de `TZ` del proceso ni de `time_zone` de MySQL (prueba «UTC persistence» en `backend/tests/w00.foundation.test.js`).
- **API, salida**: instantes ISO 8601 con `Z` y milisegundos (`2026-10-22T13:00:00.000Z`).
- **API, entrada**: un instante se acepta solo con `Z` o desplazamiento explícito (`2026-10-22T09:00:00-04:00`). Una cadena sin zona se rechaza con `time_without_zone`. Las horas de pared se envían como *intención local* (§1.3), nunca como instante.
- **Zonas**: identificador IANA (`America/Argentina/Cordoba`) en `VARCHAR(64)`, validado con `Intl.supportedValuesOf('timeZone')` + alias que acepte `Temporal`. Prohibido `UTC-3`, `EST`, países.
- **Biblioteca**: [`@js-temporal/polyfill`](https://github.com/js-temporal/temporal-polyfill) **0.5.1** (fijada sin `^`), en backend y frontend, hasta que el runtime traiga `Temporal` nativo. Verificada al redactar este contrato con `TZ=Asia/Tokyo`: TZ-T01–T03 dan `13:00Z`, `13:00Z`, `14:00Z`; TZ-T04 lanza `RangeError` con `disambiguation: 'reject'`; TZ-T05 da `05:30Z`/`06:30Z` con `earlier`/`later`; TZ-T06 da Córdoba 22/10 23:30 y Londres 23/10 03:30; Katmandú (+05:45) correcto. `Intl.DateTimeFormat` solo para presentar. La agrega W06 (dueño de las utilidades de zona); ningún otro paquete convierte hora local a instante.
- **Duraciones**: siempre en unidades explícitas (`validityHours`, `minutes`, `leadTimeHours`). «90 días» = `2160` horas transcurridas entre instantes UTC (TZ-16). Nada de sumar «1 día» de calendario.
- **Comparaciones de plazo**: con instantes UTC y desigualdad documentada por regla. «Al menos 24 h antes» incluye el límite exacto: `startsAt - now >= 24 h` es *en plazo* (TZ-T09).
- **Intervalos**: semiabiertos `[startsAt, endsAt)`. Dos intervalos chocan si `a.start < b.end + buffer && b.start < a.end + buffer` (AGENDA-04).

### 1.3 Intención local de una sesión (TZ-05, TZ-12, TZ-13)

Toda propuesta de horario viaja y se guarda así:

```json
{
  "localStart": "2026-11-01T01:30",
  "timeZone": "America/New_York",
  "offset": "-05:00",
  "disambiguation": "later",
  "minutes": 50
}
```

- El servidor recalcula el instante con `Temporal` y `disambiguation: 'reject'`; si la hora no existe responde `local_time_nonexistent` con `params.alternatives` (instantes válidos antes/después). Si es ambigua y falta `disambiguation`, responde `local_time_ambiguous` con `params.options` (`[{ offset, startsAt }]` ×2).
- Si `offset` no coincide con el de esa zona y fecha, responde `offset_mismatch` (TZ-T08). El cliente nunca envía `startsAt` para crear o reprogramar.
- Se guardan `localStart`, `timeZone`, `utcOffset`, `disambiguation` (`none`/`earlier`/`later`), `startsAt`, `endsAt` y la `version` de la sesión.

### 1.4 Identificadores, versiones e idempotencia

- PK `INT` autoincremental (como el resto del esquema); `BIGINT` en tablas de alto volumen (`messages`, `class_credit_ledger`, `outbox_jobs`, `payment_provider_events`, `audit_logs`).
- Los IDs no dan acceso: todo recurso se autoriza por pertenencia (CONTRACT-02). Un recurso ajeno responde **404** `not_found`, igual que uno inexistente.
- Mutaciones sobre algo versionado (sesión, propuesta, plantilla) envían `version` y reciben `409 version_conflict` si no es la vigente.
- Claves de idempotencia del cliente: header `Idempotency-Key` (≤ 64, `[A-Za-z0-9_-]`, permitido en CORS) en checkout y en creación de ofertas/sesiones; `clientMessageId` en mensajes. Repetir la misma clave devuelve el mismo resultado con **200**, no un error.
- Claves internas de operación (`operationKey`, `dedupeKey`): texto determinista con el formato `<verbo>:<agregado>:<id>[:...]`, únicas en base (§4).

### 1.5 Errores (I18N-04, CONTRACT-02)

Cuerpo único, compatible con el `{ error }` existente:

```json
{ "error": "Texto en español para logs y clientes viejos", "code": "insufficient_credit", "params": { "available": 0 } }
```

El frontend traduce por `code` + `params`; `error` es solo respaldo. Catálogo en §10. Un servicio lanza un error con `statusCode`, `code` (minúsculas, estable) y `params`; el middleware común `backend/src/middlewares/error.middleware.js` responde con ese cuerpo (los `code` de Node/sistema nunca se exponen). `CreditError` ya sigue esta forma.

---

## 2. Diagrama de entidades

```mermaid
erDiagram
  users ||--o| teacher_class_settings : "docente"
  users ||--o{ conversations : "teacherId / studentId"
  conversations ||--|{ conversation_participants : ""
  conversations ||--o{ messages : "seq"
  users ||--o{ class_package_templates : "teacherId"
  class_package_templates ||--|{ class_package_template_versions : "inmutables"
  class_policy_versions ||--o{ class_package_template_versions : ""
  class_package_template_versions ||--o{ class_offers : "snapshot"
  conversations ||--o{ class_offers : ""
  class_cohorts ||--o{ class_offers : "grupo"
  class_cohorts ||--|{ class_cohort_members : ""
  class_offers ||--|{ class_offer_beneficiaries : ""
  class_offers ||--o{ class_package_orders : "intentos"
  class_package_orders ||--o{ payment_provider_events : ""
  class_package_orders ||--o| class_package_purchases : "1 compra por orden pagada"
  class_package_purchases ||--|{ class_package_beneficiaries : ""
  class_package_purchases ||--o{ class_credit_ledger : "movimientos"
  class_sessions ||--|{ class_session_proposals : "version"
  class_sessions ||--|{ class_session_participants : "plazas"
  class_session_participants }o--|| class_package_purchases : "consume de"
  class_sessions ||--o{ external_sync_refs : "Calendar / Zoom"
  users ||--o{ external_connections : "Calendar / Zoom"
  live_classes ||--o{ class_sessions : "pizarra opcional"
  outbox_jobs }o..o{ class_sessions : "aggregateType/Id"
  users ||--o{ legal_acceptances : ""
  users ||--o{ audit_logs : "actorId"
```

---

## 3. Entidades, columnas y estados

Nombres de tabla en `snake_case` plural, columnas en `camelCase` (convención del repo). Todas con `createdAt`/`updatedAt` salvo las tablas *append-only*, que solo tienen `createdAt`. Migración: `backend/migrations/20261108000000-create-classes-chat-foundation.js`. Modelos en `backend/src/models/` registrados en `models/index.js`.

### 3.1 Preferencias de usuario (W01)

Columnas nuevas en `users`: `locale ENUM('en','es') NULL`, `timeZone VARCHAR(64) NULL`, `timeZoneConfirmedAt DATETIME NULL`. `NULL` = sin elegir (se aplica el orden de I18N-01). Cambiar `timeZone` nunca modifica sesiones (TZ-04).

### 3.2 Configuración docente — `teacher_class_settings`

`userId` (PK, FK users CASCADE), `classesEnabledAt` (lo activa un admin con `class_teachers.manage`; `NULL` = el docente no aparece para consultas ni vende; §16), `acceptsInquiries BOOL`, `salesPausedAt` (pausa de ventas, PACK-05/AC21), `sessionBufferMinutes SMALLINT DEFAULT 10`, `minLeadTimeHours SMALLINT DEFAULT 24`. Esta fila es también el **cerrojo de agenda del docente** (§6.3).

### 3.3 Chat (W04)

| Tabla | Columnas clave | Unicidad / índices |
| --- | --- | --- |
| `conversations` | `teacherId`, `studentId`, `createdById`, `lastMessageSeq INT`, `lastMessageAt`, `teacherFirstReplyAt` (CHAT-07) | **UNIQUE(`teacherId`,`studentId`)**; idx (`studentId`,`lastMessageAt`), (`teacherId`,`lastMessageAt`) |
| `conversation_participants` | `conversationId`, `userId`, `role ENUM('teacher','student')`, `lastReadSeq INT` (monotónico, CHAT-10), `blockedAt`, `reportedAt`, `reportReason`, `emailNotifiedSeq INT` | **UNIQUE(`conversationId`,`userId`)**; idx (`userId`) |
| `messages` | `conversationId`, `seq INT` (asignado por servidor bajo lock de la conversación), `senderId NULL` (`NULL` = sistema), `type ENUM('text','offer','session_proposal','system_event')`, `body TEXT` (≤ 2000 en servicio), `clientMessageId VARCHAR(64)`, `offerId`, `classSessionId`, `proposalVersion`, `eventCode VARCHAR(64)`, `eventParams JSON`, `contextType ENUM('course','package','session')`, `contextId`, `hiddenAt`, `hiddenById`, `hiddenReason` | **UNIQUE(`conversationId`,`seq`)**; **UNIQUE(`conversationId`,`senderId`,`clientMessageId`)** |
| `rate_limit_buckets` | `bucketKey VARCHAR(191)`, `windowStart DATETIME`, `hits INT` | **UNIQUE(`bucketKey`,`windowStart`)**; sirve entre réplicas (CHAT-07) |

Reglas: solo el backend crea `offer`/`session_proposal`/`system_event` (`senderId NULL` para sistema). Los mensajes no se editan ni borran; moderar = `hiddenAt` + `audit_logs`. Un mensaje oculto conserva sus referencias comerciales.

### 3.4 Catálogo (W05, W02)

| Tabla | Columnas clave | Unicidad |
| --- | --- | --- |
| `class_policy_versions` | `version INT`, `rules JSON` (§5), `createdById`; inmutable | **UNIQUE(`version`)** |
| `class_package_templates` | `teacherId`, `templateKey VARCHAR(64)` (p. ej. `individual-4x50`), `status ENUM('draft','active','paused','archived')`, `currentVersionId` | **UNIQUE(`teacherId`,`templateKey`)** |
| `class_package_template_versions` | `templateId`, `version INT`, `nameEn`, `nameEs`, `descriptionEn`, `descriptionEs`, `modality ENUM('individual','group')`, `groupSize TINYINT` (1, 2, 3), `billing ENUM('per_buyer','per_group','per_seat')`, `sessionsCount`, `minutesPerSession`, `seatsCovered`, `priceAmount`, `currency`, `validityHours`, `policyVersionId`, `hotmartProductId`, `hotmartOfferCode`, `hotmartCheckoutUrl`, `expectations JSON` (SALES-01/02, W02), `createdById`; **inmutable** | **UNIQUE(`templateId`,`version`)** |

Editar una plantilla = crear versión nueva y mover `currentVersionId` (PACK-03). Las seis variantes de SPEC §3 son: `individual`/`per_buyer`/`seatsCovered=1`; `group2-1x50-total` = `group`/`groupSize=2`/`per_group`/`seatsCovered=2`/`3000`; `group3-1x50-seat` = `group`/`groupSize=3`/`per_seat`/`seatsCovered=1`/`1500`. El seed **no** las activa (§16): quedan `draft`.

### 3.5 Grupos — `class_cohorts`, `class_cohort_members` (W05/W06)

`class_cohorts`: `teacherId`, `templateVersionId`, `groupSize`, `formingDeadlineAt` (GROUP-04), `tentativeStartsAt`, `status ENUM('forming','ready','cancelled','completed')`. `class_cohort_members`: `cohortId`, `userId`, `invitedById`, `status ENUM('invited','accepted','declined','removed')`, `respondedAt`; **UNIQUE(`cohortId`,`userId`)**. Una invitación aceptada es requisito para que un segundo alumno sea beneficiario (GROUP-02).

### 3.6 Ofertas — `class_offers`, `class_offer_beneficiaries` (W05)

`class_offers`: `conversationId`, `teacherId`, `buyerId`, `cohortId NULL`, `templateVersionId`, `policyVersionId`, `replacesOfferId NULL` (**UNIQUE**: una oferta se reemplaza a lo sumo una vez), `status`, `snapshot JSON` (todo lo de PACK-11), y copias planas para consulta: `amount`, `currency`, `sessionsCount`, `minutesPerSession`, `seatsCovered`, `validityHours`, `hotmartProductId`, `hotmartOfferCode`; `sentAt`, `expiresAt`, `cancelledAt`, `cancelReason`, `idempotencyKey` (**UNIQUE(`teacherId`,`idempotencyKey`)**).
`class_offer_beneficiaries`: `offerId`, `userId`, **UNIQUE(`offerId`,`userId`)**.

Estados (PACK-14): `draft → sent → checkout_pending → paid`; terminales `expired`, `cancelled`, `replaced`. Transiciones válidas en `src/domain/classStates.js` (`OFFER_TRANSITIONS`). Una oferta con `checkout_pending` no se cancela ni reemplaza sin resolver el intento (PACK-11): se cancela la orden pendiente primero (§7.6).

### 3.7 Órdenes de paquete, intentos y eventos del proveedor (W05)

`class_package_orders` (una fila = un intento de checkout; separada de `orders` de cursos): `offerId`, `buyerId`, `amount`, `currency`, `provider ENUM('hotmart','fake')`, `status`, `checkoutRef CHAR(32)` (**UNIQUE**), `pendingOfferId` (**columna generada por MySQL** `CASE WHEN status='pending' THEN offerId END`, con índice **UNIQUE** → *un solo checkout pendiente por oferta* impuesto en base, PACK-15; nadie la escribe y no está en el modelo; por eso la FK `offerId` es `ON UPDATE RESTRICT`), `idempotencyKey`, `providerTransactionId VARCHAR(64)` (**UNIQUE**), `providerProductId`, `providerOfferCode`, `reportedAmount`, `reportedCurrency`, `buyerEmailReported`, `refundedAmount`, `paidAt`, `refundedAt`, `failedAt`, `reviewReason VARCHAR(64)`, `reviewResolvedAt`, `reviewResolvedById`.

Estados (PACK-14 + PACK-17): `pending → paid → partially_refunded → refunded`; `pending → failed`; `paid_needs_review` (pago efectivo que no se puede acreditar: oferta vencida/cancelada/reemplazada o datos que no cuadran). `paid_needs_review → paid` (acreditado tras revisión) o `→ refunded`.

`payment_provider_events`: `provider`, `eventKey VARCHAR(191)` (**UNIQUE(`provider`,`eventKey`)**), `eventType`, `providerTransactionId`, `occurredAt`, `orderId NULL`, `outcome ENUM('received','applied','ignored','needs_review','failed')`, `payload JSON` (saneado: sin hottok ni documentos del comprador), `error VARCHAR(500)`, `processedAt`.

### 3.8 Compras, beneficiarios y ledger (W05, W06)

`class_package_purchases`: `orderId` (**UNIQUE**), `offerId` (**UNIQUE**), `teacherId`, `buyerId`, `cohortId`, `templateVersionId`, `policyVersionId`, `snapshot JSON` (copia del de la oferta), `minutesPerSession`, `seatsCovered`, `status ENUM('active','paused','exhausted','expired','cancelled')`, `paidAt`, `expiresAt`, `pausedAt`, `pausedHoursUsed INT`, `cancelledAt`, `version INT` y los **saldos materializados**: `unitsGranted`, `unitsAvailable`, `unitsReserved`, `unitsConsumed`, `unitsExpired`, `unitsRefunded` (todos `INT UNSIGNED`, con `CHECK` en MySQL).
`class_package_beneficiaries`: `purchaseId`, `userId`, **UNIQUE(`purchaseId`,`userId`)**.
`class_credit_ledger` (*append-only*): `purchaseId`, `operation ENUM('grant','reserve','release','consume','expire','refund','adjust')`, `units INT UNSIGNED > 0`, `fromBucket`, `toBucket`, `operationKey VARCHAR(191)` (**UNIQUE**), `classSessionId NULL`, `actorId NULL`, `reason VARCHAR(255)`, `createdAt`.

Invariante de saldo (en `CHECK` y en el servicio): `unitsGranted = unitsAvailable + unitsReserved + unitsConsumed + unitsExpired + unitsRefunded`, todos ≥ 0. Detalle en §6.

### 3.9 Sesiones (W06)

| Tabla | Columnas clave | Unicidad |
| --- | --- | --- |
| `class_sessions` | `teacherId`, `kind ENUM('individual','group')`, `cohortId`, `status`, `version INT`, `startsAt`, `endsAt`, `timeZone`, `localStart CHAR(16)`, `utcOffset CHAR(6)`, `disambiguation ENUM('none','earlier','later')`, `minutes`, `liveClassId NULL` (pizarra opcional, SET NULL), `confirmedAt`, `cancelledAt`, `cancelledById`, `cancelReason`, `chargeWaivedReason` | idx (`teacherId`,`startsAt`), (`status`,`startsAt`) |
| `class_session_proposals` | `sessionId`, `version`, `kind ENUM('initial','reschedule')`, `status ENUM('pending','accepted','declined','expired','superseded','withdrawn')`, mismos campos de horario que la sesión, `proposedById`, `expiresAt`, `leadTimeException BOOL`, `resolvedAt` | **UNIQUE(`sessionId`,`version`)**; idx (`status`,`expiresAt`) |
| `class_session_participants` | `sessionId`, `userId`, `purchaseId NULL`, `status ENUM('invited','accepted','declined','confirmed','cancelled')`, `acceptedVersion INT`, `acceptedAt`, `attendance ENUM('pending','attended','student_no_show','teacher_no_show','excused')`, `attendanceMarkedById`, `attendanceMarkedAt` | **UNIQUE(`sessionId`,`userId`)**; idx (`userId`), (`purchaseId`) |

Estados de sesión (AGENDA-01): individual `draft → proposed → confirmed → completed`; grupo `draft → forming → proposed → confirmed → completed`; terminales `declined`, `expired`, `cancelled`, `student_no_show`, `teacher_no_show`. La propuesta pendiente **es** el bloqueo provisional del horario (AGENDA-02): para conflictos cuentan las sesiones `confirmed` y las propuestas `pending` no vencidas.

### 3.10 Integraciones (W07, W08)

`external_connections`: `userId`, `provider ENUM('google_calendar','zoom')`, `status ENUM('pending','connected','needs_attention','revoked','disconnected')`, `accountEmail`, `credentials TEXT` (cifrado con el mismo helper que `GoogleConnection`), `scopes TEXT`, `targetCalendarId`, `busyCalendarIds JSON`, `tokenExpiresAt`, `refreshLockedUntil` (refresh serializado entre réplicas, CAL-08/ZOOM-08), `oauthStateHash` (**UNIQUE**), `oauthVerifier`, `oauthExpiresAt`, `lastError`, `version`. **UNIQUE(`userId`,`provider`)**. Es independiente de `google_connections` (Drive/Classroom): desconectar una no toca la otra (CAL-01, CAL-08).

`external_sync_refs`: `sessionId`, `provider ENUM('google_calendar','zoom')`, `connectionId`, `externalId`, `calendarId`, `etag`, `syncedVersion INT`, `status ENUM('pending','ready','needs_attention','cancelled')`, `correlationKey VARCHAR(64)` (**UNIQUE**; viaja al proveedor para reconciliar tras timeout, ZOOM-04/CAL-04), `joinUrl` (solo enlace de participante), `manualJoinUrl` + `manualJoinUrlById` (contingencia ZOOM-07), `lastError`, `attempts`. **UNIQUE(`sessionId`,`provider`)**. El `start_url` de Zoom **nunca** se persiste: se pide al proveedor al momento y solo al docente (ZOOM-03). Los canales de notificación de Google los agrega W07 en su migración: `external_calendar_channels` (`connectionId`, `calendarId` — **UNIQUE** juntos —, `channelId` **UNIQUE**, `resourceId`, `tokenHash` (nunca el token), `expiresAt`, `lastMessageNumber` anti-replay, `syncToken`, `lastSyncedAt`); un registro por calendario con sync incremental, con canal push solo si hay `GOOGLE_CALENDAR_NOTIFICATIONS_URL`. `lastError` de Calendar (códigos estables): `integration_not_connected`, `authorization_lost`, `external_changed`, `external_deleted`, `sync_failed`, o el código del proveedor.

### 3.11 Outbox / jobs durables — `outbox_jobs` (CONTRACT-03/04)

`topic VARCHAR(64)`, `aggregateType` (**nombre de la tabla** del agregado: `class_sessions`, `class_offers`…; la limpieza de cuentas de prueba depende de esto), `aggregateId`, `aggregateVersion NULL`, `dedupeKey VARCHAR(191)` (**UNIQUE**), `payload JSON` (sin secretos ni texto de mensajes), `status ENUM('pending','running','done','failed','cancelled')`, `attempts`, `maxAttempts`, `runAt`, `lockedBy`, `lockedUntil`, `lastError VARCHAR(500)` (saneado), `doneAt`. idx (`status`,`runAt`), (`aggregateType`,`aggregateId`). Mecánica en §8.

### 3.12 Legal y auditoría (W02 y todos)

`legal_acceptances` (*append-only*): `userId`, `documentKey VARCHAR(32)` (`terms`, `privacy`, `refunds`, `package_terms`), `documentVersion VARCHAR(32)`, `locale`, `context ENUM('signup','checkout','update')`, `contextType`, `contextId`, `acceptedAt`. idx (`userId`,`documentKey`). Los textos versionados (`legal_documents`) los crea W02.

`audit_logs` (*append-only*): `actorId`, `impersonatedById`, `action VARCHAR(64)` (p. ej. `credits.adjust`, `message.hide`, `attendance.correct`, `payment.review`), `entityType`, `entityId`, `reason VARCHAR(500)`, `data JSON` (sin tokens ni mensajes privados), `createdAt`. idx (`entityType`,`entityId`), (`actorId`,`createdAt`). Toda acción de PACK-09, CHAT-10, PACK-20 y §16 «recuperación» escribe aquí en la misma transacción.

---

## 4. Unicidad en base (CONTRACT-01)

| Requisito | Índice único |
| --- | --- |
| Conversación por pareja | `conversations(teacherId, studentId)` |
| Mensaje por clave de idempotencia | `messages(conversationId, senderId, clientMessageId)` |
| Orden estable del servidor | `messages(conversationId, seq)` |
| Evento de proveedor procesado | `payment_provider_events(provider, eventKey)` |
| Transacción del proveedor | `class_package_orders(providerTransactionId)` |
| Checkout pendiente por oferta | `class_package_orders(pendingOfferId)` |
| Una compra por orden / por oferta | `class_package_purchases(orderId)`, `class_package_purchases(offerId)` |
| Movimiento de saldo por operación | `class_credit_ledger(operationKey)` |
| Referencia de sync por sesión y proveedor | `external_sync_refs(sessionId, provider)` y `(correlationKey)` |
| Conexión por docente y proveedor | `external_connections(userId, provider)` |
| Job por clave de deduplicación | `outbox_jobs(dedupeKey)` |
| Versión de propuesta | `class_session_proposals(sessionId, version)` |
| Participante por sesión / beneficiario por compra | `class_session_participants(sessionId, userId)`, `class_package_beneficiaries(purchaseId, userId)` |

MySQL permite varios `NULL` en un único: por eso los mensajes de sistema (`senderId NULL`) no chocan y `pendingOfferId` (generada) vale `NULL` en cuanto la orden sale de `pending`. Los índices no únicos se limitan a los filtros reales listados en §3.

---

## 5. Política comercial versionada (§4 de la guía)

`class_policy_versions.rules` es un JSON validado por `src/domain/classPolicy.js` (`validatePolicy`, `DEFAULT_POLICY_V1`). Todas las duraciones en horas o minutos enteros:

| Clave | V1 | Regla |
| --- | --- | --- |
| `validityHoursBySessions` | `{ "1": 720, "4": 2160 }` | Vigencia desde `paidAt` |
| `offerTtlHours` | `168` | Caducidad de oferta enviada |
| `proposalLeadHours` | `24` | Anticipación mínima |
| `proposalTtlHours` / `proposalCutoffBeforeStartHours` | `24` / `2` | Vence en el menor de ambos |
| `freeCancelHours` | `24` | `startsAt - now >= 24 h` = sin cargo |
| `arrivalToleranceMinutes` | `10` | |
| `maxPauseHours` / `maxPauses` | `720` / `1` | |
| `renewalSuggestWhenUnitsLeft` / `renewalSuggestHoursBeforeExpiry` | `1` / `168` | Sugerencia, nunca cobro |
| `refundWindowHours` | `336` histórico / `360` para nuevas reglas P01 | Históricos intactos; nuevas versiones respetan plazos más favorables (§7.7) |
| `refundMode` | Ausente histórico / `full_unused_then_review` nuevo | Total voluntario sin consumo en plazo; otras circunstancias a revisión individual |
| `remindersBeforeStartMinutes` | `[1440, 60]` | |
| `teacherBufferMinutes` | `10` | Valor por defecto de `teacher_class_settings` |
| `groupFormingMaxHours` / `groupFormingCutoffBeforeStartHours` | `168` / `2` | GROUP-04 |
| `chatLimits` | `{ newConversationsPerDay: 5, messagesPerHourBeforeReply: 10, messagesPerHourPerConversation: 60, teacherMessagesPerHourPerConversation: 120 }` | CHAT-07 |
| `chatMaxMessageLength` | `2000` | CHAT-05 |

Una oferta guarda `policyVersionId` y copia `rules` en su `snapshot`; la compra hereda ambos. Cambiar la política = nueva versión; nunca se edita una existente.

---

## 6. Contrato de saldo compartido por W05 y W06 (PACK-19, AGENDA-03, AC04)

Implementado en `backend/src/services/classCredits.js`. **Es la única puerta** para mover saldo: ningún paquete escribe `class_credit_ledger` ni los `units*` directamente.

### 6.1 Movimientos

| `operation` | De → a | Quién lo usa |
| --- | --- | --- |
| `grant` | — → `available` (y `unitsGranted += n`) | W05 al acreditar una orden pagada |
| `reserve` | `available` → `reserved` | W06 al **confirmar** una sesión (no al proponer) |
| `release` | `reserved` → `available` | W06: cancelación en plazo, ausencia/cancelación docente, expiración de grupo |
| `consume` | `reserved` → `consumed` | W06: clase dictada, ausencia alumno, cancelación tardía |
| `expire` | `available` → `expired` | Job de vencimiento (W05) |
| `refund` | `available` → `refunded` | W05: reembolso de la parte no usada, tras confirmar el proveedor |
| `adjust` | `available` ↔ `none` (±), `consumed` → `available` | Corrección con permiso `class_credits.adjust`, motivo y `audit_logs` (PACK-09, PACK-20) |

### 6.2 API del servicio

```js
const credits = require('../services/classCredits');
// Dentro de una transacción abierta por el llamador (sequelize.transaction):
await credits.apply({ purchaseId, operation: 'reserve', units: 1, operationKey, classSessionId, actorId, reason, adjust }, { transaction });
// -> { entry, purchase, replayed }  replayed=true si operationKey ya existía (no mueve nada)
await credits.balance(purchaseId, { transaction }); // { granted, available, reserved, consumed, expired, refunded }
```

- `apply` bloquea la compra (`SELECT … FOR UPDATE`), verifica idempotencia por `operationKey`, valida el movimiento y actualiza saldos y ledger en la misma transacción. Errores: `CreditError` con `code` `insufficient_credit` (409), `package_not_active` (409), `invalid_credit_operation` (400), `operation_key_conflict` (409: la misma clave con otros datos).
- `reserve` exige `status='active'`; `release`/`consume`/`refund`/`expire`/`adjust` también funcionan con la compra `paused`/`expired`/`cancelled` para poder cerrar compromisos (AGENDA-06, PACK-05).
- Pasa a `exhausted` cuando `available = reserved = 0` tras `consume`; vuelve a `active` si una corrección devuelve saldo y no venció.

### 6.3 Claves de operación (contrato)

| Movimiento | `operationKey` |
| --- | --- |
| Grant de una orden | `grant:order:<orderId>` |
| Reserva de una sesión | `reserve:session:<sessionId>:purchase:<purchaseId>` |
| Liberación | `release:session:<sessionId>:purchase:<purchaseId>:v<version>` |
| Consumo | `consume:session:<sessionId>:purchase:<purchaseId>` |
| Reprogramación tardía (PACK-21) | consumo de la original con su clave + reserva de la nueva sesión con la suya |
| Vencimiento | `expire:purchase:<purchaseId>` |
| Reembolso | `refund:order:<orderId>:<providerRefundId>` |
| Ajuste | `adjust:audit:<auditLogId>` |

Grupo de 2 (GROUP-02): **una** reserva por (sesión, compra), no por participante; la clave anterior ya lo garantiza. Grupo de 3: cada participante consume de su propia compra.

### 6.4 Orden de bloqueos al confirmar (AGENDA-03/04)

Para no producir *deadlocks* entre confirmaciones concurrentes, toda transacción de agenda bloquea en este orden y solo lo que necesita:

1. `teacher_class_settings` del docente (`FOR UPDATE`) — serializa la agenda del docente;
2. `class_sessions` de la sesión;
3. `users` de los alumnos participantes, por `id` ascendente — serializa la agenda de cada alumno;
4. `class_package_purchases` por `id` ascendente (lo hace `credits.apply`).

Dentro del lock: validar versión vigente de la propuesta, permisos, compra activa/no vencida (`endsAt <= expiresAt`), duración/modalidad compatibles, conflictos (§1.2 con buffer) y saldo; luego `reserve`, cambiar estados y encolar outbox. **Ninguna llamada externa** dentro de la transacción (AGENDA-07).

---

## 7. Cobro por Hotmart (D10, PACK-12–PACK-17)

### 7.1 Vínculo oferta ↔ producto de Hotmart

- La cuenta de Hotmart es de la escuela. Cada **versión de plantilla** se vincula a un **producto** (`hotmartProductId`) y a una **oferta de Hotmart** (`hotmartOfferCode`, el código del parámetro `off=` del link de pago) cuyo precio en Hotmart es exactamente `priceAmount`/`currency`. La URL base `hotmartCheckoutUrl` valida igual que en cursos (`https://pay.hotmart.com/...`). Un mismo producto puede tener varias ofertas (1 clase, 4 clases, grupos).
- No se puede enviar una oferta cuya versión de plantilla no tenga vínculo completo: `409 hotmart_mapping_missing`. Una «variante autorizada» con otro precio necesita su propio `hotmartOfferCode`.
- Editan el vínculo el dueño de la plantilla y quien tenga `class_packages.manage_all`. Un `hotmartProductId` no puede estar a la vez en un curso y en un paquete. Ambos módulos adquieren el mismo cerrojo transaccional por producto (`hotmart_product_locks`) y validan el vínculo inmediatamente antes de escribir; las llamadas externas no mantienen ese lock. El webhook necesita saber qué es.

### 7.2 Checkout (PACK-12, PACK-15)

`POST /api/class-offers/:id/checkout` con `Idempotency-Key`:

1. Autentica; el usuario debe ser el `buyerId` de la oferta (si no, 404). Feature `class_packages` activo, docente sin `salesPausedAt`, oferta `sent`/`checkout_pending` y no vencida, Hotmart configurado (`HOTMART_HOTTOK`) o modo fake; si no, `503 payments_unavailable`.
2. Transacción con lock de la oferta: si hay orden `pending` de la oferta se **reutiliza** y devuelve la misma URL (doble clic, dos pestañas). Si no, crea `class_package_orders` (`pending`, `checkoutRef` aleatorio de 32 caracteres `[a-z0-9]`, importe y moneda **de la oferta**) y pasa la oferta a `checkout_pending`.
3. La URL es `hotmartCheckoutUrl` + `off=<hotmartOfferCode>` + `sck=<checkoutRef>` + `email`/`name` del comprador prellenados. No hay llamada al proveedor, así que no existe el caso de timeout al crear; el cuerpo de la petición se ignora salvo la clave de idempotencia.
4. El redirect de vuelta solo muestra estado (`GET /api/class-offers/:id/checkout`); **no acredita** nada (PACK-16).

### 7.3 Conciliación del webhook (PACK-13, PACK-16, AC03)

Se reutiliza `POST /api/payments/hotmart/webhook` y `verifyHottok`. `handleEvent` decide el destino **antes** de la lógica de cursos:

1. Registrar el evento en `payment_provider_events` con `eventKey` = `id` del evento de Hotmart (o `<event>:<transaction>:<status>` si falta). Si ya existía y está `applied`/`ignored`, responder 200 sin hacer nada.
2. Buscar la orden de paquete por `checkoutRef` = `sck` del webhook (`data.purchase.origin.sck`; ver 7.5). Si no hay `sck` pero `data.product.id` pertenece a una versión de plantilla, buscar por `providerTransactionId`; si tampoco, el evento queda `needs_review` (pago sin referencia: nunca se pierde, se ve en el panel de revisión).
3. Si el producto pertenece a un curso y no hay orden de paquete, sigue el flujo de cursos actual sin cambios.
4. **Aprobado** (`PURCHASE_APPROVED`/`PURCHASE_COMPLETE`), en **una** transacción con lock de la orden y de la oferta:
   - orden ya `paid`/`refunded`/`paid_needs_review` → nada (replay);
   - producto y `offer.code` del webhook ≠ snapshot, u oferta `expired`/`cancelled`/`replaced`, u orden `failed` → orden `paid_needs_review` con `reviewReason` (`offer_closed`, `product_mismatch`, `offer_code_mismatch`), outbox para avisar al docente y a `class_payments.review`, mensaje de sistema al comprador «pago recibido en revisión» (PACK-17);
   - si no → orden `paid` (`providerTransactionId`, importes reportados), oferta `paid`, compra creada con `expiresAt = paidAt + validityHours`, beneficiarios desde la oferta, `credits.apply(grant)` con `grant:order:<id>`, mensaje de sistema en el chat y outbox `email.purchase_confirmed`.
   - La identidad del beneficiario sale **de la oferta**, nunca del email de Hotmart; si el email difiere se guarda en `buyerEmailReported` y en `audit_logs`, sin bloquear.
5. **Reembolso / contracargo** (`PURCHASE_REFUNDED`, `PURCHASE_CHARGEBACK`): orden `refunded` (o `partially_refunded` si el importe es parcial), `refund` del saldo `available` con `refund:order:<id>:<eventKey>`, compra `cancelled`. Las reservas futuras quedan para que el docente las resuelva (outbox `review.refunded_with_reservations`); lo consumido no se toca. Si llega **antes** que la aprobación, la orden queda `refunded` y la aprobación posterior no acredita (igual que cursos).
6. **Cancelado / expirado** en Hotmart (`PURCHASE_CANCELED`, `PURCHASE_EXPIRED`, `PURCHASE_PROTEST` sin cobro): orden `pending` → `failed`, oferta vuelve a `sent` si no venció.
7. Cualquier evento o producto desconocido responde 200 con `handled: false` (Hotmart desactiva webhooks que fallan), dejando el evento `ignored`.

Garantías: el evento único + `providerTransactionId` único + compra única por orden + `grant:order:<id>` único hacen que webhook repetido, concurrente o desordenado produzca **una** compra y **una** acreditación (AC03). Ningún paso crea `enrollments` ni `orders` de cursos.

### 7.4 Vencimiento y cancelación de ofertas (PACK-17)

El job `offer.expire` (dedupe `offer.expire:<offerId>`, `runAt = expiresAt`) pasa la oferta a `expired` y la orden pendiente a `failed`. Hotmart no permite cerrar un link de pago: un pago posterior entra por 7.3-4 como `paid_needs_review`. Reemplazar una oferta = cancelar la anterior (y su orden pendiente) y crear otra con `replacesOfferId`; el historial muestra la anterior como `replaced`.

### 7.5 A verificar en el sandbox de Hotmart (primer paso de W05)

La [documentación oficial del webhook 2.0.0](https://developers.hotmart.com/docs/en/2.0.0/webhook/purchase-webhook/) enumera `purchase.origin.sck`, `purchase.origin.xcod` y `purchase.offer.code` (verificada el 22/10/2026). Aun falta una compra de prueba autorizada en sandbox con `sck`/`off` y guardar el payload real saneado en `backend/tests/fixtures/`; la fixture actual es explícitamente sintética. Se acepta `xcod` como referencia alternativa. Sin referencia persistida comprobable el evento queda en revisión; esta implementación no adjudica una compra por email. La captura autorizada de sandbox deberá validar la correlación antes de cualquier habilitación real. El contrato de tablas no cambia en ningún caso.

### 7.6 Modo fake (CONTRACT-05)

Con `PAYMENTS_FAKE=1` (prohibido en producción por `config/payments.js`) el checkout devuelve una URL interna del frontend que llama a `POST /api/class-offers/:id/checkout/fake-complete`; esa ruta arma un cuerpo con la forma del webhook de Hotmart y lo pasa por **el mismo** manejador del 7.3. Así las pruebas recorren la conciliación real sin proveedor.

### 7.7 Reembolsos iniciados por la escuela (PACK-08, P01 resuelta)

**Decisión comercial de 22/10/2026 por delegación expresa de Andrés al orquestador:** garantía inicial de paquetes de 15 días (`360` horas bajo la semántica temporal actual), con plazo configurado/contractual/legal más favorable. Antes de habilitar ventas reales hay que verificar cuenta/formato/producto/oferta y garantía compatible en Hotmart; un plazo interno calculado nunca se presenta como garantía del proveedor comprobada. El formato Servicio Online tiene restricciones: no presumir elegibilidad ni disfrazar un producto.

- Voluntario estándar: devolución total sin créditos consumidos, solicitada en el plazo aplicable. Resolver reservas futuras de forma explícita; una reserva no equivale a consumo.
- Uso previo, fuera de plazo o excepción: revisión individual según condiciones de compra, Hotmart y derechos aplicables; sin aprobación o rechazo automáticos por uso. No hay prorrateo automático inicial por elección comercial, no por incapacidad técnica afirmada de Hotmart.
- Servicio no prestable por escuela/docente o grupo incompleto: soluciones/devoluciones y revisión humana auditada incluso fuera de garantía; no imponer otra fecha, vale o extensión sin aceptación.
- Primero solicitud y confirmación interna auditadas; después trámite manual en Hotmart si falta capacidad de automatización validada. Solo un resultado verificable mueve saldo/estado. El ejecutor automatizado disponible en esta entrega es fake local.
- Reembolso real posterior al uso: §7.3-5; cancelar compra, retirar disponibles, conservar consumo y revisar reservas. No nace deuda, recobro ni cargo adicional.
- Nueva configuración versionada y nuevos snapshots; ninguna regla inmutable ni compra anterior se reinterpreta. Cursos digitales intactos. El `refundWindowHours=336` histórico no se transforma en 360 en registros ya guardados ni se trata como garantía Hotmart verificada.

Implementación W05 de cierre (1.7): `classRefundPolicy.current` crea reglas nuevas con `refundMode=full_unused_then_review` y al menos 360 h, preservando las mayores del origen; jamás actualiza filas históricas. Una plantilla histórica debe guardar nueva versión antes de enviar nuevas ofertas. El snapshot declara `refundPolicyStatus=commercial_resolved` y `providerVerification=fake_unverified`. `classPackageProvider.assertSelling` bloquea toda habilitación docente/reapertura, oferta o checkout real con `503 package_provider_verification_required`; no basta configurar un token ni existe bypass por entorno para fingir verificación. Las lecturas y resoluciones de compromisos continúan.

`classRefunds` guarda solicitud y seguimiento en `audit_logs` append-only. Preview incluye importe entero/moneda de la orden, disponibles/reservados/consumidos, clasificación, vencimiento calculado o ampliado con evidencia y `quote` de condiciones actuales. Solicitar requiere comprador, `Idempotency-Key`, `version`, `quote`, `reason` y `type` (`voluntary/service_unavailable/group_incomplete/other`). Otras circunstancias y snapshots históricos siempre pasan a revisión individual, sin rechazo automático. Aprobar exige capacidad, motivo, quote vigente y ausencia de compromisos sin resolver; cancela nuevas reservas y encola solo el proveedor fake, sin devolver dinero todavía. Con Hotmart queda `manual_hotmart`; solo webhook verificado concilia. Las ampliaciones verificadas solo pueden mantener o aumentar el vencimiento aplicable y no editan snapshots. Un aviso de outbox procesado no es un caso resuelto: sigue visible hasta cierre humano con motivo. Grupo incompleto pagado bloquea futuras reservas y deriva a resolución íntegra/humana, conservando dinero y ledger hasta resultado efectivo.

Rutas aditivas de gestión (no cambian `credits.apply` ni requieren migración):

| Ruta | Contrato / capacidad |
| --- | --- |
| `GET /api/me/class-packages/:id/refund-preview?type=voluntary` | Comprador; preview y solicitudes propias |
| `POST /api/me/class-packages/:id/refund-requests` | Comprador; `{ version, quote, reason, type }` + `Idempotency-Key` |
| `GET /api/admin/class-refund-requests` | `class_payments.review`; cola y seguimiento |
| `POST /api/admin/class-refund-requests/:id/review` | `{ action: approve/manual_update/needs_information, reason, quote }`; misma capacidad |
| `GET /api/admin/class-purchases/:id` | `class_payments.review`, o `class_credits.adjust` sobre compras propias (`adjust_any` para las de otro docente); saldo sin conversación privada |
| `POST /api/admin/class-purchases/:id/refund-deadline` | `class_payments.review`; `{ deadline, reason }`, solo mantener/ampliar con evidencia |
| `GET /api/admin/class-payment-jobs` | `class_payments.review`; pendientes/fallidos y avisos aún sin resolver |
| `POST /api/admin/class-payment-jobs/:id/retry` | Misma capacidad; `{ reason }`, solo fallidos permitidos |
| `POST /api/admin/class-payment-jobs/:id/acknowledge` | Misma capacidad; `{ reason }`, cerrar aviso de revisión con auditoría |
| `POST /api/admin/class-payments/:orderId/fake-refund-complete` | Misma capacidad, exclusivamente fake; debe existir trámite previamente encolado |
| `GET /api/teacher/class-cohorts` | Docente propio; lista e identidades solo para él. El invitado conserva DTO privado |

Fuentes verificadas el 22/10/2026: [garantías 7/15/21/30 y restricciones por formato](https://suportehotmart.zendesk.com/hc/en-us/articles/360034552751-How-to-adjust-the-guarantee-period-for-a-product-I-created), [Compra §3](https://hotmart.com/es/legal/plazo-de-compra), [Uso §5.11](https://hotmart.com/es/legal/terminos-de-uso). El [webhook](https://developers.hotmart.com/docs/en/2.0.0/webhook/purchase-webhook/) lista `PARTIALLY_REFUNDED`; no prueba que nuestra cuenta pueda iniciarlo. La decisión comercial está resuelta; las comprobaciones de integración no habilitan ventas por sí mismas.

---

## 8. Outbox y jobs durables (CONTRACT-03/04, AGENDA-07/08)

Implementado en `backend/src/services/outbox.js`:

```js
await outbox.enqueue({ topic, aggregateType, aggregateId, aggregateVersion, dedupeKey, payload, runAt }, { transaction });
await outbox.cancel({ aggregateType, aggregateId, topicPrefix, beforeVersion }, { transaction }); // invalida pendientes viejos
outbox.register(topic, async (job, ctx) => { ... });   // handler idempotente; ctx.stillOwned()
await outbox.runOnce({ workerId, limit, leaseMs });       // reclama y ejecuta de a un job
outbox.start({ intervalMs }) / outbox.stop();            // bucle del proceso (solo si OUTBOX_WORKER=1)
```

- `enqueue` se llama **dentro** de la transacción de negocio: si la transacción se revierte, el job no existe. Con un `dedupeKey` repetido no crea otro (devuelve el existente).
- `runOnce` reclama **de a un job** con `SELECT … FOR UPDATE SKIP LOCKED` (MySQL 8) entre los `pending` con `runAt <= now` y los `running` con `lockedUntil` vencido (proceso caído). Cada reclamo lleva un **token de propiedad** en `lockedBy` y un lease (`leaseMs`, 5 min por defecto) que se **renueva cada `leaseMs/3`** mientras corre el handler. El handler corre **fuera** de la transacción y recibe `ctx.stillOwned()` para verificar la propiedad antes de un efecto externo. El job se cierra solo si el token sigue siendo dueño: éxito → `done`; error → `attempts++`, `runAt` con *backoff* exponencial (30 s × 2^n, tope 6 h) y `lastError` saneado; al llegar a `maxAttempts` → `failed` (visible en métricas y panel de recuperación). Si otro worker se quedó con el job, el resultado cuenta como `lost` y no se toca la fila.
- Dos workers vivos no ejecutan el mismo job: un handler largo mantiene su lease y no retiene los demás jobs del lote. Un reinicio no pierde trabajos. `runAt` y `lockedUntil` tienen precisión de milisegundos. Los handlers deben ser idempotentes (por `dedupeKey` / versión del agregado), porque un job puede ejecutarse dos veces si el proceso muere después del efecto y antes de marcar `done`.
- Recordatorios: un job por (sesión, versión, destinatario, tipo), `dedupeKey = reminder:<sessionId>:v<version>:<userId>:<minutes>`, `runAt = startsAt - minutes`; solo se encolan los que sigan siendo futuros. Reprogramar o cancelar llama a `cancel(beforeVersion)` y el handler además descarta si `aggregateVersion` ≠ versión vigente (AGENDA-08).
- Tópicos reservados: `email.*`, `reminder.session`, `offer.expire`, `proposal.expire`, `cohort.deadline`, `purchase.expire`, `calendar.sync`, `zoom.sync`, `review.*`. Cada paquete registra los suyos.
- `setTimeout` solo como disparador del bucle, nunca como garantía (CONTRACT-04).

---

## 9. Rutas de API congeladas (§13.1)

Todas bajo autenticación salvo las marcadas *pública*/*callback*. Las rutas que crean o cambian algo van detrás del flag del módulo (§11) y con el flag apagado responden `404 feature_disabled`; las lecturas de lo ya adquirido (`GET /api/me/class-packages*`, `GET /api/class-sessions*`, historial de conversaciones existentes) y las acciones para resolver compromisos (cancelar, marcar asistencia, reembolsar) no dependen del flag. «Dueño» = paquete que la implementa. Ninguna existe todavía.

### 9.1 Preferencias — W01

| Método y ruta | Uso |
| --- | --- |
| `GET /api/me/preferences` | `{ locale, timeZone, timeZoneConfirmedAt, chatUnreadEmail }` |
| `PATCH /api/me/preferences` | `{ locale?, timeZone?, confirmTimeZone?, chatUnreadEmail? }`; `400 time_zone_invalid` |

### 9.2 Chat — W04

| Método y ruta | Uso |
| --- | --- |
| `GET /api/teachers/available` | Docentes con `classesEnabledAt` y `acceptsInquiries` (para iniciar chat) |
| `GET /api/conversations?cursor=&limit=` | Bandeja propia: contraparte, contexto, último mensaje, no leídos; `{ items, nextCursor }` (cursor opaco). El docente no ve una conversación hasta su primer mensaje |
| `GET /api/conversations/unread` | `{ conversations, messages }` no leídos, para el aviso en la navegación (CHAT-09) — *agregada en 1.1* |
| `POST /api/conversations` | `{ teacherId, context? }` → crea o devuelve la existente (200/201); `429 rate_limited`, `409 teacher_unavailable` |
| `GET /api/conversations/:id` | Detalle (solo participantes) |
| `GET /api/conversations/:id/messages?beforeSeq=&afterSeq=&limit=` | Historial por cursor `seq`, siempre ascendente; `{ items, hasMore }`. Sin cursor: los últimos `limit` (30, máx. 100) |
| `POST /api/conversations/:id/messages` | `{ clientMessageId, body, context? }`; 201 nuevo / 200 repetido; `409 conversation_blocked`, `409 operation_key_conflict` (misma clave con otro texto), `429 rate_limited`, `400 message_too_long` |
| `POST /api/conversations/:id/read` | `{ seq }` (monotónico: nunca retrocede) |
| `POST` / `DELETE /api/conversations/:id/block` | Bloquear / desbloquear |
| `POST /api/conversations/:id/report` | `{ reason }`; también bloquea desde ese lado |
| `GET /api/admin/chat/reports` | `chat.moderate`; conversaciones reportadas, sin texto de mensajes — *agregada en 1.1* |
| `GET /api/admin/chat/reports/:conversationId/messages?beforeSeq=&limit=` | `chat.moderate`; solo conversaciones reportadas; cada lectura en `audit_logs` (`chat.report_read`) — *agregada en 1.1* |
| `POST /api/admin/messages/:id/hide` | `chat.moderate`; `{ reason }`; solo mensajes de conversaciones reportadas |

Metadata aditiva W05 (1.4): `canSendOffers` indica si el participante docente tiene la función de ofertas habilitada; no sustituye la autorización de la mutación. El catálogo agrega `policy: { version, rules }` para la vista previa.

Notas de W04 (1.1): el contexto (`{ type: course|package|session, id }`) viaja en cada mensaje y debe pertenecer a la pareja; el de la conversación es el del último mensaje que lo tiene. Una sesión «ingresar como» (impersonación) recibe `403 forbidden` con `params.reason = impersonation` en todo `/api/conversations*`. W05/W06 crean `offer`/`session_proposal`/`system_event` con `chatService.appendSystemMessage(conversationId, { type, eventCode, eventParams, offerId, classSessionId, proposalVersion, dedupeKey }, { transaction })`, idempotente por `dedupeKey` y sin pasar por bloqueos ni límites.

### 9.3 Catálogo y configuración docente — W05 (W02 agrega `expectations`)

| Método y ruta | Uso |
| --- | --- |
| `GET` / `PATCH /api/teacher/class-settings` | Pausa de ventas, consultas, buffer |
| `GET /api/teacher/class-packages` | Plantillas propias (`?teacherId=` con `class_packages.manage_all`) |
| `POST /api/teacher/class-packages` | Crear plantilla + versión 1 (`draft`) |
| `POST /api/teacher/class-packages/import-initial` | Importar explícitamente las seis variantes como borradores; idempotente, no pisa las existentes; `?teacherId=` solo con capacidad global |
| `GET /api/teacher/class-packages/:id` | Plantilla con versiones |
| `POST /api/teacher/class-packages/:id/versions` | Nueva versión (= editar); `{ version }` actual para `409 version_conflict` |
| `PATCH /api/teacher/class-packages/:id/status` | `{ status, version }` `active/paused/archived`; compara la versión comercial vista bajo lock (`409 version_conflict`); activar exige vínculo Hotmart |
| `GET /api/public/teachers/:id/class-packages` | *Pública*: catálogo activo con instantánea vigente |
| `GET /api/admin/class-teachers`, `PATCH /api/admin/class-teachers/:userId` | `class_teachers.manage`: activar docentes |
| `GET` / `POST /api/admin/class-policies` | `class_packages.manage_all`: versiones de política |

### 9.4 Grupos — W05

| Método y ruta | Uso |
| --- | --- |
| `POST /api/teacher/class-cohorts` | Crear cohorte (`groupSize`, `tentativeStartsAt`, invitados) |
| `GET /api/teacher/class-cohorts/:id` | Estado, miembros, `formingDeadlineAt` |
| `GET /api/class-cohorts/:id` | Invitación propia autenticada; no revela identidades o pagos de otros miembros |
| `POST /api/class-cohorts/:id/invitation/accept` · `/decline` | El invitado responde |

### 9.5 Ofertas y checkout — W05

| Método y ruta | Uso |
| --- | --- |
| `POST /api/conversations/:id/offers` | Docente crea y envía (`Idempotency-Key`); `{ templateVersionId, cohortId?, beneficiaryIds? }`; `409 sales_paused`, `409 hotmart_mapping_missing`, `409 group_incomplete` |
| `GET /api/conversations/:id/offers` | Ofertas de la conversación (participantes) |
| `GET /api/class-offers/:id` | Detalle con snapshot (docente emisor y comprador/beneficiarios) |
| `POST /api/class-offers/:id/cancel` | Docente; `{ reason }` |
| `POST /api/class-offers/:id/replace` | Docente; crea otra con `replacesOfferId` |
| `POST /api/class-offers/:id/checkout` | Comprador; iniciar o reutilizar; `409 offer_not_payable`, `409 offer_expired`, `503 payments_unavailable` |
| `GET /api/class-offers/:id/checkout` | Estado de la orden (página de retorno) |
| `POST /api/class-offers/:id/checkout/fake-complete` | Solo con `PAYMENTS_FAKE=1` |
| `POST /api/payments/hotmart/webhook` | *Callback* existente, extendido (§7.3) |
| `GET /api/admin/class-payments?status=paid_needs_review` | `class_payments.review` |
| `POST /api/admin/class-payments/:orderId/resolve` | `{ action: 'credit' \| 'refund', reason }` |

### 9.6 Compras y saldo — W05

| Método y ruta | Uso |
| --- | --- |
| `GET /api/me/class-packages` | Compras propias (comprador o beneficiario) con saldo por cubeta |
| `GET /api/me/class-packages/:id` | Detalle, ledger y reglas compradas |
| `POST /api/me/class-packages/:id/pause` · `/resume` · `/cancel` | `{ version, reason? }` (motivo obligatorio al cancelar); `409 package_not_active`, `409 sessions_pending_resolution` (PACK-07) |
| `POST /api/me/class-packages/:id/refund-requests` | Solicitud con desglose (PACK-08) |
| `GET /api/teacher/class-purchases?studentId=` | Compras de sus alumnos (para proponer) |
| `POST /api/admin/class-purchases/:id/adjustments` | `class_credits.adjust` solo sobre compras del propio docente; otras compras exigen `class_credits.adjust_any` (404 si no); `Idempotency-Key`, `{ units, direction: add/remove/restore, reason, version? }`; no cambia `credits.apply` |

### 9.7 Agenda — W06

| Método y ruta | Uso |
| --- | --- |
| `GET /api/class-sessions?from=&to=` | Sesiones propias (docente o participante); límites UTC explícitos, ventana máxima 366 días, hasta 200 resultados y `truncated` |
| `GET /api/class-sessions/options?conversationId=` | Solo docente: alumnos de sus conversaciones/cohortes aceptadas, compras compatibles, cohortes y pizarras propias sin curso; no datos de pago |
| `GET /api/class-sessions/reminders` | Recibos durables propios de recordatorios vigentes dentro de la app |
| `POST /api/class-sessions` | Docente propone (`Idempotency-Key`): participantes, compras, intención local §1.3 |
| `GET /api/class-sessions/:id` | Detalle con propuesta vigente y estado de sync por proveedor |
| `POST /api/class-sessions/:id/proposals` | Reprogramar: nueva propuesta (`version`) |
| `POST /api/class-sessions/:id/proposals/:version/accept` · `/decline` | Alumno; `409 proposal_stale`, `409 schedule_conflict`, `409 insufficient_credit` |
| `POST /api/class-sessions/:id/cancel` | `{ version, reason }`; respuesta incluye `charge: 'none' \| 'consumed'` |
| `POST /api/class-sessions/:id/attendance` | Docente marca asistencia por participante |
| `POST /api/class-sessions/:id/requestExtension` | Participante afectado solicita y acepta una extensión concreta; `{ version, purchaseId, unavailableMinutes, reason }` |
| `POST /api/class-sessions/:id/adjustment` | Docente dueño con `class_credits.adjust`; `{ version, purchaseId, kind: waive_charge/extend_validity, reason, unavailableMinutes? }`; corrección excepcional auditada |
| `GET /api/class-sessions/:id/join` | Participante: `joinUrl`; docente: `hostUrl` pedido al proveedor al momento (nunca se guarda) |
| `POST /api/class-sessions/:id/sync/retry` | Docente o `class_sessions.support` |

Precisiones implementadas por W06 (1.6), sin migraciones ni cambios a §6:

- Crear: `{ intent: { localStart, timeZone, offset, disambiguation?, minutes }, participants: [{ userId, purchaseId|null }], cohortId?, liveClassId?, leadTimeException?, reason? }`. El servidor recalcula UTC con §1.3; rechaza UTC u otros campos dentro de `intent`. La excepción a anticipación exige motivo y no elimina el límite de respuesta. `Idempotency-Key` repite el recurso si el cuerpo coincide y devuelve `409 operation_key_conflict` si difiere. `liveClassId` solo vincula una pizarra propia sin curso; nunca crea inscripción ni consume saldo al ingresar.
- Propuestas siguientes: `{ version, intent, leadTimeException?, reason?, requestedByStudentId?, chargeWaivedReason? }`. Se pueden editar propuestas iniciales o reprogramar confirmadas. Cada propuesta incrementa la revisión; **una revisión pendiente no modifica los instantes confirmados ni mueve saldo**. El alumno responde a la versión exacta vista; aceptación de todos antes de reservar/confirmar. La baja de una plaza no la reincorpora a una reprogramación.
- Cancelar exige motivo y versión. Alumno cancela su plaza; en grupo de dos afecta la compra compartida. Docente puede cancelar por sí mismo, registrar `requestedByStudentId` o dispensar con `chargeWaivedReason`. Cancelación tardía no dispensada exige `acknowledgeCharge:true`. Al aceptar reprogramación tardía se exige ese reconocimiento, se consume la original y se crea/reserva otra sesión atómicamente; el detalle enlaza `replacementSessionId`. Rechazo/expiración conserva original y crédito. Una reprogramación vence a más tardar al inicio del horario confirmado original y marcar asistencia retira las propuestas pendientes.
- Grupo de tres con baja exige decisión docente: cancelar y liberar las reservas restantes, o `cancel { version, reason, keepGroup:true }` para dictar con menos personas al precio comprado. Sin recargo ni edición de beneficiarios históricos. Para reemplazar a alguien, resolver la sesión anterior y usar una cohorte/invitación/compra nueva según W05; no se sustituye una identidad dentro de una compra existente. Grupo incompleto conserva cohorte/compras; nueva fecha requiere aceptación, y las devoluciones se tramitan por W05 conforme GROUP-04/P01.
- El plazo inicial de formación se aplica a la primera propuesta de una cohorte `forming`, no a sus clases sucesivas una vez `ready`. Una propuesta grupal `expired/declined` puede renovarse con motivo y compras completas: nuevo plazo de respuesta, nuevas aceptaciones y sin reservas hasta confirmación. No reabre ofertas/checkouts ni modifica `formingDeadlineAt`; un grupo que sigue sin compras completas requiere la resolución/devolución de W05.
- Asistencia: `{ version, userId, attendance: attended/student_no_show/teacher_no_show/excused, reason }`. Impartida tras el final; ausencias tras tolerancia comprada. Se liquida por compra cuando todas sus plazas están resueltas. Corrección de un registro ya liquidado exige `class_credits.adjust`, motivo y auditoría; devolver un consumo usa `adjust consumed→available`, sin borrar ledger. Una corrección que introduciría un nuevo cargo devuelve `409 attendance_charge_review_required`, para revisión explícita, sin débito retroactivo automático.
- Dispensa posterior `waive_charge`: solo un cargo real de esa sesión/compra, una devolución única y motivo. Vigencia `extend_validity`: solo por cancelación/ausencia docente de esa compra y con saldo utilizable; agrega minutos reales declarados de indisponibilidad al vencimiento guardado, sin tocar snapshot. Exige solicitud/aceptación de **cada beneficiario afectado por exactamente esa duración**; no impone extensión en lugar de devolución (P01). La capacidad excepcional no concede acceso al chat de un docente ajeno. Los recibos de extensión son auditados y una sesión/compra no se compensa dos veces.
- Detalle muestra participantes, intención e instantes originales/propuestos, reglas compradas, `serverNow`, estado seguro de sync y saldos/vigencia **solo propios o del docente dueño**. `timeZoneRulesChanged` informa discrepancias con tzdb sin mover clases; confirmar recalcula la intención pendiente. El código de pizarra solo llega al participante confirmado y activo.
- Locks: configuración docente → sesión → alumnos por ID → compras por ID; aislamiento READ COMMITTED y hasta tres intentos por deadlock/lock timeout. Las confirmaciones comprueban conflictos, compra, créditos y versión dentro de esa transacción. Los holds caducados no bloquean aunque el worker vaya atrasado.
- `proposal.expire` y `reminder.session` usan outbox W00. Al cambiar revisión se invalidan recordatorios anteriores; conservar el horario original reencola sus avisos y aceptar una reprogramación los reencola al nuevo inicio (la clave lógica incluye versión e inicio; el handler descarta entregas de otro inicio). Los recibos de recordatorio se guardan en `audit_logs` con actor destinatario y clave única lógica bajo lock del agregado; `/reminders` filtra versión/estado vigente. No son emails ni notificaciones externas.
- W06 deja refs Calendar/Zoom en `needs_attention` sin conexión; encola `calendar.sync`/`zoom.sync` solo con flag y conexión. Adaptadores, free/busy y handlers son W07/W08: una conexión Google existente exige disponibilidad externa y bloquea confirmación con `503 provider_unavailable` hasta integrar W07; nunca confirma a ciegas. El enlace host devuelve 503 hasta W08, sin guardar ni exponer secretos. El participante solo recibe HTTPS `zoom.us` validado de una ref lista/manual. Un reintento sin conexión da `409 integration_not_connected`.
- `FEATURE_CLASS_SCHEDULING=0` detiene propuestas/respuestas nuevas; lectura, cancelación, asistencia y correcciones de compromisos siguen disponibles. No autoriza cuentas suspendidas ni impersonación; todas las rutas bloquean «ingresar como».

### 9.8 Integraciones — W07 / W08

| Método y ruta | Uso |
| --- | --- |
| `GET /api/integrations/google-calendar` | Estado, cuenta, calendarios; nunca credenciales |
| `POST /api/integrations/google-calendar/connect` | Devuelve URL de autorización |
| `GET /api/integrations/google-calendar/callback` | *Callback* OAuth (state hash + PKCE) |
| `PATCH /api/integrations/google-calendar` | `{ targetCalendarId, busyCalendarIds }` |
| `DELETE /api/integrations/google-calendar` | Desconectar (no borra sesiones) |
| `POST /api/integrations/google-calendar/notifications` | *Callback* de canales push (token/resource validados) |
| `GET /api/class-sessions/:id/calendar.ics` (W07) | ICS de la versión vigente para el docente y participantes activos (UID `class-session-<id>@<host>`, `SEQUENCE` = versión, fechas UTC, sin asistentes); cancelada → `STATUS:CANCELLED` también para quien ya salió; sin confirmar → 404 |

**Calendar (W07).** Solo docentes (`403` a otros, `403` impersonando); con `FEATURE_GOOGLE_CALENDAR` apagado todo responde `404 feature_disabled`. `GET` devuelve `{ status, connected, accountEmail, targetCalendarId, busyCalendarIds, lastError, version, calendars[], enabled, fake }` sin credenciales. `PATCH` exige un destino escribible (`owner`/`writer`) y calendarios existentes; el destino siempre cuenta como ocupado; acepta `version`. `callback` redirige a `FRONTEND_URL/teacher/integrations?calendar=connected|denied|scopes|error`. Permisos pedidos: `calendar.events`, `calendar.freebusy`, `calendar.calendarlist.readonly` y email; sin Drive/Classroom ni `include_granted_scopes`.
Confirmación (W06 `accept`): con conexión `connected` se lee free/busy **antes de abrir la transacción** y para el mismo intervalo; ocupado → `409 schedule_conflict {reason:'external_busy'}`; fallo de lectura → `503 provider_unavailable {reason:'availability_check_failed'}`; conexión `needs_attention`/`revoked` → `503 provider_unavailable {reason:'integration_needs_attention'}`. Sin conexión o con el flag apagado no se consulta. Al reprogramar se ignoran los bloques contenidos en el propio evento.
`calendar.sync`: converge el evento con la sesión vigente (id determinista = base32hex de `correlationKey`; un timeout adopta el evento existente). Creación solo con sesión `confirmed`; cancelada/expirada/rechazada → se borra el evento. Un evento borrado desde Google deja `external_deleted` y solo `POST /class-sessions/:id/sync/retry` (docente) lo recrea; un cambio externo deja `external_changed` y el reintento o el próximo cambio de la app restauran el horario de SpanishNow. Nunca se mueve ni confirma una clase por lo que pase en Google.
| `GET` · `POST …/connect` · `GET …/callback` · `DELETE /api/integrations/zoom` | Igual para Zoom |
| `POST /api/integrations/zoom/webhook` | *Callback* firmado por Zoom |

### 9.9 Legal y comercial — W02

| Método y ruta | Uso |
| --- | --- |
| `GET /api/public/legal/:documentKey?locale=` | *Pública*: versión vigente |
| `GET` / `POST /api/admin/legal-documents` · `POST /api/admin/legal-documents/:id/publish` | Edición versionada con permiso `legal.manage` (lo agrega W02) |
| `POST /api/me/legal-acceptances` | Registrar aceptación (`documentKey`, `documentVersion`, `context`) |

---

## 10. Códigos de error estables

| HTTP | `code` | Cuándo |
| --- | --- | --- |
| 400 | `validation_failed` | Cuerpo inválido; `params.fields` |
| 400 | `time_without_zone`, `time_zone_invalid`, `offset_mismatch` | §1.2–1.3 |
| 400 | `local_time_nonexistent` / `local_time_ambiguous` | TZ-12 / TZ-13 con `params.alternatives` / `params.options` |
| 400 | `lead_time_too_short` | Menos de `proposalLeadHours` sin excepción |
| 400 | `message_too_long` | > `chatMaxMessageLength` |
| 400 | `invalid_credit_operation` | Movimiento de saldo inválido |
| 401 | (existente) `{ error }` | Sin sesión |
| 403 | `forbidden` | Autenticado pero sin capacidad (solo cuando el recurso es visible para el usuario) |
| 404 | `not_found` | Inexistente **o ajeno** |
| 404 | `feature_disabled` | Flag del módulo apagado |
| 409 | `version_conflict` | Versión vieja |
| 409 | `insufficient_credit` | Saldo insuficiente |
| 409 | `package_not_active` | Compra pausada/vencida/cancelada/agotada |
| 409 | `schedule_conflict` | Choque con sesión o propuesta (con buffer) o con ocupación externa |
| 409 | `proposal_stale` | Propuesta vencida, reemplazada o ya resuelta |
| 409 | `offer_not_payable` / `offer_expired` | Oferta en estado que no admite checkout |
| 409 | `sales_paused`, `teacher_unavailable` | Pausa de ventas / docente no habilitado |
| 409 | `hotmart_mapping_missing` | Plantilla sin producto/oferta de Hotmart |
| 409 | `group_incomplete` | Grupo sin participantes/plazas confirmadas |
| 409 | `conversation_blocked` | Contacto bloqueado |
| 409 | `sessions_pending_resolution` | Pausa/cancelación con sesiones futuras sin resolver |
| 409 | `integration_not_connected` | Calendar/Zoom desconectado |
| 409 | `operation_key_conflict` | Clave idempotente reutilizada con otros datos |
| 429 | `rate_limited` | Header `Retry-After` y `params.retryAt` |
| 503 | `payments_unavailable`, `provider_unavailable` | Proveedor sin configurar o caído |

---

## 11. Flags por módulo y modos de prueba (§16, CONTRACT-05)

`backend/src/config/features.js`: `isEnabled(name)` y middleware `requireFeature(name)` (404 `feature_disabled`). Variables, todas **apagadas por defecto**:

| Flag | Módulo |
| --- | --- |
| `FEATURE_CHAT=1` | Chat (W04) |
| `FEATURE_CLASS_PACKAGES=1` | Catálogo, ofertas, compras (W05) |
| `FEATURE_CLASS_SCHEDULING=1` | Agenda (W06) |
| `FEATURE_GOOGLE_CALENDAR=1` | Calendar (W07) |
| `FEATURE_ZOOM=1` | Zoom (W08) |

Apagar un flag oculta la funcionalidad nueva (nuevas consultas, ofertas, checkouts, propuestas) pero **no** borra ni bloquea derechos adquiridos: las compras, el saldo y las sesiones confirmadas siguen visibles y resolubles (ver §9). `GET /api/features` (*pública*) devuelve el mapa para el frontend.

Modos fake: `PAYMENTS_FAKE=1` (existente) e `INTEGRATIONS_FAKE=1` (Calendar/Zoom por adaptador falso). `features.assertSafe()` hace que el proceso **no arranque** si `INTEGRATIONS_FAKE=1` con `NODE_ENV=production` o `RAILWAY_ENVIRONMENT` (igual que `PAYMENTS_FAKE` y `MEDIA_FAKE_UPLOADS`). Los correos siguen la regla existente de `MAIL_TRANSPORT`.

---

## 12. Capacidades (permisos) nuevas

En `backend/src/config/permissions.js` (catálogo). Ninguna se concede por ser `teacher`: el docente actúa sobre **sus** recursos por pertenencia, y solo si un admin lo habilitó (`classesEnabledAt`).

| Clave | Concede |
| --- | --- |
| `class_teachers.manage` | Habilitar/deshabilitar docentes para clases y chat |
| `class_packages.manage_all` | Ver y gestionar catálogo, vínculos Hotmart y políticas de cualquier docente (PACK-03) |
| `class_payments.review` | Ver y resolver pagos `paid_needs_review` y solicitudes de reembolso |
| `class_credits.adjust` | Ajustes excepcionales de saldo/vigencia con motivo (PACK-09), limitados a las compras del propio docente |
| `class_credits.adjust_any` | Lo mismo sobre compras de cualquier docente (W05, revisión P2-3) |
| `class_sessions.support` | Ver estado de proveedores, reintentar sync, reenviar invitación vigente (§16); no da enlace de anfitrión |
| `chat.moderate` | Ver mensajes **reportados** y ocultarlos con motivo; cada lectura queda en `audit_logs` (CHAT-02) |

Ninguna capacidad da lectura general de mensajes privados ni el `start_url` de Zoom de otro docente (AC16). Las cuentas de prueba nunca tienen permisos (regla existente).

---

## 13. Limpieza de cuentas de prueba (CONTRACT-05, AC20)

`deleteTestUsers` (`services/adminUsers.js`) se extiende así, en la misma transacción:

- **Se niega (409)** si alguna cuenta de prueba tiene relación con un usuario real en: conversaciones, ofertas, órdenes de paquete, compras/beneficiarios, sesiones/participantes o cohortes. Esos datos (mensajes y referencias comerciales) no son nuestros para borrar.
- La búsqueda y la comprobación usan **lecturas con bloqueo** (`FOR UPDATE`, una por columna indexada) dentro de la transacción de borrado: una relación con un usuario real creada en paralelo espera a la limpieza (y luego falla su FK) o es vista por ella (409). Nunca la borra el `CASCADE`.
- Si todo es entre cuentas de prueba, borra en orden de dependencias: jobs de outbox y referencias externas de sus sesiones, participantes, propuestas, sesiones, ledger, beneficiarios, compras, eventos de proveedor y órdenes de paquete, beneficiarios de oferta, ofertas, miembros y cohortes, mensajes, participantes, conversaciones, versiones y plantillas, conexiones externas, configuración docente, aceptaciones legales; los `audit_logs` se conservan con `actorId` nulo (`SET NULL`).
- Las FK nuevas hacia `users` son `RESTRICT` para datos comerciales (así un borrado accidental de un usuario real falla) y `CASCADE` solo en preferencias/configuración propias.

---

## 14. Superficies compartidas tocadas por W00

`backend/src/models/index.js` (registro y asociaciones nuevas), `backend/src/models/User.js` (`locale`, `timeZone`, `timeZoneConfirmedAt`), `backend/migrations/20261108000000-create-classes-chat-foundation.js`, `backend/src/config/permissions.js` (6 claves), `backend/src/config/features.js` (nuevo), `backend/src/config/database.js` (`timezone: '+00:00'` explícito), `backend/src/app.js` (`features.assertSafe()`, `GET /api/features`, `Idempotency-Key` en CORS y middleware de errores extraído a `middlewares/error.middleware.js`, que agrega `code`/`params`), `backend/src/server.js` (worker con `OUTBOX_WORKER=1`), `backend/.env.example` (flags), `backend/src/services/adminUsers.js` (limpieza), `backend/docs/database.md` (confirmación de rollback), `backend/tests/admin.test.js` y `migrationRunner.test.js` (catálogo de permisos y lista de migraciones), `COORDINACION.md` (decisión pendiente P01).

---

## 15. Decisiones pendientes detectadas en W00

Registradas en [COORDINACION.md](COORDINACION.md#decisiones). P01 comercial fue resuelta; la comprobación de integración sigue siendo necesaria antes de habilitar ventas reales. No bloquea el esquema ni la implementación fake.

- **P01 — Resuelta por delegación expresa de Andrés (22/10/2026).** Garantía inicial 15 días y voluntario total sin consumo en plazo; demás casos a revisión individual, condiciones más favorables y excepciones preservadas. Sin prorrateo automático, deuda ni recobro. Implementar por nuevas versiones/snapshots; comprobar cuenta/formato/garantía/trámite antes de habilitar Hotmart real (§7.7).

---

## Cambios

| Versión | Fecha | Cambio |
| --- | --- | --- |
| 1.8 | 23/10/2026 | W07 (Claude): Google Calendar. Tabla aditiva `external_calendar_channels` (migración `20261110000000`), códigos de `lastError` de `external_sync_refs` para Calendar, tópico `calendar.reconcile`, §9.8 precisa respuestas y la ruta `GET /api/class-sessions/:id/calendar.ics`; `detail.sync[].lastError`. Sin cambios de saldo ni de otras tablas. |
| 1.7 | 22/10/2026 | W05 cierre: P01 versionada360h, solicitud/seguimiento, revisión/recuperación visual y grupos. Sin migraciones ni API de saldo nueva; ventas reales bloqueadas hasta verificación efectiva. | Revisión cruzada: permiso aditivo `class_credits.adjust_any`; tras un reembolso total las liberaciones/restauraciones no devuelven saldo a disponible (cada `release` sigue con `refund`; `adjust` a disponible → 409); reembolso administrativo directo solo sin compra; un intento fallido no fija la transacción del pago.
| 1.6 | 22/10/2026 | W06: precisa §9.7 (intención, revisiones, grupos, asistencia, correcciones/compensación aceptada, recordatorios y límites W07/W08). Conserva 1.3–1.5 de W05 y P01; sin esquema ni API de saldo nuevos. |
| 1.5 | 22/10/2026 | W05: checkout fake, conciliación/saldo/pausa; mutaciones de compra con versión y ajustes idempotentes. P01 comercial resuelta por delegación de Andrés: nuevas condiciones de 15 días y revisión individual; integración efectiva previa a ventas reales, sin cambios de ledger W06. |
| 1.4 | 22/10/2026 | W05 (Codex): lectura propia de invitaciones, metadata de ofertas/política. Sin esquema ni cambios de saldo. |
| 1.3.1 | 22/10/2026 | Correcciones de revisión W05: activación exige versión comercial vista; exclusividad Hotmart serializada entre curso y paquete. Sin cambios de saldo. |
| 1.3 | 22/10/2026 | W05 (Codex): agrega importación explícita de catálogo en §9.3; sin cambio de esquema ni contrato de saldo. |
| 1.0 | 22/10/2026 | Primera versión (W00, Claude). |
| 1.2 | 22/10/2026 | W04 (Claude): `users.chatUnreadEmail BOOLEAN NOT NULL DEFAULT true` (migración `20261109000000-add-chat-unread-email-preference.js`) expuesto como `chatUnreadEmail` en §9.1 (CHAT-09). |
| 1.1 | 22/10/2026 | W04 (Claude): §9.2 agrega `GET /api/conversations/unread` y la lectura auditada de conversaciones reportadas para `chat.moderate`; precisa respuestas, contexto, impersonación y `appendSystemMessage`. Sin cambios de esquema. |
