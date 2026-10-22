# W02 · Expectativas y páginas legales

Entrega de [#15](https://github.com/aguerreroRosarioBus/SpanishNow/issues/15), rama `w02-expectativas-legal`. **La empezó Codex** (backend, `6d14e79`) y **la terminó Claude** (precisión de aceptaciones, limpieza de cuentas de prueba, revisión y todo el frontend).

## Requisitos cubiertos

| ID | Estado |
| --- | --- |
| SALES-01 | Expectativas estructuradas EN/ES de cursos (para quién, nivel/conocimientos previos, objetivo, qué contiene, dedicación autónoma, resultados, acompañamiento incluido/no incluido). La dedicación autónoma es un campo distinto de la duración de clase. |
| SALES-02 | **Parcial**: el validador `salesExpectations.validateExpectations` es el contrato que W05 reutiliza para `class_package_template_versions.expectations`. Los datos propios de paquetes (sesiones, plazas, vigencia…) son de W05. |
| SALES-03 | Nota fija: el acceso vitalicio al contenido no incluye clases en vivo/chat/feedback salvo que lo digan las expectativas. |
| SALES-04 | Instantánea comercial con `hash` (precio, moneda, expectativas, versiones legales). Página, checkout e historial muestran la misma; si cambia entre pantalla y compra → `409 sales_snapshot_changed` antes de crear la orden. |
| LEGAL-01 | `/legal/terms`, `/legal/privacy`, `/legal/refunds` (y `package_terms`) EN/ES, con versión, vigencia y responsable/contacto; enlazadas en footer, registro y compra. Los datos del negocio se cargan desde el editor; no se inventan. |
| LEGAL-02 | Aceptación con usuario, versión, idioma, fecha UTC y contexto (`signup`, `checkout`, `update`). Casillas sin premarcar. Privacidad se informa, no se "acepta". Sin consentimiento de marketing mezclado. |
| LEGAL-05 | Borradores con vista previa EN/ES; publicación versionada que bloquea identidad/contacto incompletos o placeholders (`legal_publication_incomplete` con la lista de campos). |
| AC19 | **Parcial**: cursos vendidos en el sitio (fake/Stripe/cupón) quedan con la instantánea vinculada a la orden. **Pendiente explícito:** conciliación entre la evidencia guardada al iniciar el checkout y las órdenes externas de Hotmart (y las rutas de paquetes de W05). |
| AC20 | Limpieza de cuentas de prueba borra snapshots de checkout y aceptaciones; se niega (409) si un comprador real dejó evidencia en un curso de prueba. |
| LEGAL-03/04 | Texto jurídico definitivo y retención: decisión del responsable; el editor solo los publica. |

## Backend (Codex + Claude)

- Migración aditiva `backend/migrations/20261022010000-create-sales-legal.js`: `legal_document_heads`, `legal_documents`, `course_expectations`, `course_checkout_snapshots`. Rollback exige `CONFIRM_SALES_LEGAL_DATA_LOSS=yes` si hay datos. No toca la migración de W00.
- `services/legalDocuments.js`, `routes/legal.routes.js` (rutas de CONTRATO §9.9), `services/salesExpectations.js`, `routes/expectations.routes.js` (`GET`/`PUT /api/courses/:id/expectations`, solo docente dueño, control de `version`), `services/courseCheckoutEvidence.js`.
- `legal_acceptances.acceptedAt` (W00) no guarda milisegundos: se trunca al segundo antes de guardar, para que la fila creada y la leída en una aceptación concurrente coincidan.
- Errores estables: `legal_acceptance_required` (400), `legal_version_changed` (409), `sales_snapshot_changed` (409), `legal_publication_incomplete` (400, `params.fields`), `version_conflict` (409).
- Permiso nuevo `legal.manage` (no implícito en ningún rol; cuentas de prueba e impersonación no publican).

## Frontend (Claude)

`frontend/src/app/features/legal/`: modelo, servicio, catálogo `legal.*`/`sales.*` (registrado con `I18N_CATALOGS` en `app.config.ts`), página pública, casilla de aceptación, vista de expectativas, editor legal `/admin/legal` (guard `legal.manage`) y editor de expectativas `/teacher/course/:id/expectations`.

Superficies compartidas (aditivas): `app.routes.ts`, `app.config.ts`, footer del layout, ítem del menú admin, registro, página de venta, «Mis compras», botón en gestión de curso, `RegisterRequest`/`PublicCourseDetail`/`MyOrder` y un argumento opcional de `PublicCatalogService.checkout`. Backend: `app.js`, `permissions.js`, `models/index.js`, registro, checkout, `paymentService`, historial propio, catálogo público y `adminUsers.deleteTestUsers`. En `/api/me/orders` el campo `commercial` es aditivo (se ajustó la expectativa de `salesManagement.test.js`).

## Contrato para W05

- `salesExpectations.validateExpectations(value)` → objeto EN/ES con los 8 campos, texto plano, sin HTML ni duración de sesión.
- `legalDocuments.currentSet(keys)`, `validateConsent(input, docs, locale)` y `recordAcceptances(userId, docs, { locale, context: 'checkout', contextType: 'class_offer', contextId, transaction })`. `acceptOwn` ya admite `contextType: 'class_offer'` leyendo `offer.snapshot.legalDocuments`.
- Enlace estable a una versión aceptada: `/legal/:documentKey?version=N`.

## Pruebas

- Backend (`npm test`, `--runInBand`, base aislada `DB_NAME_TEST=spanishnow_w02c_jest_test`): **796/796, 45 suites, tras integrar W04**. `legalSales.test.js` 17 casos (incluye concurrencia de aceptación y limpieza AC20).
- Frontend: `ng test` **371/371, 49 archivos** (W02: paridad EN/ES del bundle, página legal y cambio de idioma, casilla sin premarcar, registro, compra con instantánea y 409, historial, editor legal y de expectativas). Build de producción OK (solo advertencias de presupuesto preexistentes).
- **No ejecutado:** recorrido manual en navegador contra un backend real; ningún E2E nuevo.

## Prueba manual (cuentas ficticias)

1. Con un usuario con `legal.manage`, abrir `/admin/legal`, crear un borrador con `[TODO]` y comprobar que publicar lo bloquea con los campos marcados; completar con datos reales y publicar (confirmación en dos pasos).
2. Ver `/legal/terms` en EN y ES; la versión anterior sigue en `?version=N`.
3. Registrar una cuenta ficticia: la casilla aparece sin marcar y es obligatoria.
4. Como docente ficticio, cargar expectativas en «Expectativas de venta» y verlas en `/courses/:slug`. Comprar con `PAYMENTS_FAKE=1`: sin la casilla no avanza; después, «Mis compras» muestra las condiciones aceptadas aunque el docente edite el curso.

Desactivar: revertir los commits de W02; la migración tiene `down` protegido. Sin variables nuevas ni proveedores reales.
