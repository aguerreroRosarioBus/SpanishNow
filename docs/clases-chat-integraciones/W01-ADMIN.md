# W01 — Administración EN/ES

I18N-02/03/04/05/06, AC17. Sin decisiones nuevas ni cambios de autorización.

Usuarios, filtros, formularios, validaciones, confirmaciones, toasts, vacíos y accesibilidad usan `adminUsers.*`. Metadatos propios de permisos se traducen por `key` estable; una clave futura conserva el texto recibido y marca `[ES]` en inglés. Roles, permisos y datos humanos conservan sus valores. Fechas se presentan en la zona de cuenta/dispositivo, independiente del idioma.

Las acciones pendientes guardan keys y parámetros, no traducciones: EN/ES no ejecuta, cancela ni reemplaza la acción. Errores de carga se conservan como datos para cambiar su texto sin repetir requests; nunca se expone texto arbitrario del backend. Solicitudes, reintentos y medidas de protección de usuarios reales/fijos no cambian.

Superficies compartidas: import/spread aditivo de catálogo `admin.ts`; Cancelar de ConfirmDialog usa `common.cancel` (idéntico a PR #30). La prueba de paridad compara parámetros de la misma variante plural EN/ES (idéntico a #30). Sin migraciones/configuración/API nuevas.

Validación: 373/373 unitarias, 2/2 E2E escritorio/móvil interceptando toda API y bloqueando proveedores, build producción, tsc E2E y diff check aprobados. Ninguna cuenta real se consultó/modificó. Se mantienen advertencias conocidas de Sass/budgets.

Manual: con administrador ficticio, escribir nombre/filtro y abrir Suspender; alternar idioma y revisar que conserva valores y destinatario sin ejecutar. Cancelar. Repetir con borrar cuenta/todas sin confirmar. Revertir commit del PR; sin datos/migraciones que revertir.
