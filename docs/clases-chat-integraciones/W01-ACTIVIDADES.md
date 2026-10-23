# W01 — Actividades de vocabulario EN/ES

I18N-02/03/05/06 y AC17: flashcards, emparejamiento y escuchar/repetir, en páginas independientes y modales. Instrucciones, metas, resultados, errores, avisos y accesibilidad usan `activities.*`. Las palabras/traducciones, ejemplos y frases del docente se conservan como contenido original, incluida la traducción inglesa del ejercicio.

No cambia el criterio de completado (80%, 3+ estrellas), juego, grabación ni persistencia. Emitir completado desde un efecto se hace sin rastrear las señales que lea el receptor: traducir un toast no convierte el idioma en dependencia que vuelva a emitir completado. Errores locales almacenan claves estables y se traducen de forma reactiva.

Única superficie compartida: registro aditivo del catálogo propio EN/ES. Sin APIs, configuración, migraciones o decisiones nuevas. No se accede al micrófono real en pruebas.

Validación: 374/374 unitarias, incluidas conservación de orden/selección/vistas, no reemisión y referencia de grabación; 6/6 E2E escritorio/móvil con API ficticia y externos bloqueados; build, tsc E2E y diff check verdes. Advertencias Sass/budgets conocidas.

Manual ficticio: voltear tarjeta, seleccionar pareja o calificar frase; alternar idioma sin reiniciar. Verificar que quedan tarjeta/selección/calificación y contenido original. En grabación, idioma no pausa ni reemplaza el medio. Revertir commit sin migraciones/datos.
