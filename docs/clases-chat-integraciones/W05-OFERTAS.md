# W05 — Entrega 2: ofertas inmutables y grupos identificados

**Alcance histórico de este corte.** P01 comercial está resuelta; el cierre vigente y su validación están en [W05-CIERRE.md](W05-CIERRE.md).

Rama `w05-ofertas-chat`, sobre `5ee6cd5` (catálogo #32). Codex. Refs #18.

## Alcance verificable

PACK-10/11/14/17 y base de PACK-12/AC02/13/19; GROUP-01–04 en identificación e invitaciones. AC21 conserva pausa de ventas y lectura histórica. No hay checkout ni acreditación en este paso.

Oferta individual desde conversación docente: vista previa, destinatario y condiciones EN/ES; snapshot de plantilla/política/documentos legales/beneficiarios, precio/vigencia y vencimiento UTC. La tarjeta del chat enlaza un detalle autenticado que lee el snapshot, no el catálogo vigente. Doble envío con la misma clave devuelve la misma oferta; clave con otros datos da 409. Solo docente emisor, comprador y beneficiarios acceden a detalle; una capacidad global no concede lectura del chat. Impersonación prohibida.

Expiración durable `offer.expire`; cancelar/reemplazar conserva snapshots, cierra intentos pendientes como failed y agrega evento idempotente. Un cobro externo posterior deberá conciliarse en revisión en la entrega siguiente. El flag apagado bloquea crear ofertas pero conserva su lectura y cancelación.

Cohortes: el docente invita cuentas propias ya contactadas por chat, con inicio tentativo inequívoco y plazo común. Cada invitado acepta por sí mismo; su vista no expone otros usuarios ni pagos. Ofertas grupales requieren invitaciones completas y beneficiarios D07. Vencimiento de grupo incompleto conserva compras y encola revisión, sin inventar una devolución. La API de formación de grupos existe; el editor visual para crear el grupo y enviar sus ofertas queda para otro paso (la UI de envío actual ofrece individuales).

## Contratos y superficies compartidas

CONTRATO 1.4: alias de lectura autenticada `GET /api/class-cohorts/:id` para invitados y `canSendOffers` en metadata de conversación. El DTO de catálogo agrega política versionada. Sin migraciones ni cambios a `credits.apply`; W06 no debe cambiar sus llamadas.

Superficies compartidas: registros aditivos de rutas en `backend/src/app.js`; rutas lazy nuevas en `frontend/src/app/app.routes.ts`. Integración mínima con W04: campo de disponibilidad en `chatService` y modelo de conversación, enlace docente y tarjeta/eventos en chat. Todas las traducciones nuevas bajo `packages.*`.

## Pruebas

- Backend completo, MySQL local exclusivo W05: **811/811** (48 suites), incluyendo 15 de catálogo/ofertas/grupos; prueba privacidad, concurrencia de ofertas, versiones, cancelación/reemplazo y jobs repetidos.
- Frontend pertinente: **19/19** (catálogo/ofertas y conversación W04).
- Build producción: aprobado; advertencias previas de Sass/budgets/ícono.
- `git diff --check`: aprobado.

La suite completa detectó un middleware autenticador que afectaba rutas ajenas; corregido antes de este commit, aplicando autenticación por endpoint. Todos los endpoints públicos existentes vuelven a pasar.

## Prueba manual ficticia y desactivación

1. Entorno local aislado con `FEATURE_CHAT=1`, `FEATURE_CLASS_PACKAGES=1`, `MAIL_TRANSPORT=log`; sin proveedor real. Crear docente/alumnos ficticios y habilitar/configurar solo sus paquetes.
2. Abrir conversación como docente, «Enviar oferta», elegir 4×50 USD90 y revisar destinatario/condiciones antes de enviar. Abrir tarjeta como comprador y cambiar idioma: conserva precio/versiones.
3. Editar después el catálogo: la oferta anterior no cambia. Reenviar una petición con la misma clave devuelve el mismo ID. Un tercer alumno o admin con permiso de catálogo recibe 404.
4. Formar grupo por `POST /api/teacher/class-cohorts` con versión grupal, `tentativeStartsAt` ISO con zona e IDs ficticios ya contactados. Cada invitado abre el enlace de su propio chat y acepta. Crear oferta por API con cohorte/beneficiarios; antes de aceptar todos da `group_incomplete`.
5. Cancelar o reemplazar por API; comprobar evento e historial. Procesar vencimientos con outbox en local.
6. Desactivar `FEATURE_CLASS_PACKAGES=0`: no crea ofertas nuevas, conserva lectura y cancelación. No borrar datos ni revertir migraciones.

Pendientes: checkout fake/Hotmart y conciliación, compras/saldo, formación grupal visual, pausa/renovación y panel de revisión. P01 pendiente para reembolsos parciales solicitados por la escuela. No se hicieron cobros/cuentas/mensajes/correos reales ni pruebas de sandbox.
