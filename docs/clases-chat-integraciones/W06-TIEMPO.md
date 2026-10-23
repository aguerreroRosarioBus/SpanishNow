# W06 — primera entrega: base temporal

22/10/2026 · Codex · Refs #19 · Contrato vigente: [CONTRATO.md §1.2–1.3](CONTRATO.md).

## Alcance

Implementa utilidades reutilizables de **TZ-01/02/04/05/06/12/13/16** y el cálculo de intervalos de **AGENDA-04**. La presentación estructurada prepara TZ-07/08. Automatiza los cálculos de TZ-T01–T11; **AC06 es parcial** hasta integrar las rutas, la UI y el saldo. No completa AC04/05/07/08 ni habilita agenda.

Una única fuente TypeScript vive en `frontend/src/app/core/time/class-time.ts`. `scripts/generate-class-time.cjs` genera `backend/src/domain/classTime.js` (CommonJS) y admite `--check`. Se versionan ambos archivos para que backend y frontend se puedan instalar/desplegar por separado sin depender de una carpeta hermana en ejecución. El test backend verifica la huella SHA256 de la fuente; `npm run check:time` en frontend verifica también el contenido generado completo. Para cambiar reglas, editar la fuente y regenerar antes del commit.

Ambos `package.json` y locks fijan `@js-temporal/polyfill` en **0.5.1**. Los datos IANA provienen del `Intl` del runtime: fijar el polyfill no fija la versión de ICU/tzdb. Los fixtures permiten detectar diferencias al actualizar Node/navegadores. No se recalculan ni se modifican sesiones históricas o futuras automáticamente (TZ-17 sigue pendiente de la integración).

## Uso

Backend:

```js
const time = require('../domain/classTime');
const temporal = time.resolveLocalIntent({
  localStart: '2026-11-01T01:30',
  timeZone: 'America/New_York',
  offset: '-05:00',
  disambiguation: 'later',
  minutes: 50
});
// { localStart: '2026-11-01T01:30', timeZone: 'America/New_York',
//   utcOffset: '-05:00', disambiguation: 'later',
//   startsAt: '2026-11-01T06:30:00.000Z', endsAt: '2026-11-01T07:20:00.000Z' }
```

Frontend: importar las mismas funciones desde `core/time/class-time`. La validación del cliente es orientativa: la futura ruta de agenda debe extraer los cinco campos de intención local y **resolverlos otra vez en servidor**, antes de cualquier escritura. `resolveLocalIntent` rechaza campos desconocidos, incluidos `startsAt`/`endsAt`; no aceptar un UTC calculado por el cliente como autoridad.

| Función | Comportamiento |
| --- | --- |
| `isTimeZone(value)` | IANA/UTC; acepta alias reconocidos por Temporal y rechaza abreviaturas, países y offsets sueltos. No cambia preferencias. |
| `normalizeInstant(value)` | ISO con `Z`/offset explícito → ISO UTC con tres decimales. Sin zona → `time_without_zone`; valor inválido → `validation_failed`. |
| `resolveLocalIntent(intent)` | Devuelve intención local y extremos UTC. Hora inexistente → `local_time_nonexistent` y alternativas; repetida sin selección → `local_time_ambiguous` y dos opciones. Offset incompatible con zona/fecha/selección → `offset_mismatch`. |
| `inTimeZone(instant, zone)` | Proyección pura con fecha local, IANA, offset y el instante original normalizado. |
| `presentSessionTime(interval, recipientZone, teacherZone, locale)` | Dos extremos por zona con etiquetas completas (día, fecha, año y hora), IANA/offset separados y `differentDates`. La futura tarjeta debe mostrar todos esos datos y la aclaración de cambio de fecha. |
| `addElapsed(instant, { hours?, minutes?, seconds? })` | Unidades enteras transcurridas, con signo explícito; rechaza días/meses y fracciones. |
| `isAtLeastHoursBefore(startsAt, now, hours)` | `startsAt - now >= hours` con igualdad incluida. No decide cargos ni mueve saldo. |
| `intervalsConflict(a, b, bufferMinutes)` | Intervalos válidos `[inicio, fin)`; buffer simétrico aplicado una sola vez. Igualdad exacta de separación permitida. |

La intención de agenda usa precisión de minutos (`localStart` **CHAR(16)**, `utcOffset` **CHAR(6)** de W00). Rechaza segundos/fracciones locales en lugar de truncarlos. La duración cabe en el `SMALLINT UNSIGNED` existente (1–65535); la compatibilidad con los minutos comprados la validará el servicio de sesiones. Los instantes genéricos aceptan precisión hasta milisegundos; se rechaza precisión mayor para no perder información silenciosamente. En una hora no ambigua se guarda `disambiguation: 'none'`.

Los errores son `TimeError` con `statusCode=400`, `code` y `params`, compatibles con el middleware existente y los mensajes EN/ES de W01. No se pasan excepciones de Temporal a clientes. Las alternativas contienen fecha local, zona, offset e instante; las opciones ambiguas contienen offset e instante, en orden anterior/posterior. Elegir un offset sin `earlier`/`later` no elude la selección explícita de una hora repetida.

## Validación

- Fixtures UTC independientes: `fixtures/time.json`, consumidos por Jest y Angular/Vitest.
- `cd backend && npm run test:time`: reglas puras sin base ni variables privadas.
- `cd frontend && npm run check:time`: artefacto generado idéntico a su fuente.
- `cd frontend && TZ=Asia/Tokyo npm test -- --watch=false --include='**/class-time.spec.ts'`: mismos casos en el runtime de cliente.
- `cd backend && TZ=America/Los_Angeles DB_HOST=127.0.0.1 DB_NAME_TEST=spanishnow_w06_jest_test npm test -- classTime`: reglas + persistencia con sesión MySQL en `+09:00`. Solo reconstruye una base local descartable.

Casos: desfase de los cambios DST de Nueva York/Londres; horas inexistentes y repetidas; salto de 30 min en Lord Howe y fecha omitida en Samoa; offsets +05:30/+05:45; cambio de día; idioma/zona sin alterar instantes; duración al retroceder el reloj; plazo exacto de 24 h y un segundo después cruzando DST; 2160 h; extremos adyacentes y buffer exacto. El test de persistencia verifica que sesión/propuesta guardan sin truncamiento intención, resolución e instantes UTC. Los subprocesos de Jest comparan UTC, Tokio y Los Ángeles.

Resultados de esta entrega: suite completa backend **849/849** y frontend **383/383**; después del ajuste final de precisión a CHAR(16)/CHAR(6), validación pertinente backend **57/57** (56 puras + 1 MySQL) y cliente con `TZ=Asia/Tokyo` **12/12**. Build de producción final y `check:time` aprobados. El build conserva advertencias previas de Sass/Bootstrap, import sin usar de chat y presupuestos de estilos. Sin E2E de agenda: todavía no existe el recorrido.

## Continuación de W06

1. Rutas de CONTRATO §9.7 y servicio de sesiones: permisos/impersonación, preferencia de zona confirmada (TZ-03), idempotencia y versiones; propuestas y vencimiento que retienen horario sin consumir crédito.
2. Confirmación atómica con locks de §6.4, `classCredits.apply` y validación de compra/grupo/vigencia. No implementar compras, checkout ni acreditación (W05).
3. Reprogramación conserva original; cancelación/asistencia aplican política y auditoría. Probar AC04/07/08 con concurrencia y saldo real.
4. Tarjetas de chat/UI con resumen, ambas zonas/offsets, cambio de fecha y aceptación por participante; pruebas de navegador reales (incluidas zonas distintas de proceso/DB).
5. Outbox durable por versión; integración con W07/W08 por adaptadores fake/sandbox. No conectar proveedores reales.

Sin migraciones, nuevas rutas, flags activados ni cambios D01–D10. Superficies compartidas: solo dependencias/scripts de los dos paquetes. Prueba manual sin cuentas: ejecutar el ejemplo con Node, quitar la resolución para ver las dos opciones y usar el fixture de marzo para ver las alternativas. Desactivar/revertir: revertir esta entrega; no hay datos ni migraciones que revertir. Hasta que la UI consuma estas funciones no hay cambios visibles en la app.

Referencias de implementación: [Temporal.ZonedDateTime](https://tc39.es/proposal-temporal/docs/zoneddatetime.html), [polyfill v0.5.1](https://github.com/js-temporal/temporal-polyfill/tree/v0.5.1). Las reglas de producto provienen de SPEC/CONTRATO.
