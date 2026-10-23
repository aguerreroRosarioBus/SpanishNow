# W01 — Reproductor y quiz EN/ES

I18N-02/03/04/05/06 y AC17, sin cambios de reglas de avance/acceso ni decisiones nuevas.

Se localizan índice, bienvenida, pantalla bloqueada, pasos, bloques narrativos, ayudas, refuerzos, resultados/validaciones del quiz y accesibilidad de ilustraciones. Los nombres, textos, audios, preguntas/opciones y explicaciones docentes permanecen originales. El catálogo `player.*` se registra por import/spread aditivo en EN/ES (única superficie compartida).

Errores guardan código/dato y fallback estable, traducidos al mostrarse. No se exponen excepciones arbitrarias. Las cargas siguen dependiendo solo de storyId/unitId y se ejecutan sin rastrear dependencias del idioma; por eso no se recargan lecciones ni se resetean respuestas/progreso/audio al alternar. Fechas de disponibilidad conservan instante/zona y solo cambian presentación. Sin contratos/esquema/configuración nuevos.

Validación: 373/373 unitarias frontend; 20/20 E2E de audio/escritorio/táctil con medios reales locales, API ficticia y red externa bloqueada; build producción, tsc E2E y diff check aprobados. Fixtures de audio actualizadas para endpoints `/features` y contador de chat de W04. Ningún proveedor, usuario o correo real. Advertencias Sass/budgets conocidas.

Manual: escribir una respuesta de comprensión o seleccionar opción del quiz; alternar EN/ES y verificar contenido original, selección y paso. Reproducir audio con A/B activo y alternar: conserva archivo, posición y límites sin completar narrativa. Revertir commit, sin migraciones/datos que revertir.

Entrega siguiente: interiores de actividades flashcards/matching/listen-repeat y compartidos de materiales/comentarios. No se declara W01 completo.
