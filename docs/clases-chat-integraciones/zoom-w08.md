# W08: Zoom en modo fake

Issue #21 · Codex · Rama `w08-zoom` desde `main` `6446554`. Una sola sesión, sin subagentes. Sin decisiones nuevas de producto.

## Alcance y evidencia

| Requisito | Implementación / evidencia |
| --- | --- |
| ZOOM-01 | OAuth fake por docente con state con hash, cookie del navegador, verificador cifrado y PKCE S256 de un uso. El alumno no conecta Zoom. |
| ZOOM-02 | Handler durable `zoom.sync`, instantes UTC y minutos de la sesión interna. Vista propia con acciones Reunión y Pizarra separadas. |
| ZOOM-03 / AC16 | `external_sync_refs` guarda únicamente enlace participante. Host efímero solicitado al momento por pertenencia docente; respuesta `Cache-Control: no-store`. Ni soporte ni terceros obtienen host. |
| ZOOM-04 / AC05 / AC15 | Lock MySQL por sesión sin transacción durante efectos. Buscar correlación antes de crear, actualizar la misma reunión y cancelar sin cambiar sesiones/saldo. Proveedor fake independiente en disco permite simular respuesta perdida y reinicio. |
| ZOOM-05 | Perfil fake declara capacidad explícita, visible en tarjeta. Preflight aditivo de oferta, checkout, propuesta y aceptación; falla cerrado si falta autorización/capacidad. W06 conserva locks y conflictos internos. No se afirman límites de cuentas reales. |
| ZOOM-06 | Waiting room, contraseña, sin entrada antes del anfitrión y `autoRecording: none`. |
| ZOOM-07 | Estado accionable, aviso de próxima clase sin reunión, reintento propio y enlace manual de participante validado y auditado. Manual nunca cambia estado a `ready`. |
| ZOOM-08 | Refresh con CAS/lease entre réplicas, rotación cifrada; webhooks sobre bytes originales con HMAC, timestamp y dedupe durable. Eventos nunca marcan asistencia ni consumen créditos. Backoff de outbox. |

## Archivos y límites de propiedad

- Backend: `src/services/zoomAdapter.js`, `zoomConnection.js`, `zoomService.js`; `src/routes/zoom.routes.js`, `zoomPreflight.js`, `zoomWebhook.js`; pruebas `tests/zoom*`.
- Frontend: `features/zoom/zoom*`, catálogo `core/i18n/catalogs/zoom.ts` (`zoom.*`).
- E2E: `zoom.setup.ts`, `zoom.playwright.config.ts`, `zoom-tests/zoom*`.
- Sin migraciones, modelos ni capacidades nuevas. No modifica saldo, dinero, reglas de zonas, servicios W05/W06, pantalla común ni servicio genérico de conexiones W07.
- `zoomConnection` es una fachada exclusiva del proveedor fake Zoom. Reutiliza el helper de cifrado ya existente en `liveGoogleService`, sin modificarlo. No crea un servicio genérico paralelo. Al integrar W07, se puede delegar esta fachada a su servicio común en un cambio revisado.

Superficies compartidas tocadas, **solo adiciones**:

1. `backend/.env.example`: variables Zoom fijadas en #21 y nota sobre el cifrado existente.
2. `backend/src/app.js`: raw webhook antes de JSON y router propio antes de W05/W06. El router incorpora preflight y resuelve la ruta de join ya acordada.
3. `frontend/src/app/app.routes.ts`: dos rutas lazy propias.
4. Catálogos `en.ts` y `es.ts`: import/spread de claves `zoom.*`.

W07 no estaba en `main`: tarjeta embebible `ZoomCardComponent` en **`/teacher/integrations/zoom`** y vista de clase en **`/zoom/sessions/:id`**. La conexión con la pantalla y navegación comunes queda para la integración posterior con W07/W09. No se editaron sus archivos.

## Contratos y recuperación

Se conservan `external_connections`, `external_sync_refs`, `zoom.sync` y las rutas de CONTRATO §9.8. Se agrega API propia, autenticada y sin impersonación:

| Ruta | Uso |
| --- | --- |
| `GET /api/integrations/zoom/start?state=` | Navegación inicial del OAuth fake y cookie HttpOnly; solo con flag. |
| `GET /api/integrations/zoom/sessions` | Docente dueño: hasta 200 clases confirmadas, estados y aviso de proximidad; sin secretos. |
| `GET /api/integrations/zoom/sessions/:id` | Estado seguro para dueño/participante. |
| `POST /api/integrations/zoom/sessions/:id/retry` | Dueño o `class_sessions.support`: encola trabajo durable y audita. Independiente de la conexión Calendar. |
| `PUT /api/integrations/zoom/sessions/:id/manual-link` | Solo docente dueño: `{ version, joinUrl: string|null }`; audita activación, sin guardar URL en auditoría. |

`GET /api/class-sessions/:id/join` conserva la ruta W06: alumno recibe `{joinUrl, manual}`; dueño recibe `{hostUrl, manual:false}` obtenido al momento, o el participante manual identificado como tal. Las refs heredadas sin ID externo conservan el participante W06 con validación de ruta `/j/`; nunca admiten un host y el docente sigue recibiendo 503 hasta sincronizar una referencia completa.

La correlación es `zoom:session:<id>`; el create fake deliberadamente no ofrece idempotencia. La exclusión por sesión se libera automáticamente al cerrar/morir la conexión MySQL. El handler usa la verdad interna vigente y encola reconciliación si cambia durante el efecto. El outbox guarda solo códigos de error permitidos, nunca cuerpos de proveedor ni host URLs. Reintentos viejos convergen al estado actual.

Al quedar listo Zoom, si existe una conexión Calendar habilitada, se encola `calendar.sync` con clave específica de versión/enlace. Se entrega únicamente la ref participante; el handler Calendar lo implementa W07. El manual se conserva como contingencia independiente del estado de sincronización.

## Configuración

Solo se admite **`INTEGRATIONS_FAKE=1`**. No existe cliente HTTP ni SDK Zoom en este paquete. Fuera del modo fake, operaciones de proveedor devuelven `zoom_fake_required`. `features.assertSafe()` prohíbe modo fake en producción/Railway.

- `FEATURE_ZOOM=1` para conexiones nuevas/preflight; apagado por defecto.
- `FEATURE_CLASS_SCHEDULING=1` y `FEATURE_CLASS_PACKAGES=1` según los recorridos que se prueben.
- `OUTBOX_WORKER=1` para ejecutar sync; la tabla conserva el trabajo si el proceso se detiene.
- `GOOGLE_TOKEN_ENCRYPTION_KEY`: clave existente de 32 bytes base64. Se reutiliza el helper; ninguna credencial sale al frontend.
- `ZOOM_REDIRECT_URI`: por defecto `http://localhost:3000/api/integrations/zoom/callback`; ajustar al puerto del backend local.
- `ZOOM_CLIENT_ID`, `ZOOM_CLIENT_SECRET`: reservadas según #21; este fake no las usa ni autoriza conectar cuentas reales.
- `ZOOM_WEBHOOK_SECRET_TOKEN`: obligatorio para verificar webhooks; sin él se rechazan.

El proveedor fake usa archivos privados (directorio 0700, archivos 0600) bajo el temporal del sistema `spanishnow-zoom-fake`, separado por base y cuenta ficticia. No persiste enlace host. No borrar ese estado a mitad de una prueba de recuperación: representa al proveedor independiente. No es almacenamiento de producción.

## Verificación reproducible y prueba manual

Desde la raíz, con MySQL local disponible y dependencias de cada paquete instaladas:

```sh
DB_HOST=127.0.0.1 DB_NAME_TEST=spanishnow_w08_jest_test INTEGRATIONS_FAKE=1 npm --prefix backend test -- --runInBand
npm --prefix frontend test -- --watch=false
npm --prefix frontend run build
cd e2e
npx playwright test --config zoom.playwright.config.ts
```

La suite backend reconstruye solo su base de test, siguiendo el runner existente. E2E reconstruye exclusivamente `spanishnow_w08_e2e_test`; usa frontend 4388 y backend 3116 (configuración frontend `schedule-e2e` ya existente), un worker, proyectos escritorio y móvil secuenciales. No simula respuestas HTTP de la aplicación: usa login, API, MySQL, outbox y proveedor fake reales. No navega a Zoom.

Recorrido manual con cuentas ficticias habilitadas para clases:

1. Abrir `/teacher/integrations/zoom`; conectar el fake y verificar cuenta, estado, capacidad y protección.
2. Crear una clase confirmada NY/Córdoba con pizarra, usando W06 y cuentas ficticias.
3. Abrir la clase desde la tarjeta y reintentar sync. Actualizar hasta `Lista`.
4. Pedir Reunión como docente y alumno; verificar `/s/` solo docente y `/j/` participante. No abrir enlaces ficticios en Zoom.
5. Reprogramar y aceptar desde agenda; verificar mismo ID externo y nuevo UTC. Cancelar y comprobar ref cancelada, sin movimientos extra de saldo.
6. Desconectar; verificar estado accionable. Guardar un participante manual (rechazar host, HTTP y dominios ajenos), alternar EN/ES y comprobar que no se afirma conexión exitosa.
7. Firmar y repetir webhook `meeting.ended`: una sola evidencia auditada y ningún cambio de asistencia/saldo.

Desactivar: `FEATURE_ZOOM=0` impide nuevas conexiones/preflight, manteniendo lectura y resolución de compromisos. Detener `OUTBOX_WORKER` pausa efectos sin perder jobs. No desactivar `INTEGRATIONS_FAKE` para probar cuentas reales: no hay adaptador real en este PR.

## Limitaciones concretas

Las capacidades, PKCE/OAuth y errores se validan contra el proveedor fake, no contra licencias, scopes ni servicios de Zoom reales. La guía de cuentas reales y el adaptador productivo quedan fuera de esta autorización. W07/W09 deben integrar navegación/tarjeta común y verificar la invitación Calendar extremo a extremo; W08 comprueba el encolado y que la ref compartida nunca contiene host.

## Resultados de entrega

- Backend completo `--runInBand`: **60 suites, 983/983 pruebas**.
- Angular `ng test --watch=false`: **72 archivos, 464/464 pruebas**.
- Build de producción: **aprobado** (advertencias existentes de presupuestos/CommonJS; la descarga de fuentes requiere red).
- E2E W08: **4/4**, escritorio y móvil secuenciales, con login/API/DB/outbox reales y Zoom fake.
- `git diff --check`: aprobado. Sin llamadas a Zoom, cuentas, cobros ni correos reales. Revisión cruzada: Claude; sin merge.
