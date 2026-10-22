# W05 — Entrega 1: catálogo versionado

Rama `w05-catalogo-ofertas`, base main `2fd928f`. Implementación: Codex. Refs #18.

## Alcance

PACK-01–05, parte de PACK-03/AC19 y AC21. Importación explícita e idempotente de las seis variantes de SPEC §3, sin asignación automática a docentes nuevos. Se crean borradores sin Hotmart ni expectativas inventadas; la nueva configuración docente queda sin habilitar y con ventas pausadas. La importación no pisa configuración o versiones existentes.

API de catálogo, configuración docente, habilitación por capacidad y políticas versionadas de CONTRATO §9.3. La edición inserta una nueva versión y conserva las anteriores. Activar exige Hotmart completo y expectativas EN/ES completas de W02. Solo el dueño o `class_packages.manage_all` gestionan el catálogo. Habilitar docentes exige `class_teachers.manage` y deja auditoría. Impersonación rechazada. IDs ajenos dan 404.

Pantalla `/teacher/class-packages`: importa, edita ambas traducciones, condiciones estructuradas, importe entero/moneda, duración/vigencia, mapeo Hotmart, activa/pausa/archiva y pausa ventas. Menú visible con `FEATURE_CLASS_PACKAGES=1`. No se mueve saldo ni se modifica agenda.

## Contratos y superficies compartidas

Adición: `POST /api/teacher/class-packages/import-initial` (200, repetible; `?teacherId=` solo con capacidad global). CONTRATO pasa a 1.3.1; cambiar estado exige `{status, version}` y rechaza una pestaña comercial obsoleta; consumidores W06 sin cambios. Códigos nuevos `hotmart_product_conflict` y `template_key_conflict`.

Superficies compartidas: registro aditivo en `backend/src/app.js`; ruta lazy en `frontend/src/app/app.routes.ts`; bundle propio `packages.*` registrado en `app.config.ts`; ítem de menú condicionado en `sidebar-nav.component.ts`. Validación mínima de producto paquete/curso en `hotmartService.parseCourseFields`. Migración aditiva `20261022180000-create-hotmart-product-locks.js` y servicio de cerrojo compartido; el PUT de cursos repite validación y escritura en la misma transacción después de subir imágenes. Sin permisos nuevos ni cambios al ledger de W00.

## Validación

- Backend: **36/36 aprobadas**, `classCatalog.test.js`, `legalSales.test.js`, `hotmart.test.js`, MySQL local en base exclusiva `spanishnow_w05_jest_test` (evita interferir con W06).
- Frontend: `ng test --watch=false --include='**/packages.spec.ts'`, 2 pruebas de idioma/borrador/dinero y envío versionado sin doble clic.
- Build de producción: **aprobado**, `npm run build` (necesita acceso a las fuentes públicas de Google ya usadas por la app).
- `git diff --check`.

La API se prueba con cuentas ficticias creadas por la suite, sin proveedor, cobros ni correos externos. No se verificó sandbox real de Hotmart; el precio del producto remoto debe coincidir con el configurado antes de habilitar ventas. El editor no comprueba el precio remoto. La exclusividad de producto entre cursos y paquetes se serializa por producto hasta confirmar la escritura. Incluye regresiones con una subida de imagen demorada y escrituras concurrentes.

## Prueba manual y desactivación

1. En un entorno local aislado, activar `FEATURE_CLASS_PACKAGES=1`; ingresar como docente ficticio y abrir `/teacher/class-packages`.
2. Importar dos veces: aparecen exactamente las seis opciones, en borrador; ventas pausadas. Un docente distinto no las recibe.
3. Editar la variante 4×50, completar EN/ES y vínculo ficticio `https://pay.hotmart.com/...`. Guardar: sube la versión. Otra pestaña con la versión vieja recibe conflicto sin pisar cambios.
4. Activar requiere condiciones completas; reanudar ventas no habilita al docente por sí solo. Un administrador con capacidad puede habilitarlo por la API. Consultar el catálogo público y pausar ventas: deja de ofrecer paquetes.
5. Cambiar idioma con un borrador abierto: se conservan formulario, precio y moneda.
6. Desactivar con `FEATURE_CLASS_PACKAGES=0`; no borra versiones ni configuración. No se necesita rollback de base para desactivar; la tabla técnica de cerrojos puede permanecer.

## Pendientes del paquete

Ofertas/chat/snapshots y vencimiento; checkout/conciliación fake Hotmart; compras, grupos, pausa y renovación. P01 bloquea la definición de reembolso parcial solicitado por la escuela; no se inventó política. AC02/03/09–14/19 completo y AC22 todavía no se declaran satisfechos.

## Revisión de #32

Correcciones de P2 en exclusividad Hotmart y activación de condiciones obsoletas: backend pertinente **56/56** (catálogo, tres regresiones de revisión, Hotmart, imágenes, legal y migraciones); frontend **3/3**; build producción y diff-check aprobados. La migración de mutex fue comprobada desde base vacía y por upgrade desde dump, con rollback/up equivalentes. Los endpoints de curso sin cambios Hotmart conservan su camino anterior.
