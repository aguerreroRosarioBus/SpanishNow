# W08: capacidades, backoff y recibos Zoom (#54)

Requisitos: ZOOM-05, ZOOM-06, ZOOM-08 y CONTRACT-03; AC15, con regresiones AC05 y AC16. Sin decisiones nuevas D01–D09.

## Capacidades

La fuente de participantes es `GET /users/me/settings` → `feature.meeting_capacity`, documentada en la [API de usuarios de Zoom](https://developers.zoom.us/docs/api/users/). Se exige un entero positivo seguro; no se convierte una cadena ni se supone 100 o la capacidad de un add-on. `/users/me` aporta el tipo de cuenta. Un dato ausente/inválido mantiene la capacidad desconocida.

`external_connections.capabilities` conserva los límites y añade `cacheVersion: 1` y `checkedAt`. Vence a la hora; una caché anterior o futura no es válida. Al conectar se guarda la primera copia. El preflight de oferta/checkout/agenda consulta solo la base: si falta/venció/es inválida, encola `zoom.capabilities` deduplicado y responde `zoom_capacity_unknown` sin efectos comerciales. Con `OUTBOX_WORKER=1`, el job obtiene un perfil vigente y el docente puede reintentar. No es un refresco periódico: se hace a demanda; `zoom.sync` también actualiza capacidades viejas antes de validar. Los errores del job conservan el reintento durable. Una respuesta tardía no resucita un grant desconectado/reemplazado, ni pisa una copia más reciente.

`waitingRoom` es el default informativo de la cuenta, no un bloqueo del preflight. Cada reunión exige sala activa, contraseña y grabación automática deshabilitada; el resultado del proveedor se verifica antes de declarar `ready`.

## Retry-After

El adaptador interpreta segundos o fecha HTTP y genera `retryAt` (epoch ms), `retryable` y `params.retryAfterSeconds`. El servicio relanza solo el código seguro y estos metadatos, sin cuerpos/URLs/tokens. Extensión opcional del contrato genérico del outbox: un error puede aportar `retryAt` finito y representable por `Date`; `runAt` será el mayor entre ese plazo absoluto y el backoff propio. No se recorta al máximo local de seis horas. Sin encabezado válido se mantiene el backoff anterior. Un plazo pasado respeta al menos el backoff propio.

## Dedupe

La migración y retención se detallan en [database.md](../../backend/docs/database.md#recibos-de-webhooks-zoom-w08--54). Consulta de una PK, sin cargar auditorías. El recibo, auditoría, cambios y outbox se confirman juntos. Dos copias simultáneas del mismo evento se serializan por conexión y la PK impide duplicados. Un fallo revierte también el recibo. Ningún webhook consume saldo ni completa la clase.

## Verificación y reversión local

Solo fake o HTTP simulado; nunca usar cuentas, reuniones ni webhooks reales para estas pruebas. Base exclusiva: `spanishnow_w54_jest_test` (y sus bases auxiliares del runner).

```sh
DB_NAME_TEST=spanishnow_w54_jest_test npm test --prefix backend
```

Para prueba manual con cuentas ficticias: habilitar `FEATURE_ZOOM=1`, `INTEGRATIONS_FAKE=1` y `OUTBOX_WORKER=1` en un backend local aislado; conectar docente fake, proponer/confirmar y sincronizar. Cambiar solo los metadatos de caché de esa base de prueba para simular vencimiento: el preflight devuelve capacidad desconocida, el job refresca y el siguiente intento recupera. El fake no requiere Zoom ni el túnel. Las pruebas de `zoomSync` simulan 429 con reloj controlado, duplicados firmados simultáneos y rollback.

Para desactivar, apagar `FEATURE_ZOOM` (no elimina sesiones ni saldo); para volver al código anterior, detener el worker, revertir el código y conservar la tabla aditiva. Borrarla solo mediante `db:migrate:down -- --to 20261027120000-create-zoom-webhook-receipts.js` **revierte también las migraciones posteriores**: no usarlo como reversión aislada de una base actual. La confirmación de pérdida de recibos se exige si contiene filas; usar respaldo y un procedimiento de migración separado si se necesita retirar solo esta tabla.

## Superficies compartidas

- `outbox.js`: únicamente soporte opcional de `retryAt`.
- `models/index.js`: registrar/exportar `ZoomWebhookReceipt`, sin asociaciones ni reordenamientos.
- Migración propia aditiva y expectativa del runner actualizada; documentación de base.
- Sin cambios en OAuth de Google (#51), checkout (#56), cuentas reales, SpanishNow-run ni túnel.
