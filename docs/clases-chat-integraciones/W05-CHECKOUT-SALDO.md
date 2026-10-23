# W05 — Entrega 3: checkout fake, conciliación y saldo

Codex, rama `w05-checkout-saldo`, dependiente de #37 y #32 con sus correcciones (`cde8d69`). Refs #18. Sin agenda ni cambios a `classCredits.apply` de W00/W06.

## Requisitos y resultado

PACK-12–19, PACK-05–07/09, GROUP-02/03 en compras; AC02/03/09/14, parte comercial de AC10/11/13/19/21/22. No se declara integración de agenda/proveedores ni política de devolución comercial final.

- Un checkout pendiente por oferta, importe/moneda/beneficiarios del servidor. Dos pestañas reutilizan el intento; repetir la clave tras conciliar devuelve 200 sin otro cobro. El retorno solo consulta estado.
- Fake arma payload Hotmart 2.0.0 y atraviesa el mismo conciliador. Callback real conserva `verifyHottok`, enruta paquetes antes de cursos y no crea inscripciones ficticias.
- Evento único, transacción única, compra única y `grant:order:<id>` único. El pago concede exactamente las unidades del snapshot. Email distinto no cambia identidad ni crea cuentas; queda auditado. Payload persistido por allowlist sin hottok/documentos.
- Pagos tardíos, producto/oferta/importe incompatibles o referencia ausente quedan visibles en revisión. Un pago en revisión impide cobrar otra vez, cancelar o reemplazar sin resolverlo. Acreditación manual exige capacidad/motivo y coincidencia verificable de importe/producto/código/transacción; no acredita parciales desconocidos.
- Reembolso confirmado anterior a aprobación impide acreditar. Posterior retira disponibles y cancela compra, conserva consumidos/reservados y deriva reservas a revisión. No crea deuda/recobro. Parciales sin payload/mecanismo validado quedan en revisión sin inventar totales ni capacidad de iniciarlos.
- Compras con seis cubetas de saldo e historial; visibles a comprador/beneficiarios aun con flag apagado. El docente consulta compras propias por alumno. Movimientos exclusivamente mediante ledger W00.
- Pausa versionada, bloqueo por sesiones/reservas pendientes, reanudación por duración real y cap de política; job durable de reanudación máxima. Vencimiento idempotente. Cancelación separada del reembolso. Ajuste con permiso, motivo, versión e idempotencia.
- Renovación manual desde compras del docente abre una oferta nueva en chat; no cambia saldo/vigencia histórica ni cobra automáticamente. Grupo de dos: un pago, una unidad grupal, dos beneficiarios. Grupo de tres: tres compras propias; cohorte lista solo cuando están cubiertas las tres plazas. La agenda sigue en W06.

## P01 comercial resuelta; siguiente paso de implementación

La decisión definitiva de Andrés/orquestación reemplaza instrucciones provisionales: garantía inicial de paquetes 15 días, plazo más favorable prevalece, total voluntario sin consumo en plazo; uso/fuera de plazo/excepciones a revisión individual, sin prorrateo inicial, rechazo automático, deuda ni recobro. Servicio no prestable y grupo incompleto conservan soluciones/devoluciones auditadas sin imponer fecha/vale. Se actualizan SPEC/COORDINACION/CONTRATO §7.7 con esta decisión y sus fuentes.

Este corte guarda la conciliación técnica ya verde. El siguiente paso agrega nuevas reglas/snapshots EN/ES, solicitud/seguimiento de devolución y bloqueo de habilitación real por garantía/formato/cuenta no verificados. No modifica políticas ni compras existentes. El endpoint de solicitud todavía responde `refund_policy_pending` como tramo no implementado en este corte, no como decisión comercial pendiente. Hotmart real no implementado: ejecución fake y conciliación efectiva; no se promete garantía sin verificación ni capacidad de iniciar parciales.

## Contratos y superficies compartidas

CONTRATO 1.5. Pausa/reanudación/cancelación reciben versión; cancelar exige motivo. Ajustes reciben `Idempotency-Key` y `direction: add/remove/restore`. No cambia la API del ledger, esquema de compra ni reglas temporales W06. Nuevas ofertas incluyen metadata `refundPolicyStatus: pending_validation` sin alterar políticas guardadas.

Compartidas: registros aditivos en `backend/src/app.js`; dispatch mínimo en `hotmartService.handleEvent`; rutas lazy y enlaces de navegación en frontend; SPEC/COORDINACION/CONTRATO por asignación de orquestación. Traducciones propias `packages.*`, reutilizando consentimiento legal W02. Sin nuevas migraciones en esta entrega.

Config local: `FEATURE_CHAT=1`, `FEATURE_CLASS_PACKAGES=1`, `PAYMENTS_FAKE=1`, `MAIL_TRANSPORT=log`; `OUTBOX_WORKER=1` procesa jobs. Fake se rechaza en producción. Sin activar ventas/docentes reales.

## Evidencia

- Backend completo: **840/840**, 51 suites, MySQL en bases exclusivas `spanishnow_w05_jest_test*`. Validación dirigida posterior cubre la última revisión de reembolsos/eventos y consumo histórico.
- Frontend completo: **378/378**, 52 archivos; checkout/ofertas/catálogo específico 7/7, conversación incluida 22/22.
- Build producción y diff-check aprobados (advertencias previas Sass/tamaños/ícono).
- Prueba manual real de UI, solo local: backend 3255, frontend 4255, base independiente `spanishnow_w05_manual_test`; docente/alumno con emails `.invalid`. Docente envió 4×50 USD90 desde chat; comprador vio snapshot y pago pendiente sin créditos, luego simuló confirmación. Resultado: una compra con 4 disponibles, 0 reservadas/usadas/reembolsadas y un grant en historial. Pausa/reanudación conservó los 4 créditos; cambio ES→EN conservó saldo e instantes. Sin envío SMTP, cobro ni cuenta real.

## Prueba manual y desactivación

1. Entorno aislado con cuentas ficticias; importar/configurar/activar paquete y habilitar solo al docente ficticio. Abrir chat, enviar oferta, revisar ambas traducciones y condiciones.
2. Comprador abre tarjeta, acepta los documentos exactos cuando existen y continúa: estado pending, cero saldo. Simular confirmación local: una compra/una acreditación. Repetir callback y dos pestañas: no duplica.
3. Abrir saldo/historial; pausar sin sesiones pendientes, reanudar y revisar extensión/constancia de unidades. Con una sesión propuesta/confirmada o reserva, responde `sessions_pending_resolution` sin modificarla.
4. Enviar oferta nueva desde compras del docente: la compra anterior no se resetea. Las compras grupales por API siguen invitaciones propias aceptadas y el plazo común.
5. Revisión por API con `class_payments.review`: pago tardío sin grant; motivo explícito para acreditar si coincide el cobro. Solicitar reembolso fake conserva paid hasta que el evento lo confirma. Falta validar sandbox real y operaciones reales de devolución.
6. `FEATURE_CLASS_PACKAGES=0` bloquea nuevas ofertas/checkouts, preserva lecturas y resolución. `PAYMENTS_FAKE=0` desactiva simulación. Detener los servidores locales manuales; no tocar producción ni borrar snapshots. Sin rollback de datos.

Limitaciones: fixture `class-package-hotmart.synthetic.json` es sintética, no captura de sandbox. SMTP no ofrece deduplicación externa tras un corte entre envío y recibo local; los reintentos ordinarios del handler se deduplican por recibo. El panel visual administrativo y la formación/envío grupal visual siguen en la siguiente entrega; sus APIs ya están protegidas. No se inicia W07–W09.
