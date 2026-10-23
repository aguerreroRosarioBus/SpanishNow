# W05 — Cierre comercial en fake y entrega a revisión

Codex, rama `w05-gestion-reembolsos`, desde `2a5b96e`. Cadena de entregas contra main: **#32 → #37 → #42 → PR de cierre**. Ningún merge, despliegue o cuenta real forma parte de esta entrega; merge a cargo de Andrés. Los cortes anteriores se conservan como historial de alcance.

## Resultado y requisitos

W05 implementado para revisión, con proveedores ficticios. Catálogo, oferta y compra conservan importe entero, moneda, beneficiarios, versiones y condiciones. Incluye las seis variantes, importación explícita, expectativas EN/ES, habilitación y pausa de ventas, ofertas privadas con vencimiento/cancelación/reemplazo, checkout idempotente, conciliación y compra/ledger, pausa/reanudación/cancelación, renovación manual, grupos y gestión auditada.

Este cierre cubre **PACK-01–19** en su superficie comercial y **GROUP-01–05/08** en formación, cobro, beneficiarios y resolución de grupo incompleto; GROUP-06/07 sobre sesiones y asistencia corresponden a W06. Evidencia comercial para **AC02/03/09/10/11/12/13/14/19/21/22**; AC04 conserva el ledger/concurrencia W00. Consumo por sesión, propuesta/reprogramación y proveedores de agenda se validan en W06/integración, no se declaran terminados aquí. AC22 no promete iniciar parciales: P01 resuelta excluye prorrateo automático inicial; eventos parciales no verificables quedan en revisión sin inventar importes ni crédito adicional.

- **P01 definitiva:** nuevas reglas/snapshots con `refundMode=full_unused_then_review` y garantía inicial de 360 horas. Preservan períodos mayores del origen. V1/336h, ofertas y compras históricas permanecen intactas; nuevas ofertas desde una plantilla histórica requieren guardar una versión nueva. Solicitudes históricas reciben revisión individual.
- **Reembolso solicitado dentro de plazo y sin consumo:** trámite estándar total. El momento de solicitud conserva el derecho aunque la revisión interna se demore. Reservas no equivalen a uso; deben resolverse expresamente antes de aprobar. Uso/fuera de plazo/excepciones se revisan individualmente, sin rechazo ni aprobación automática. Incumplimiento/grupo incompleto conservan soluciones y devoluciones sin imponer fecha, vale o extensión.
- **Solicitud ≠ aprobación ≠ dinero devuelto.** Preview muestra importe/cubetas y vencimiento calculado, claramente sin verificación Hotmart. Confirmación del comprador, motivo, versión, quote vigente e idempotencia. Capacidad/motivo/confirmación para aprobar; bloquea nuevas reservas, pero no mueve dinero ni ledger. Solo resultado del proveedor concilia. Fake usa el mismo handler. Hotmart queda para gestión manual con seguimiento; sin endpoint de parcial inventado.
- **Reembolso confirmado tras uso:** retira disponibles, cancela compra y conserva consumo; reservas a revisión. Nunca deuda, recobro ni cargo adicional.
- **Mayor plazo verificado:** ampliación auditada con evidencia y fecha ISO; solo mantener/ampliar, sin editar snapshot ni presentar el cálculo como verificación.
- **Grupos visuales:** docente elige variante, integrantes de conversaciones propias paginadas e instante tentativo con desplazamiento explícito. Invitado acepta solo su plaza sin ver identidades/pagos ajenos. Tras aceptación, compositor envía grupo de dos a un comprador (guard global impide segundo pagador) o grupo de tres por plaza. Plazo común. Grupo incompleto pagado bloquea nuevas reservas, conserva saldo/dinero y queda en resolución humana auditada.
- **Administración visual EN/ES:** pagos tardíos/incompatibles, solicitudes/seguimiento, aprobar o pedir información, ajustes por capacidad, habilitación docente y nuevas políticas. Trabajos fallidos se reintentan con motivo; avisos de revisión procesados siguen visibles hasta resolución humana auditada. No requiere SQL manual.

## Cambios y compatibilidad

CONTRATO **1.7** (1.6 es de W06), rutas aditivas documentadas en §7.7. Sin migraciones nuevas en este corte. Se reutilizan políticas, auditoría y outbox W00. **Sin cambios a `credits.apply`, esquema de saldo, reglas TZ ni APIs de W06.** El único mutex nuevo de toda W05 es la migración técnica de #32 que protege producto Hotmart curso/paquete durante validación y escritura.

Servicios/rutas/tests comerciales W05 y UI `features/packages` propios. Superficies compartidas mínimas: rutas frontend, entrada comercial del sidebar; en cortes anteriores registros de app/backend, bundle `packages.*` y tarjetas de chat. No se edita el catálogo global EN/ES ni se reescribe trabajo ajeno. Cursos digitales conservan su política y conciliación.

**Habilitación real bloqueada en código:** `classPackageProvider.assertSelling` devuelve `503 package_provider_verification_required` ante habilitación/reapertura, ofertas o checkout fuera de fake. Un token no habilita ventas. Deben verificarse efectivamente cuenta elegible, formato, producto/oferta, garantía compatible y correlación del webhook antes de construir una habilitación real; el formato Servicio Online tiene restricciones y no se presume compatible. La fixture Hotmart es sintética, no una captura de sandbox autorizado. Esta limitación técnica no deja P01 comercial pendiente.

## Autorización, errores y recuperación

Comprador original solicita y recibe seguimiento; un beneficiario no cobra reembolsos ajenos. Docente ve solo sus grupos/compras. Administración usa `class_payments.review`, `class_credits.adjust`, `class_teachers.manage` o `class_packages.manage_all`, según operación; sin impersonación. Ajenos:404. Mutaciones contrastan versión/quote y responden409 ante estado viejo; claves repetidas no duplican solicitud, pago, compra ni grant. Auditoría append-only y outbox durable; reintento fallido no marca dinero devuelto. Sin tokens/documentos personales en payload persistido.

Las lecturas y resolución de compromisos continúan con `FEATURE_CLASS_PACKAGES=0`. No habilitar flags sobre un corte intermedio de la cadena. `PAYMENTS_FAKE=1` solo local/E2E, prohibido en producción; `MAIL_TRANSPORT=log` en pruebas. Sin cuentas, cobros, correos o mensajes reales. Se conserva la limitación SMTP documentada en el corte3: un corte después del envío y antes del recibo local requiere deduplicación externa para garantizar exactamente un correo.

## Validación

- Suite completa MySQL en bases exclusivas `spanishnow_w05_dev_test` / `spanishnow_w05_jest_test`: **851 pruebas,52 suites aprobadas**; el cierre posterior agrega regresión de demora interna, validada con catálogo, revisión y pagos en **38/38 pruebas de la cabeza final**.
- Suite frontend completa: **382 pruebas,53 archivos aprobados**. Pruebas nuevas: cotización/confirmación e idempotencia de solicitud, preservación del motivo al cambiar idioma, separación de solicitud/aprobación/confirmación, ambas identidades de grupo de dos y bloqueo visual de aprobación con reservas.
- Cabeza final frontend: **11/11 pruebas comerciales**, compilación de producción aprobada; advertencias Sass/presupuestos/ícono de chat ya existentes. `git diff --check` aprobado.
- Nuevas pruebas MySQL: V1 inalterada/360h nuevo/snapshot, solicitud concurrente, quote viejo, pertenencia/capacidad, aprobación separada de dinero, callback fake repetido, reservas, uso e incumplimiento fuera de plazo, plazo ampliado, trámite histórico/manual Hotmart, comprador único por grupo de dos, recuperación auditada y grupo incompleto pagado.

## Prueba manual reproducible y desactivación

1. Base local separada; cuentas ficticias `.invalid`, proveedor fake y correo log. Habilitar docente de prueba, importar/configurar variantes, abrir conversación. Enviar4×50 USD90; checkout pendiente no da saldo, confirmar fake concede exactamente4. Pausar/reanudar y cambiar ES→EN conservan cubetas e historial. Comprobado en corte3.
2. En **Formar grupos**, elegir grupo2, dos conversaciones e inicio ISO con desplazamiento acordado; crear. Comprobado visualmente. Comprador ve0/2, acepta y ve1/2 sin identidades ajenas. La segunda aceptación y el pago se prepararon por servicios sobre esa fixture; resultado: un pago USD30, dos beneficiarios, una unidad grupal y garantía360h. Tests cubren grupo3 con tres pagos USD15 y readiness solo al tercero.
3. Comprador abre compra → muestra importe USD30, disponible1/reservado0/consumido0 y plazo calculado no verificado; escribe motivo y confirma solicitud. UI comprobada: **solicitado**, disponible1, reembolsado0.
4. Revisor autorizado abre Gestión comercial → coteja desglose, motivo y confirmación; aprueba. UI comprobada: **aprobado internamente, pendiente de proveedor simulado**, sin devolución anticipada. Simular confirmación → **reembolso confirmado**, disponible0. Evidencia visual local guardada fuera del repositorio. La confirmación usa el conciliador, no una edición de dinero en frontend.
5. Desactivar `FEATURE_CLASS_PACKAGES`, conservar snapshots, pagos y auditorías. Detener solo servidores manuales propios. No borrar datos ni revertir ledger; rollback funcional por flags. No se activa ningún proveedor real.
