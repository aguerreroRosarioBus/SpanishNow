# W06 · Agenda y zonas horarias

Entrega de Codex para #19, continuación de la base temporal #31 en el PR #41.
Rama `w06-agenda`, worktree propio `69a5/SpanishNow`, desde la base temporal y merge normal de `main` (`ff1e817`). No se mergean PR desde esta entrega.

## Alcance y requisitos

| Requisito / AC | Evidencia de W06 |
| --- | --- |
| TZ-*, TZ-T01–TZ-T11, AC06 | Base compartida Temporal 0.5.1, fixtures y persistencia en #31; resolver único usado por backend/UI; ambas zonas, fechas y offsets en tarjeta/resumen; DST explícito; servidor E2E Asia/Tokyo y navegadores NY/Córdoba. Ver `W06-TIEMPO.md`. |
| AGENDA-01/02 | Agenda privada `/schedule`, propuesta individual/grupal, duración y compra identificadas, pizarra propia opcional, tarjetas confiables en cada chat privado, edición de propuesta inicial, holds hasta expiración y confirmación por plaza. |
| AGENDA-03/04, AC04 | Confirmación transaccional y crédito por compra; locks de alumnos entre docentes y compras ordenadas; dos confirmaciones con una unidad: solo una reserva. Intervalos semiabiertos y buffer docente, incluyendo holds pendientes. |
| AGENDA-05, AC07 (parte interna) | Original confirmado se conserva al proponer/rechazar/expirar; cambio aceptado una vez, nueva versión y avisos viejos anulados; cambio tardío consume original y reserva nueva solo tras aceptación explícita. |
| AGENDA-06, AC08 | Pausado/expirado impide nuevas reservas; cancelación en plazo devuelve reserva, tardía exige reconocimiento, dispensa con motivo; ausencia docente libera. Corrección posterior con permiso y ledger auditable. |
| AGENDA-07/08 | Outbox durable de expiraciones y recordatorios, recibos en app deduplicados por versión; estados seguros por proveedor y reintento accionable. Llamadas externas fuera de alcance W06. |
| PACK-09/19/20/21 | Solo `classCredits.apply` mueve saldo; correcciones de asistencia y dispensas posteriores devuelven consumos reales; extensión de vigencia requiere capacidad, motivo y aceptación exacta de afectados, sin editar snapshot. |
| GROUP-04–08, AC10/11/12 (agenda/saldo) | Dos personas aceptan la compra compartida y reservan/consumen una unidad; tres compras requieren tres aceptaciones. Baja parcial devuelve solo lo que corresponde; docente decide dictar con menos al mismo precio o cancelar. Cohortes listas admiten clases sucesivas tras plazo inicial. Propuesta vencida/rechazada con compras completas admite nuevo acuerdo sin reabrir checkout. |
| AC05 (parte interna), AC17 | NY→Córdoba por UI real, resumen antes de aceptar, EN/ES conserva borrador y reconocimiento; los instantes no cambian. |
| AC16/20/21 (superficie W06) | Recurso ajeno 404, impersonación 403, suspendidos no confirman; dueño puede resolver compromisos con ventas pausadas/flag apagado. Nunca se entrega enlace host ni datos de pagos ajenos. |

Los AC05/07/11/15/16 integrales requieren Calendar/Zoom de W07/W08. Los AC12/13 y devoluciones involucran W05. Esta entrega prueba agenda/saldo/avisos internos; no presenta esos AC externos como completos. Pausa/reanudación/checkout/reembolsos de compras y P01 pertenecen a W05. Safari/dispositivo físico y activación integral corresponden a W09.

## Cambios y compatibilidad

- `backend/src/services/classSessionService.js` y `classSessionLifecycle.js`: autorización por pertenencia, opciones, lecturas, propuestas, confirmaciones, conflictos, cancelación, asistencia, compensaciones, recibos y refs de integración.
- `backend/src/routes/classSession.routes.js`: `/api/class-sessions*`, montado aditivamente en `app.js`.
- `frontend/src/app/features/schedule/` y servicio HTTP tipado: agenda, tarjeta compartida con chat, presentación en zonas y mensajes EN/ES. Lecturas/acciones descartan respuestas de otra cuenta o navegación; polling acotado de tarjetas pausa con pestaña oculta.
- Superficies compartidas mínimas: ruta lazy y registro del catálogo I18N, enlace de sidebar, enlace de propuesta desde chat docente, render de `session_proposal` y traducción de eventos `session_*`. No se reemplaza la rama de ofertas W05.
- `e2e/schedule.*`, helper y `08-schedule.spec.ts`: configuración aislada de W05, sin interceptar respuestas de agenda. `angular.json` y environment agregan solo la configuración E2E W06.
- Sin migraciones ni cambios a modelos, curso/inscripción, `classCredits` o reglas comerciales guardadas. La base temporal agrega la dependencia fijada y su código generado en #31.
- `CONTRATO.md` 1.6 conserva el documento publicado 1.5 de W05 (`w05-checkout-saldo`) y precisa solo agenda §9.7. Mantiene P01 aprobada, sin cambiar `refundWindowHours` ni reinterpretar compras. W05 conserva la propiedad de SPEC/COORDINACION y política nueva.

## Contratos, permisos y configuración

El payload completo, los endpoints, las revisiones y consumidores están en CONTRATO §9.7. `Idempotency-Key` crea una sola sesión; las respuestas exigen versión vigente. Aceptación final y ledger comparten transacción READ COMMITTED con locks docente→sesión→alumnos→compras y reintento acotado de deadlocks. Proponer/consultar no reserva ni consume.

La agenda usa permisos del recurso: docente dueño o plaza identificada. `class_sessions.support` solo habilita inspección/reintento de refs seguras, sin chat/host. Las correcciones excepcionales además exigen `class_credits.adjust` y docente dueño; una capacidad global no concede lectura privada ajena. Usuarios de prueba impersonados no pueden mutar agenda.

Con `FEATURE_CLASS_SCHEDULING=1` se habilitan propuestas/aceptaciones/rechazos. Con `0` permanecen lectura, cancelación, asistencia y correcciones de compromisos. No se crea una excepción a la suspensión de cuenta. `OUTBOX_WORKER=1` en un proceso API habilita expiraciones/recordatorios W00; handlers se registran al cargar la agenda. En E2E se apaga el worker para controlar el estado; los tests HTTP ejecutan entregas y reentregas reales del outbox.

Los errores llevan `code/params`, se traducen EN/ES y ante 409 la tarjeta recarga la revisión sin reenviar aceptación automáticamente. Entre ellos: `proposal_stale`, `version_conflict`, `schedule_conflict`, `insufficient_credit`, `group_incomplete`, errores DST, `compensation_acceptance_required` y `attendance_charge_review_required`. Ante un cargo nuevo derivado de corrección se requiere revisión, sin débito retroactivo automático.

La observabilidad está en `audit_logs` (`session.created/proposed/accepted/confirmed/rescheduled/cancelled/attendance/attendance_corrected/adjusted/extend_validity/extension_requested/charge_waived/reminder/replaced`), ledger y outbox. Las razones de excepciones no se publican a otros participantes. Los recibos `session.reminder` usan actor destinatario y dedupe bajo lock del agregado; el feed solo muestra la versión vigente. No se envía correo.

## Límites de integración explícitos

Sin conexión, las refs Calendar/Zoom quedan `needs_attention`; `sync/retry` informa que debe conectarse. Con flag y conexión se encola el topic contractual; W07/W08 implementarán sus handlers/adaptadores. Una conexión Google existente requiere free/busy y la confirmación responde 503 hasta disponer de W07, evitando confirmar disponibilidad externa inventada. Ninguna llamada externa mantiene locks.

`join` del alumno valida HTTPS `zoom.us` y entrega únicamente enlace de participante listo/manual. El host responde 503 hasta W08; nunca se guarda o devuelve como sustituto un enlace de alumno. Pizarra propia sin curso usa la ruta de acceso ya existente y no implica acceso a cursos ni consumo por entrar.

Para grupo sin compras completas después del plazo inicial se conserva el historial y se resuelve con W05 (devolución o nueva formación consentida). No se habilita un checkout tardío ni se cambia un beneficiario comprado mediante la agenda. Para reemplazo, cancelar/resolver la sesión anterior y crear nueva cohorte/invitación/compra según W05; nunca se edita una identidad histórica. No se fuerza una nueva fecha ni una extensión: la extensión requiere solicitudes exactas de todos los afectados y puede optarse por devolución conforme P01.

## Pruebas reproducibles

Solo bases locales descartables. La suite backend aplica migraciones sobre la base histórica de prueba existente del repositorio; el E2E W06 parte de esquema vacío y migraciones y crea solo cuentas `@jest.test`. Mail en log, órdenes fake, ningún proveedor o cuenta real. No ejecutar reconstrucciones sobre bases compartidas o producción.

```sh
# Desde la raíz: paridad del módulo generado
node scripts/generate-class-time.cjs --check

# Desde backend: DB_NAME_TEST distinto de DB_NAME, únicamente MySQL local
DB_HOST=127.0.0.1 DB_NAME_TEST=spanishnow_w06_jest_test npm test
npm run test:time

# Desde frontend
npx ng test --watch=false
npx ng build --configuration production

# Desde e2e: reconstruye exclusivamente spanishnow_w06_e2e_test en 127.0.0.1
npx tsc --noEmit
npx playwright test --config schedule.playwright.config.ts
```

| Verificación | Resultado |
| --- | --- |
| Backend completo | 48 suites / 886 pruebas aprobadas |
| Regresión final de agenda | 33/33 aprobadas; incluye cancelar propuesta no confirmada sin cargo aunque falten menos de 24 h |
| Tiempo puro | 56/56 aprobadas; persistencia adicional incluida en suite completa |
| Frontend completo | 51 archivos / 390 pruebas aprobadas |
| Build producción | Aprobado |
| E2E W06 aislado | 8/8 aprobadas |
| TypeScript E2E, generador `--check`, `git diff --check` | Aprobados |

### Revisión cruzada (Claude, 22/10/2026)

Hallazgos publicados en #41. Corregidos en esta rama, con una prueba de regresión cada uno:

- **P1-1** (`0795a6e`): aceptar una reprogramación dejaba los recordatorios a la hora original. La clave del aviso incluye el inicio, se anulan los de la versión vigente que ya no corresponden y el handler descarta entregas de otro inicio.
- **P2-1** (`22496f1`): una reprogramación pendiente podía aceptarse tras dictarse la clase original. Ahora vence a más tardar al inicio original, `accept` lo rechaza y la asistencia retira propuestas pendientes.

Tras las correcciones: backend completo **888/888** (48 suites, +2 regresiones), tiempo puro 56/56, `ng test` 390/390, build producción aprobado, E2E W06 **8/8**, generador `--check` y `git diff --check` aprobados.

La suite de agenda contiene 33 casos HTTP/servicio con ledger real: concurrencia, versiones, autorización, holds, límites reales 24 h, compras, grupos, recordatorios, corrección/dispensa, consentimiento, pizarra y cohortes sucesivas. El cliente tiene 7 pruebas de agenda además de 12 de tiempo compartido. E2E: 8/8 en Chromium escritorio y móvil emulado (4 escenarios ×2), sin mocks de API: individual NY/Córdoba y reprogramación rechazada, DST explícito/idioma, grupo de dos, grupo de tres con baja y decisión docente. Se inspeccionan reservas reales después de cada aceptación grupal. La suite vive en `e2e/schedule-tests/` para que el runner TPRS no la ejecute con otra base/puerto; su descubrimiento se verificó por separado. Capturas escritorio/móvil verificadas visualmente; archivos en `e2e/test-results/` son artefactos locales ignorados.

El build necesita descargar las fuentes públicas ya configuradas en la app; el primer intento sin red falló por DNS y se repitió con acceso autorizado. Persisten advertencias Sass previas y CommonJS `jsbi` del polyfill, sin error de compilación.

## Prueba manual ficticia y desactivación

1. Ejecutar el E2E anterior; crea docente NY, alumnos Córdoba, compras pagadas fake y conversaciones ficticias. No usar usuarios ni cuentas externas reales.
2. Docente: entrar a `/schedule` o «Proponer una clase» en su conversación; confirmar zona, elegir alumno/compra o cohorte, horario y pizarra opcional. Revisar fecha, zona y offset.
3. Alumno: abrir la tarjeta del chat, revisar ambos horarios, marcar reconocimiento y aceptar. En grupo, comprobar que sigue pendiente hasta aceptar la última persona. Cambiar idioma a mitad del resumen conserva su estado.
4. Docente: proponer otro horario; alumno rechaza. Original y reserva permanecen. Repetir y aceptar para verificar cambio único; para tardía, revisar el consumo original y crédito nuevo antes de aceptar.
5. Cancelar en plazo y comprobar devolución. Tras la clase, docente registra asistencia por plaza con motivo. No marcar dictada antes del final. Corrección excepcional: otorgar la capacidad explícita en un entorno de prueba y registrar motivo; ningún ledger se borra.
6. Por ausencia/cancelación docente que impide usar el paquete, cada afectado puede solicitar y aceptar una duración de extensión en «Clases compradas»; docente dueño con capacidad aplica exactamente esa duración. Sin consentimiento coincidente se rechaza. La opción de devolución sigue en W05.
7. Sin proveedores conectados se informa «requiere atención» y el compromiso interno sigue visible. No marcar Calendar/Zoom como listos manualmente para simular una integración verificada.

Para desactivar nuevas propuestas, `FEATURE_CLASS_SCHEDULING=0`: conservar DB/ledger/outbox e historial y permitir resolver compromisos. Para detener jobs de este proceso, `OUTBOX_WORKER=0`; no borrar jobs ni tablas. Revertir los commits de W06 con Git en orden inverso si se decide retirar código, coordinando primero los handlers W07/W08; no ejecutar rollback destructivo de W00 ni borrar compras/reservas existentes.
