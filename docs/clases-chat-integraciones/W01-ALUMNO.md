# W01 · Panel del alumno EN/ES

Entrega de #14, Codex. Base: main 2fd928f con W01/W04/W02; snapshots comerciales/legales de Mis compras preservados. Requisitos I18N-02/03/04/06 y AC17, dentro de dashboard, avance, compras y docentes.

- Catálogo `student.*` en `core/i18n/catalogs/student.ts`, con las mismas claves/parámetros EN/ES y plurales exactos para cero. Los catálogos base solo lo agregan; no se modifican claves ajenas.
- Formularios de certificado y confirmaciones guardan datos/claves, no frases traducidas. Cambiar idioma conserva el nombre escrito, el progreso y la acción pendiente; no emite ni reinicia nada.
- Compras mantiene estado comercial, importe y moneda; solo localiza etiquetas y formato, con código de moneda explícito. Fechas: zona de preferencias o del dispositivo como fallback de presentación; no la confirma ni la persiste. No cambia el instante.
- Errores guardados en crudo y renderizados por código conocido o fallback de catálogo; no se interpretan mensajes arbitrarios del backend. Reintentos conservan el comportamiento existente.
- Nombres propios, títulos de cursos/historias/unidades, códigos de certificado/cupón y datos del docente permanecen originales.

Superficies compartidas: adición de `student.*` a los catálogos base; etiqueta Cancelar del diálogo compartido con la clave existente `common.cancel`; tarjeta del curso siguiente con las claves del alumno. No cambia rutas, permisos, APIs, reglas de progreso, precios, preferencias, schema o proveedores. Sin configuración nueva ni decisiones de producto.

## Validación

Validación del área: 374/374 unitarias frontend, 6/6 E2E en escritorio/móvil, build de producción, TypeScript E2E y diff check aprobados. Ver el PR para la regresión contra main actualizado. Las pruebas unitarias y E2E comprueban confirmación pendiente, borrador de certificado, filtros, datos originales, reembolso parcial, moneda e instante cerca del cambio de fecha. E2E: `cd e2e && npx playwright test --config playwright.student-i18n.config.ts`, API ficticia sin backend/DB/proveedores. Frontend: `cd frontend && npm test -- --watch=false` y `npm run build`.

## Prueba manual y reversión

Con una cuenta ficticia: explorar cursos con filtro, alternar idioma, abrir Mi avance e iniciar el formulario de certificado sin enviarlo, cambiar idioma conservando el nombre. Revisar Mis compras en ambos idiomas, con moneda y fecha de la misma compra; abrir Docentes y comprobar nombres originales. Abrir/cancelar confirmación de reinicio; ninguna acción ocurre al traducir.

Revertir el PR retira solo esta migración de textos/formatos; conserva base I18N, chat, cuentas y progreso. Pendientes de W01: reproductor/actividades, áreas del docente, administración, páginas públicas restantes y errores/formatos históricos de otras áreas. El merge lo hace Andrés.
