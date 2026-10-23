# W07 · Google Calendar

Entrega de Claude (Sonnet) para [#20](https://github.com/aguerreroRosarioBus/SpanishNow/issues/20). Rama `w07-google-calendar` desde `main` (6446554). Sin cuentas ni llamadas reales a Google: pruebas con el adaptador fake; el real queda detrás de la misma interfaz y **no se probó contra Google**.

## Requisitos y criterios

| ID | Evidencia |
| --- | --- |
| CAL-01 | OAuth por docente con `external_connections` (independiente de `google_connections`), destino y calendarios de ocupación elegibles, solo permisos de eventos/free-busy/lista de calendarios. El alumno no conecta nada. Prueba: `w07.calendar` (rutas), `w07.adapters` (scopes). |
| CAL-02 | SpanishNow gobierna: un evento por sesión confirmada vía outbox; free/busy sin títulos ni participantes. |
| CAL-03 | Free/busy leído justo antes de confirmar, fuera de la transacción; ocupado → 409, fallo de lectura → 503 recuperable, nunca confirma a ciegas. **No cubierto:** la opción de «revisión docente explícita» como alternativa al reintento (el docente puede desconectar). |
| CAL-04 | Ref con `externalId`, `calendarId`, `etag`, `syncedVersion`, estado; id de evento determinista + `correlationKey` en `extendedProperties`: un timeout no duplica. El evento lleva horario UTC, zona y enlace a la agenda; Zoom de participante si está `ready` (nunca el de anfitrión). |
| CAL-05 | `guestsCanSeeOtherGuests/InviteOthers/Modify = false`, descripción sin mensajes privados. ICS con UID estable, `SEQUENCE` = versión, UTC, sin asistentes y aviso de que importar a mano no se actualiza. |
| CAL-06 | Evento movido/borrado desde Google → `external_changed`/`external_deleted` con aviso en la sesión; no cambia ni confirma la clase; se resuelve desde la app (reintento). |
| CAL-07 | Canales push con token (solo hash), `resourceId`, número de mensaje anti-replay y renovación 24 h antes; sondeo durable (`calendar.reconcile`) si no hay URL pública; 410 → resync completo sin duplicar ni borrar sesiones. |
| CAL-08 | Credenciales cifradas (mismo helper), refresh serializado con lease `refreshLockedUntil` (la llamada a Google va fuera del lock), revocación → `revoked`/`needs_attention`, desconexión conserva historial y sesiones y no toca Drive/Classroom. |
| AC05 (parte Calendar) | El evento usa el mismo instante UTC de la sesión. La parte Zoom es de W08. |
| AC15 (parte Calendar) | Revocación/error deja estado accionable; reintento/reconexión no duplica evento, no pierde clase ni saldo. |

## Decisiones

- **Id de evento determinista** (base32hex de `correlationKey`) en lugar de buscar por propiedad: el `insert` es idempotente (409 → se adopta el evento).
- **Una conexión `needs_attention`/`revoked` bloquea nuevas confirmaciones** (503 `integration_needs_attention`) hasta reconectar o desconectar: es la lectura estricta de CAL-03. Propuesta para Opus: si se prefiere no frenar la agenda, permitir confirmar con aviso explícito del docente.
- **Un job ordinario no recrea un evento borrado desde Google**; solo el reintento explícito (`sync/retry`, `force`) lo hace.
- **Cadena de sondeo durable** (`calendar.reconcile` se reprograma a sí misma por ventana de 5 min, o 30 con push) en vez de un cron aparte; se siembra al conectar y tras cada sync.
- Cambiar el calendario destino no mueve eventos ya creados (la ref conserva su `calendarId`).
- Free/busy no suma el buffer del docente; solo el intervalo exacto de la clase.

## Superficies compartidas (cambios aditivos)

| Archivo | Cambio |
| --- | --- |
| `backend/src/app.js` | Monta `/api/integrations/google-calendar`. |
| `backend/src/models/index.js` | Registra `ExternalCalendarChannel`. |
| `backend/src/services/classSessionLifecycle.js` (W06) | `accept`: lectura free/busy antes de la transacción; reemplaza el 503 fijo. |
| `backend/src/services/classSessionService.js` (W06) | `ics()`; `detail.sync[].lastError`; `retrySync` reintenta los proveedores conectados (antes fallaba si Zoom no estaba conectado) y fuerza Calendar si estaba en `needs_attention`. `join` intacto. |
| `backend/src/routes/classSession.routes.js` | `GET /:id/calendar.ics`. |
| `backend/src/services/testAccountClassData.js` | Borra jobs `external_connections` de cuentas de prueba. |
| `backend/tests/migrationRunner.test.js` | Lista de migraciones (25→26). **Conflicto probable con W08 si añade otra migración.** |
| `frontend`: `app.config.ts`, `app.routes.ts`, sidebar, `angular.json` | Catálogo `calendar.*`, ruta `/teacher/integrations`, ítem de menú (con flag), configuración `calendar-e2e`. |
| `frontend` schedule | Tarjeta de sesión: estado/aviso de Calendar, ICS. |
| `.env.example`, `CONTRATO.md` 1.8 | Variables y contrato. |

No se tocó ningún archivo `zoom*`. W08 debe agregar su tarjeta al `app-integrations` (`frontend/src/app/features/integrations/integrations.component.ts`) y puede reutilizar `externalConnections.js` (`accessToken`, `beginOAuth`, `consumeOAuth`, `saveCredentials`, `disconnect`).

## Configuración

`FEATURE_GOOGLE_CALENDAR=1`, `GOOGLE_OAUTH_CLIENT_ID/SECRET`, `GOOGLE_TOKEN_ENCRYPTION_KEY`, `GOOGLE_CALENDAR_REDIRECT_URI` (por defecto `http://localhost:3000/api/integrations/google-calendar/callback`), `GOOGLE_CALENDAR_NOTIFICATIONS_URL` (opcional), `OUTBOX_WORKER=1` en un proceso API, `INTEGRATIONS_FAKE=1` solo en desarrollo/pruebas. Habilitar la Calendar API y registrar el redirect URI en Google Cloud.

## Pruebas

```sh
# backend (MySQL local descartable)
cd backend && npm test            # jest --runInBand
# frontend
cd frontend && npx ng test --watch=false && npx ng build --configuration production
# e2e aislados (bases spanishnow_w06_e2e_test y spanishnow_w07_e2e_test)
cd e2e && npx playwright test --config schedule.playwright.config.ts
cd e2e && npx playwright test --config calendar.playwright.config.ts
```

Resultados en el PR. Suites nuevas: `w07.connections` (cifrado, state, refresh serializado), `w07.calendar` (rutas, free/busy, sync, timeout, concurrencia, revocación, divergencias, push, 410, desconexión, ICS), `w07.adapters` (ICS puro, adaptador real con `fetch` simulado, limpieza).

## Prueba manual ficticia y desactivación

1. `INTEGRATIONS_FAKE=1 FEATURE_GOOGLE_CALENDAR=1 OUTBOX_WORKER=1`, con la clave de cifrado. Docente de prueba → `/teacher/integrations` → conectar (el fake vuelve solo al callback) → elegir calendarios.
2. Proponer y aceptar una clase; en la sesión, «Calendario / reunión» pasa a *Listo*; reprogramar y cancelar. El alumno baja el `.ics` desde la misma tarjeta.
3. Desconectar: las sesiones y el saldo siguen; la ref queda en *Requiere atención*.

Desactivar: `FEATURE_GOOGLE_CALENDAR=0` (la UI y las rutas desaparecen, la agenda funciona sin Calendar; los eventos ya creados no se borran). Revertir: los commits de W07 en orden inverso; la migración es aditiva (`down` borra solo `external_calendar_channels`).
