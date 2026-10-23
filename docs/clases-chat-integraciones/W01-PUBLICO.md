# W01 — Curso público, afiliados y verificación de certificados

Entrega incremental de I18N-02/03/04/05/06 y AC17; no cierra W01.

- Catálogo `public.ts`: `publicCourse.*`, `affiliate.*`, `certificate.*` y cuatro códigos de cupón existentes. Registro aditivo mínimo en catálogos base EN/ES (superficie compartida).
- Precio/moneda y contadores reactivos. Se conservan cupones, email, enlace de atribución y aceptación/hash/versiones comerciales de W02. No se recrean componentes al alternar idioma.
- Errores de cupón/checkout se guardan como datos y se traducen al leerlos; no se muestran excepciones arbitrarias. Se conserva el tratamiento W02 de instantánea/versión cambiada: refrescar condiciones y volver a aceptar.
- Afiliados: nombres, códigos, enlaces, notas y datos económicos originales. Fechas instantáneas en zona de cuenta/dispositivo, independientemente del idioma; fechas calendario YYYY-MM-DD se presentan sin corrimiento de día. Sin cambios de cálculo o persistencia.
- Certificados: verificación pública traducida, misma identidad, código e instante. Esta entrega no cambia el PDF del backend, que se localizará en una entrega de documentos. El checkout alojado por Hotmart conserva su propia selección de idioma.

Pruebas: 374/374 unitarias de frontend (incluidas regresiones W02), 4/4 E2E escritorio/móvil con API interceptada y proveedores externos bloqueados, build producción, TypeScript E2E y `git diff --check` verdes. Advertencias conocidas de Sass/budgets, sin errores de compilación. Sin cambios de API/esquema/autorización ni servicios externos.

Prueba manual con datos ficticios: abrir curso con precio y cupón inválido, escribir cupón/email y cambiar EN/ES; verificar que cambian las etiquetas y el error, no valores ni solicitudes. Alternar en panel de afiliado y certificado, verificar importes ISO, fecha y datos originales. Revertir el commit del PR restaura las tres vistas y quita su registro de catálogo; no hay migraciones ni datos que revertir.
