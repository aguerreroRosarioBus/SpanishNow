# Relevo W01 — 22/10/2026

Codex cierra la implementación al entregar ventas/órdenes, por indicación del orquestador para liberar uno de los dos lugares y continuar W06. W01 **no está completo**. No se inició W07/W08/W09 ni se usaron subagentes.

## Entregas listas para revisión de Andrés

Todos los PR son independientes contra main; **los merges corresponden a Andrés**. Base funcional W01 ya mergeada en #28.

| Área | PR | Rama / commit | Validación local |
| --- | --- | --- | --- |
| Alumno: inicio, progreso, compras y docentes | #30 | w01-i18n-alumno / ce0459c | 374 unitarias, 6 E2E, build/tsc |
| Curso público, afiliados y verificación de certificados | #33 | w01-i18n-publico / 72715c6 | 374 unitarias, 4 E2E, build/tsc |
| Administración | #34 | w01-i18n-admin / fd8075e | 373 unitarias, 2 E2E, build/tsc |
| Reproductor y quiz | #35 | w01-i18n-reproductor / 43c61a6 | 373 unitarias, 20 E2E audio, build/tsc |
| Flashcards, matching, escuchar/repetir y modales | #36 | w01-i18n-actividades / b82b692 | 374 unitarias, 6 E2E, build/tsc |
| Comentarios lección/docente y materiales | #38 | w01-i18n-comentarios / 27f2bd0 | 375 unitarias, 2 E2E, build/tsc |
| Ventas, gráfico y órdenes docente | #40 | w01-i18n-comercial-docente / 6e54c40 | 373 unitarias, 4 E2E, build/tsc |

Cada PR incluye SPEC §14.3, límites, reversión y documentación específica W01-*.md. Pruebas con API ficticia/externos bloqueados; no se realizaron cobros, reembolsos, mensajes, correos o descargas reales. Fuente de audio W03 y snapshots/consentimiento W02 preservados. Advertencias conocidas Sass/budgets, sin errores de compilación en las entregas. No hay decisiones nuevas de producto, dinero o tiempo.

## Trabajo parcial guardado (no aplicado)

Rama de relevo **w01-i18n-cupones-afiliados**, desde main **ff1e817** (incluye #39). El frontend de esta rama conserva el código de main; el avance incompleto se guarda como archivos de relevo para no dejar una compilación rota:

- `W01-PROMOCIONES-WIP.patch`: catálogo completo EN/ES propuesto `teacher-promotions.ts`, import/spread EN/ES y template de cupones. SHA-256 `86b0b46448cdde0bc60f83a6ee93a40ebba711c1c8e277c8ca41455c0e7ee687`. `git apply --check` aprobado sobre ff1e817.
- `W01-PROMOCIONES-generador.py.txt`: borrador del generador, traducciones y cambios previstos de TS/afiliados. **No es idempotente ni está validado**. No ejecutar encima del patch aplicado. Se interrumpió en `re.sub` por un replacement con `\d` (línea 217); debe usar una función de reemplazo o escapar correctamente. No se cambió TS ni template de afiliados.
- La prueba del patch aplicado falla en compilación: cupones todavía no importa `TranslatePipe` ni tiene el método `date`. Es un avance WIP, **no un PR entregable**. No se declararon pruebas verdes para el patch.

Para retomar: crear/usar worktree y rama propia, leer #14/#23 y main actualizado; aplicar el patch con comprobación, completar TS de cupones y template/TS de afiliados, revisar manualmente claves/errores/interpolaciones. Preservar forms, comisiones/importes/monedas, fechas calendario frente a instantes, tokens/links, confirmaciones y límites. Agregar pruebas de cambio EN/ES con borradores de cupón/afiliado/pago y confirmaciones abiertas, sin mutaciones reales. No convertir monedas ni cambiar reglas de cupón/atribución/pago.

## Resto pendiente de W01

1. Completar cupones/afiliados del docente (WIP anterior).
2. Dashboard docente y creación/edición de cursos (formularios e imágenes); gestión de unidades/historias, alumnos/importación y modales de contenido.
3. Compositor de lecciones, formularios inline, ilustración/audio/whiteboard, ayudas/tutoriales y compartidos de búsqueda/selección de imágenes. Leer cada componente para separar UI del contenido docente.
4. Auditar interiores históricos de clases en vivo y cualquier otro componente compartido todavía con texto fijo. No tocar el paquete W06 ni sus decisiones temporales.
5. PDF de certificados del backend: `backend/src/services/certificateService.js` sigue en inglés; frontend `CertificateService.pdfUrl` aún no envía locale. Localizar en PR documental separado, conservar identidad/código/instante y verificar render con fixtures. No modificar emisión/elegibilidad por presentación.
6. Inventario final `rg -n 'date:|formatPrice|Intl.DateTimeFormat' frontend/src/app`, cadenas fijas en HTML/TS, validaciones/ARIA/confirmaciones y errores históricos backend sin code. Migrar códigos de forma compatible con `{error}`; no traducir excepciones arbitrarias ni mensajes humanos. I18N integral/AC17 permanecen parciales hasta cubrirlo.
7. Integrar main a cada PR cuando los anteriores se mergeen y resolver **aditivamente** catálogos: cada rama agrega import/spread al mismo inicio EN/ES; conservar todos los bundles. ConfirmDialog y prueba de paridad plural tienen cambios idénticos repetidos en #30/#34/#38; no duplicarlos. Volver a verificar los checks pertinentes y actualizar resultados.

No quedan ediciones funcionales a medio aplicar en el worktree de relevo. Los archivos locales `.codex/` son previos y no se versionan; las dependencias enlazadas temporalmente no se incluyen en commits.

Verificación del estado de relevo: 371/371 pruebas unitarias frontend sobre el código de main, `git diff --check` y `git apply --check` del patch aprobados. El patch WIP permanece como archivo, no participa del build. La última entrega funcional (#40) tiene sus 373 unitarias/4 E2E/build/tsc aprobados.
