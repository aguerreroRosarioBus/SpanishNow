# Contenido del curso de prueba

Datos que lee `npm run db:seed:trial` (ver `backend/docs/database.md`, sección «Curso de prueba»). La fuente de los textos es `docs/curso-prueba/PLAN.md`.

- `course.json`: curso, unidad y las 9 estructuras del vocabulario.
- `stories/NN-*.json`: una historia con sus preguntas y su `plan`; cada keyframe lleva `glosses` (`{ "text", "gloss" }`).
- `quiz.json`: cuestionario final. `material.json`: texto del PDF «How TPRS works».
- `audio/`: mp3 con voz sintética, generados con `node scripts/trial-audio.js` (un archivo por keyframe y por estructura).
- `images/`: ilustraciones `h<historia>-k<n>.png|webp` y `alt.json` (las entrega W27; la semilla las omite mientras no existan).

Sin ids: la semilla identifica las filas por clave natural (slug, orden, palabra, título, texto).
