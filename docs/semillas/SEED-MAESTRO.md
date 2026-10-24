# Seed maestro de demostración local

Seguimiento W09 #83. Comando: `npm run db:seed:master -- ...`, desde `backend/`.

Añade contenido a una base existente y migrada; no la reconstruye. No modifica esquema, contraseñas, permisos, preferencias, conexiones ni datos anteriores. Los únicos cambios sobre filas existentes son los contadores de una conversación donde el usuario haya solicitado añadir actividad y la marca `emailNotifiedSeq` que impide notificar por correo los mensajes sintéticos. Los mensajes anteriores se conservan íntegros.

## Cobertura

Por docente: cinco cursos (cuatro publicados y un borrador A1–B2), quince unidades, cuarenta y cinco historias originales de demostración, ciento treinta y cinco preguntas de comprensión, quince evaluaciones con tres preguntas cada una, vocabulario sin palabras duplicadas dentro de la unidad, planes TPRS con expresiones, tres escenas, preguntas durante la narración, lectura completa, refuerzos y reapariciones explícitas. Cada unidad tiene un cuaderno PDF real; cada curso una portada SVG. `--audio` genera dos narraciones WAV por historia con una voz local de macOS. Ningún enlace apunta a material inexistente ni a una reunión simulada de un proveedor real.

Veinticuatro alumnos ficticios comparten cursos de ambos docentes, con distintos avances, respuestas incorrectas y reintentos, repasos, evaluaciones fallidas/aprobadas y certificados únicamente al completar las historias y aprobar todos los quizzes. Se añaden comentarios con respuestas y consultas pendientes. Los alumnos existentes se incluyen solo mediante `--student-email`, sin cambiar su cuenta.

Ventas: órdenes pagadas, pendientes, fallidas, devoluciones totales/parciales, cupones con usos calculados, afiliados con comisiones exactas y liquidaciones menores a lo devengado. Paquetes: las seis variantes de SPEC §3, ofertas, compras y renovación manual, saldo disponible/reservado/consumido/expirado/reembolsado, pausa, grupos de dos y tres listos y uno en formación, pagos ficticios a revisar. Agenda: historial de completadas/canceladas/ausencias, propuestas próximas y confirmadas, participantes, aceptación, reservas por compra y pizarras con notas y participantes reales del ejemplo.

Las fechas cubren hasta ciento ochenta días, limitadas por la fecha de creación de cada docente y alumno existente. Una cuenta creada ayer recibe actividad reciente; no se falsifica su antigüedad. Las sesiones evitan cruces con las ya existentes, respetan diez minutos de margen y conservan instante UTC, intención local y zona IANA. El historial de un docente reciente será más corto.

Las pantallas de integraciones conservan su estado real de conexión. Las páginas legales conservan los documentos ya publicados; los snapshots de demostración no inventan una aceptación de términos por parte de una persona. Los textos de estos cursos son ejemplos ficticios, con una estructura narrativa deliberadamente repetida para practicar expresiones; no constituyen un programa pedagógico certificado.

## Uso

Primero muestra un plan sin conectarse a MySQL ni escribir archivos:

```bash
npm run db:seed:master -- --db spanishnow_main \
  --teacher-email admin@gmail.com \
  --teacher-email solangeriff@gmail.com \
  --student-email lucas@gmail.com \
  --student-email jane.smith@example.test \
  --student-email tom.brown@example.test \
  --student-email lucasogluke@gmail.com
```

La aplicación requiere `--apply --confirm-db spanishnow_main`. `--env-file` permite leer la configuración de SpanishNow-run sin modificarla. `--assets-dir` debe apuntar a la carpeta `frontend/public/seed-master` del frontend que se esté usando; las URLs guardadas son relativas a `/seed-master`, válidas en HTTPS, LAN y túnel. Los archivos son contenido local generado e ignorado por Git. No hace falta activar uploads falsos ni configurar Cloudinary.

```bash
npm run db:seed:master -- --env-file /ruta/SpanishNow-run/backend/.env \
  --db spanishnow_main --apply --confirm-db spanishnow_main \
  --teacher-email admin@gmail.com --teacher-email solangeriff@gmail.com \
  --student-email lucas@gmail.com --student-email jane.smith@example.test \
  --student-email tom.brown@example.test --student-email lucasogluke@gmail.com \
  --assets-dir /ruta/SpanishNow-run/frontend/public/seed-master \
  --backup-dir /ruta/respaldos-locales --audio --voice Paulina
```

El frontend sirve estos archivos desde su carpeta pública. La generación de audio requiere macOS, `say` y la voz española indicada instalada. Sin `--audio`, las columnas de audio quedan nulas: nunca se fabrican URLs de audio que no existe. El audio se valida contra archivos WAV vacíos (el sandbox de macOS puede crear un encabezado sin sonido si no permite acceder al sintetizador). Los PDFs e imágenes se generan sin red. Para regenerar únicamente archivos perdidos se puede usar el módulo `seeds/master/assets.js`; volver a ejecutar un seed ya aplicado no vuelve a tocar sus medios.

Contraseña exclusiva de las 24 cuentas nuevas: `SEED_MASTER_PASSWORD`, o `tprs-local-test-1` en este entorno local. Identidades: `master.emma.wilson@example.test`, `master.oliver.brooks@example.test`, etc. Todas tienen `isTestAccount=true`, sin permisos administrativos y con correos de chat desactivados. Las cuentas anteriores mantienen su contraseña. No usar estas credenciales fuera de la demostración local.

Verificación de solo lectura:

```bash
npm run db:seed:master -- --env-file /ruta/SpanishNow-run/backend/.env \
  --db spanishnow_main --verify
```

## Garantías y límites

- Solo MySQL local; rechaza producción/Railway y cualquier base fuera de `spanishnow_main` o `spanishnow_master_*test`.
- Respaldo completo antes de la primera escritura, mediante `mysqldump --single-transaction --routines --triggers`, gzip verificado y archivo con permisos 0600. Si falla, aborta.
- Lock nombrado de MySQL contra dos seeds simultáneos y locks de filas sobre docentes y conversaciones; una sola transacción para todo el dataset y su manifiesto.
- Marca `audit_logs.action=seed.master.v1` con IDs y fecha ancla. Repetir con el mismo alcance valida y devuelve los mismos IDs, sin modificar datos ni contraseñas. Un alcance diferente o filas faltantes se rechazan: no se intenta reconstruir ni reparar información silenciosamente.
- Los movimientos de saldo pasan por el servicio real `classCredits`, con claves de idempotencia y validación de sumas, reservas, consumos y beneficiarios. Los grupos de dos consumen una sola unidad por compra; los grupos de tres reservan una unidad de cada compra.
- Validación antes del commit: enlaces de planes/preguntas/cursos, respuestas y puntajes, elegibilidad/cronología de certificados, secuencias/no leídos, snapshots, importes/comisiones/cupones/liquidaciones, ledger, plazas, duración/UTC/zona, vigencia, solapamientos y offsets de tooltips.
- Cero llamadas a proveedores, SMTP o webhooks, cero jobs en outbox. No se habilitan docentes, ventas de paquetes, verificaciones de proveedor ni credenciales. Las plantillas nuevas quedan en borrador o pausadas; las compras históricas son registros ficticios del proveedor `fake`.
- Los medios se generan antes de la transacción: un fallo puede dejar archivos locales, pero ninguna fila parcial. Las fechas son una foto del día de ejecución; repetir no desplaza clases ni reescribe historia.
- La auditoría del manifiesto está pensada para el dataset recién cargado. Tras operar manualmente sobre él, sus relaciones pueden evolucionar; un fallo de verificación requiere revisar esas operaciones, nunca volver a insertar por fuerza.

## Pruebas manuales

Entrar como docente existente: recorrer cursos, gestión de unidades/lecciones, comentarios, ventas/órdenes, cupones/afiliados, mensajes, plantillas/compras/grupos, agenda y pizarras finalizadas. Abrir una portada, descargar un PDF y escuchar narración normal/lenta. Entrar como Emma para ver certificados y como Oliver para progreso parcial, evaluaciones y refuerzos. Revisar grupos de dos (una compra cubre dos personas) y tres (tres compras).

El seed no es una prueba de compra real ni valida proveedores. Cubre fixtures de CONTRACT-01/03/05, PACK-19, TZ-01/05 y consistencia de AC19/20. Los flujos funcionales siguen cubiertos por sus suites propias.

## Desactivar o revertir

No se integra al arranque ni al seed curado; deja de ejecutarse al no invocarlo. Un fallo previo al commit se revierte automáticamente. Después del commit, conservar la base y el respaldo; para recuperar el estado previo, detener la copia local y restaurar el dump completo sobre una base vacía con autorización expresa, después de respaldar cualquier actividad posterior. Nunca borrar IDs del manifiesto a mano: pueden haber recibido actividad de usuarios o tener referencias nuevas.

Los cambios de código solo añaden `db:seed:master`, sus módulos, pruebas, documentación e ignores para artefactos. No se requiere migración, configuración de proveedores ni cambio en una superficie compartida de aplicación. El merge del PR queda a cargo de Andrés.
