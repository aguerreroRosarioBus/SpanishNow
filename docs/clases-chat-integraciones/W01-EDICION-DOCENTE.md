# W01 — Edición docente, clases en vivo, PDF de certificados y auditoría final

Cierra W01 (#14). Mismo patrón que `W01-PROMOCIONES.md`: catálogo por prefijo propio, registro aditivo en `catalogs/en.ts` y `es.ts`, pipe `t`, helpers de fecha/importe, errores guardados como clave + error y traducidos por `code` al leer (cambiar de idioma no repite peticiones ni pierde borradores).

| Área | Catálogo / prefijo | Claves por idioma |
| --- | --- | --- |
| Dashboard docente, `unit-card`, `unit-list`, students-panel, diálogos de live-room | `teacher-dashboard.ts` / `teacherDashboard.*` | 145 |
| Gestión de cursos y modales (curso, unidad, historia, materiales, vocabulario, quiz, preguntas, audio) | `teacher-manage.ts` / `teacherManage.*` | 341 |
| Compositor de lecciones, pizarra, editores compartidos (tooltip, image-search) | `teacher-composer.ts` / `teacherComposer.*` | 355 |
| Clases en vivo y pizarra (lista, sala, tablero) | `live-board.ts` / `liveBoard.*` | 212 |

## PDF de certificados (backend)
`GET /api/public/certificates/:code/pdf` es público (sin sesión). Idioma, con el orden de W01: `?lang=en|es` explícito → `locale` de la cuenta del titular del certificado → `Accept-Language` → inglés. El frontend envía `?lang=` con el idioma que el usuario ve. La fecha se muestra como día de calendario UTC (no se corre por zona). Respuesta con `Vary: Accept-Language`. Pruebas en `backend/tests/certificates.test.js`.

## Auditoría final
- Ningún `toLocaleString`/`toLocaleDateString`/`DatePipe`/`CurrencyPipe` con formato fijo fuera de los helpers (`I18nService`, `formatPrice`/`formatFileSize` reciben locale). Se eliminó código muerto en español (`availableOnLabel`, `releaseRuleLabel`).
- `PwaStatusComponent` y los textos por defecto de `ConfirmDialog` ahora salen del catálogo.
- Paridad EN=ES sin duplicados verificada por especificación en cada catálogo nuevo.

## Límites conocidos
- Contenido docente y de usuario (títulos, historias, notas de la pizarra, nombres) no se traduce (I18N-02/05).
- Los textos de ejemplo del compositor y los placeholders que son contenido en español (`¿Cómo te llamas?`, `casa`) se mantienen.
- Rutas de cursos/alumnos del backend aún no envían `code`: el frontend muestra el mensaje genérico traducido de cada acción. Motivos de importación de alumnos sin `code`: tres conocidos traducidos, el resto genérico.
- Atajos de la pizarra (P, M, E, L, R, O) no cambian con el idioma.
- `class-time.ts` conserva mensajes técnicos en español en `TimeError`; la UI traduce por `code`.
