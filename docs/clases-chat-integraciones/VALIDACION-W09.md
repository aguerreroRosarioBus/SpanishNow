# Validación de integración W09

Matriz de criterios de aceptación de integración (SPEC §15, AC01–AC22) y guion de prueba manual (SPEC §16). Todas las pruebas automatizadas usan proveedores fake (`INTEGRATIONS_FAKE=1`) y cuentas ficticias de la base E2E aislada; ninguna llama a Zoom, Google, Hotmart ni a correo real.

## Cómo se leyó la cobertura

- **Cubierto por prueba con ID**: la prueba nombra el AC en su título o comentario.
- **Cubierto por tema**: la prueba ejercita la regla del AC, pero no lo nombra. Se cita el archivo y se verificó por búsqueda de palabras clave, no leyendo cada caso.
- **Hueco**: no se encontró prueba automatizada que ejerza el AC completo. Se explica y se propone seguimiento.

Resultado de ejecución (HEAD de la rama `w09-integracion` tras el último commit de pruebas):

| Suite | Resultado |
| --- | --- |
| Backend `npx jest --runInBand` (HEAD final, tras correcciones de revisión) | 65 suites, 1070 pruebas, OK |
| Backend `npx jest --runInBand` (línea base, antes de W09) | 64 suites, 1065 pruebas, OK |
| Backend `tests/w09.integration.test.js` | 5 pruebas, OK |
| Backend `tests/errorCodes.test.js` (tras #46) | 5 pruebas, OK |
| Frontend `npx ng test --watch=false` | 73 archivos, 477 pruebas, OK |
| Frontend `npx ng build` | OK (advertencias preexistentes de Angular: NG8113 y deprecaciones de Sass) |
| E2E `e2e/schedule-tests/09-integracion.spec.ts` (escritorio) | 1 prueba, OK |

## Matriz AC01–AC22

| AC | Escenario (§15) | Cobertura | Pruebas | Hueco / nota |
| --- | --- | --- | --- | --- |
| AC01 | Interesado registra, elige idioma y zona, chatea; otro alumno no lee | Con ID | `e2e/tests/07-chat-ac01.spec.ts`; `backend/tests/chat.test.js` | — |
| AC02 | Oferta 4×50 USD 90; compra en fake; 4 unidades exactas | Con ID (backend) | `backend/tests/classPayments.test.js`; `backend/tests/w09.integration.test.js` (saldo tras renovación) | Sin E2E de checkout completo en navegador. |
| AC03 | Doble clic, dos pestañas y webhook repetido: una compra | Tema | `backend/tests/classPayments.test.js`; `backend/tests/hotmart.test.js` (idempotencia) | Cerrado en #56: prueba de componente del botón (deshabilitado + carga durante la petición; un segundo clic no lanza otra compra). El backend ya era idempotente. |
| AC04 | Una unidad, dos confirmaciones concurrentes: una reserva | Tema | `backend/tests/classSessions.test.js` (concurrencia); `backend/tests/w00.foundation.test.js` | Revisar que el caso de 1 unidad esté explícito; no se verificó línea a línea. |
| AC05 | Propuesta NY, aceptación Córdoba; Google y Zoom con el mismo instante | Con ID | `backend/tests/zoomSync.test.js` (AC05); `backend/tests/w07.calendar.test.js`; `backend/tests/w09.integration.test.js`; `e2e/schedule-tests/09-integracion.spec.ts` | — |
| AC06 | TZ-T01–TZ-T11, DST, horas inexistentes/ambiguas, zona de servidor distinta | Con ID | `backend/tests/classTime.test.js` (`test.each` sobre `docs/clases-chat-integraciones/fixtures/time.json`, TZ-T04/05/06/08/10); E2E DST `09-integracion.spec.ts` | TZ-T07 (cambiar zona no reprograma) y TZ-T09 (cancelación a 24 h) cubiertas por tema, no por ID explícito. |
| AC07 | Reprogramación no aceptada mantiene original; al aceptar cambia una vez | Tema | `backend/tests/classSessions.test.js` (propuesta obsoleta, `proposal_stale`); `e2e/schedule-tests/08-schedule.spec.ts` | — |
| AC08 | Cancelación en plazo libera; tardía sigue política; ausencia docente no consume | Tema | `backend/tests/classSessions.test.js` (cancelación, `student_no_show`, dispensa) | Dispensa auditada: revisar en el guion manual. |
| AC09 | Pausa/reanudación conserva saldo y extiende vigencia | Tema | `backend/tests/classOffers.test.js`; `backend/tests/classPurchases.test.js` | Sin ID; no se verificó el caso de vigencia extendida. |
| AC10 | Grupo de 2: un pago cubre dos plazas; una sesión consume una unidad | Con ID | `backend/tests/w09.integration.test.js` (grupo de 2); `e2e/schedule-tests/08-schedule.spec.ts` (grupo 2) | — |
| AC11 | Grupo de 3: tres compras, tres confirmaciones; sin reuniones duplicadas | Con ID | `backend/tests/w09.integration.test.js` (grupo de 3); `e2e/schedule-tests/08-schedule.spec.ts` (grupo 3) | — |
| AC12 | Grupo incompleto, reprogramación rechazada, cancelación de participante | Tema | `backend/tests/classSessions.test.js` (grupo 3, cancelación con reembolso parcial); `backend/tests/classCohorts.test.js` | GROUP-04 con ID; GROUP-05–07 por tema. |
| AC13 | Compra pausada/expirada y oferta reemplazada no cobran; pago tardío conciliado | Tema | `backend/tests/classPayments.test.js`; `backend/tests/classTimePersistence.test.js` | Cerrado en #56: cada link de pago caduca (`CLASS_CHECKOUT_LINK_TTL_MINUTES`, 24 h por defecto, a confirmar por Andrés) y hay pruebas de dominio de link vencido, oferta reemplazada, oferta vencida, ventas pausadas y webhook tardío (siempre a revisión manual, sin acreditar). |
| AC14 | Renovación crea compra nueva; sin débito automático; historial intacto | Con ID | `backend/tests/w09.integration.test.js` (renovación) | Renovación por el chat en navegador no tiene E2E propio. |
| AC15 | Error o revocación de Calendar/Zoom: estado accionable; recuperación sin duplicar | Con ID | `backend/tests/w09.integration.test.js` (fallo de Zoom y pérdida de respuesta de Calendar; desconexión de Zoom); `backend/tests/zoomSync.test.js`; `backend/tests/w07.calendar.test.js` | — |
| AC16 | Alumno y Calendar reciben solo enlace de participante; docente ajeno sin anfitrión | Con ID | `backend/tests/zoomSync.test.js` (AC16) | — |
| AC17 | Cambiar idioma conserva borradores, zona, instantes, precios y progreso | Tema | `e2e/tests/08-i18n-student.spec.ts`; `backend/tests/preferences.test.js`; `e2e/schedule-tests/09-integracion.spec.ts` (cambio a EN en mitad del flujo) | Sin prueba que compare todos los datos enumerados. |
| AC18 | Audio con teclado/táctil, metadata, fin, error, cambio de lección | Tema | `e2e/audio-tests/` (`audio.playwright.config.ts`, W03) | Ver W03; no se ejecutó en W09. |
| AC19 | Página, tarjeta, checkout e historial coinciden en precio y condiciones | Tema | `backend/tests/classCatalog.test.js`; `backend/tests/classCatalog.review.test.js`; `backend/tests/legalSales.test.js` | Hueco: no hay prueba que compare las cuatro superficies a la vez. |
| AC20 | Suspensión y limpieza de cuentas ficticias; sin correos reales | Tema | `backend/tests/legalSales.test.js`; `backend/tests/w00.foundation.test.js` | Verificación manual en §16. |
| AC21 | Docente pausa ventas: sin ofertas comprables, con chat y compromisos | Tema | `backend/tests/classOffers.test.js`; `backend/tests/classCatalog.test.js` | — |
| AC22 | Reembolso parcial con redondeo, pago tardío, revocación, outbox repetido | Tema | `backend/tests/classRefunds.test.js`; `backend/tests/classPayments.test.js`; `backend/tests/zoomSync.test.js` (outbox) | Hueco: no se verificó el redondeo ni el caso de pago tardío; revisar antes de activar ventas. |

### Huecos a seguimiento

1. **Compra en navegador**: no hay E2E de checkout que cubra AC02, AC03 ni la renovación (AC14). Propuesta: un E2E sobre el proveedor fake.
2. **Pago tardío y oferta reemplazada** (AC13) y **redondeo de reembolso** (AC22): no hay prueba explícita. Propuesta: pruebas de dominio antes de habilitar ventas reales (ver nota de W05 en #23).
3. **Vigencia en pausa** (AC09) y **comparación de superficies de precio** (AC19): cubiertas solo por tema.
4. **Idempotencia de doble clic en navegador** (AC03): solo en backend.

No se cambió ninguna decisión de producto (D01–D09) ni regla de dinero o zona horaria. Ningún hueco se corrigió por cuenta propia en W09.

## Guion de prueba manual (SPEC §16)

Antes de activar nada en producción, ejecutar en la base de pruebas o en un entorno local, con cuentas ficticias de `backend/seeds/local-test-accounts.json` (no reutilizar credenciales reales). Los proveedores deben seguir en modo fake (`INTEGRATIONS_FAKE=1`).

Preparación:
1. Crear o usar un docente ficticio con zona `America/New_York` y un alumno ficticio con zona `America/Argentina/Cordoba`. Un segundo alumno con zona `Europe/London` si se quiere cubrir tres zonas.
2. Activar los flags solo en el entorno de prueba: `FEATURE_CHAT`, `FEATURE_CLASS_PACKAGES`, `FEATURE_CLASS_SCHEDULING`, `FEATURE_ZOOM`, `FEATURE_GOOGLE_CALENDAR`. `INTEGRATIONS_FAKE=1`.

Recorrido:
1. **Chat y consulta**: el alumno abre el chat con el docente en español; cambiar a inglés y confirmar que el borrador se conserva (AC01, AC17).
2. **Oferta y compra fake**: el docente envía una oferta de 4 clases de 50 minutos por USD 90. El alumno paga con el proveedor fake y obtiene 4 unidades. Repetir el clic de pago dos veces: una sola compra (AC02, AC03).
3. **Propuesta en Nueva York**: el docente propone una clase el 1 de noviembre de 2026 a las 01:30 en la hora ambigua. Confirmar que la interfaz pide elegir la instancia y que la segunda ocurrencia es `-05:00` (AC06, TZ-T05).
4. **Aceptación**: el alumno acepta en su zona. Verificar en la tarjeta ambas horas y que la reunión y el evento muestran el mismo instante UTC (AC05).
5. **Cambio de horario**: el docente propone otro horario; el alumno no acepta y la clase original permanece (AC07).
6. **Proveedores**: con el fake, forzar un fallo de Zoom y de Calendar; comprobar estado accionable en la agenda y reintento; confirmar una sola reunión y un solo evento (AC15).
7. **Grupo de 2 y 3**: repetir con un grupo de dos y uno de tres alumnos; cada uno acepta; no se duplican reuniones (AC10, AC11).
8. **Clase y asistencia**: el docente marca asistencia; el saldo baja una unidad (AC08).
9. **Cancelación**: el alumno cancela con más de 24 h y el saldo se libera; repetir a menos de 24 h y verificar la política (TZ-T09, AC08).
10. **Pausa**: el docente pausa ventas; no aparecen ofertas comprables, pero el chat y las clases confirmadas siguen (AC21).
11. **Renovación**: el alumno renueva desde el chat; se crea una compra nueva y el historial de la anterior no cambia (AC14).

Reversión:
- Desactivar la función: poner en `false` los flags `FEATURE_*` correspondientes. Las compras ya hechas se conservan (SPEC §16).
- Desconectar proveedores desde la pantalla de integración; las clases y el saldo no se pierden.

Registrar cada paso con fecha, cuenta ficticia usada, resultado y captura si corresponde.


## Cierre de #56 por decisión de Andrés (27/10/2026)

Quedan cerrados por decisión de Andrés, sin trabajo adicional: AC22 (redondeo de reembolsos), recorrido E2E completo, AC04, AC09, AC17, AC19, TZ-T07, TZ-T09 y el recorrido manual de §16. Lo que sí se implementó en #56: caducidad de los links de pago y webhook tardío a revisión (AC13) y estado de carga del botón de pago (AC03).
