# Contenido curado del curso

Datos que lee `npm run db:seed:curated` (ver `backend/docs/database.md`, sección «Semillas curadas»).

- `course.json`: curso, unidades y vocabulario.
- `stories/NN-titulo.json`: una historia con sus preguntas y, opcionalmente, su `plan` TPRS (expresiones previas, keyframes con preguntas, bloques finales y reapariciones). Editar un archivo y volver a ejecutar la semilla es todo el flujo; con `--force-plans` se publica el plan como revisión nueva aunque la anterior se haya editado en la app.

Los textos deben estar en UTF-8 normalizado (NFC) y sin mojibake: la semilla y `npm run db:verify` los rechazan.
