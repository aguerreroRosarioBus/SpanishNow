# W01 — Comentarios y materiales EN/ES

I18N-02/03/04/05/06, AC17. Comentarios de lecciones y bandeja docente: formularios, filtros, validaciones, vacíos, reintentos, confirmaciones, avisos y accesibilidad por `lessonComments.*`. Textos/nombres docentes y de alumnos siguen originales, mediante interpolación de texto plano. Fechas en zona de cuenta/dispositivo, sin modificar instante.

Los errores guardan key/código y datos para traducirse sin repetir solicitudes; límites por hora y content_locked mantienen el tratamiento original. Borradores de publicación/respuesta/edición y objeto pendiente de borrado no se reemplazan al cambiar idioma. Descargas conservan el flujo de ventana/link efímero y autorización; tamaños cambian separador, no bytes/unidad. formatFileSize acepta locale opcional manteniendo español por defecto para consumidores aún no migrados.

Superficies compartidas: registro aditivo del catálogo EN/ES. Cancelar de ConfirmDialog usa common.cancel (idéntico a #30/#34). Sin API/esquema/configuración/decisiones nuevas. Sin alteración del contenido del PDF.

Pruebas: 375/375 unitarias, 2/2 E2E docente escritorio/móvil con API interceptada y externos bloqueados; build, tsc E2E y diff check aprobados. Se verifica conservación de borradores/confirmación, escape HTML y tamaños. Sin descargas/proveedores/mensajes/correos reales. Advertencias conocidas Sass/budgets.

Manual ficticio: escribir comentario/respuesta/edición y abrir borrado sin confirmar; alternar idioma y revisar estado, destinatario, fechas y texto humano. En materiales comprobar tamaño y etiqueta de descarga. Revertir commit; no hay datos/migraciones que revertir.
