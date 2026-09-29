# Conversión de historias a lecciones TPRS

## Estado del piloto

El contenido canónico de «María en la Fiesta» y «El Primer Día de Clase» procede de `seeds/complete_course_seed.sql`. La prueba S4 se realizó solo en `spanishnow_tprs_test`: historia 1, revisión 4, plan 7; historia 2, revisión 2, plan 8. La primera presenta `Me llamo` y `Mucho gusto` antes de narrar. Sus tres keyframes y pausas son:

`seeds/tprs_pilot_plan.json` conserva la selección editorial por títulos y palabras. No contiene IDs del fixture ni se ejecuta como seed. Para reproducirla, buscar la historia y sus preguntas por título, buscar o crear una sola ficha por expresión en la unidad, abrir `GET /api/lesson-plans/story/:id/draft` con la cuenta docente propietaria, generar un UUID para cada bloque, guardar la secuencia del JSON con `PUT .../draft` y publicar con `POST .../publish`. La publicación prepara un borrador de «El Primer Día de Clase» con `Me llamo` en `before`; revisar ese borrador, mantener el mismo `vocabularyId` y publicarlo. No ejecutar `complete_course_seed.sql` sobre un curso ya editado: sus `ON DUPLICATE KEY UPDATE` de historias sobrescribirían texto.

1. «María va a una fiesta. En la fiesta hay muchas personas.» → «¿Dónde está María?».
2. «María ve a Juan. María dice: “Hola, ¿cómo te llamas?”. Juan responde: “Me llamo Juan, ¿y tú?”.» → «¿Cómo se llama el amigo de María?».
3. «María dice: “Yo me llamo María, mucho gusto”. Juan y María son amigos ahora.»

En «Más adelante», la revisión 4 programa `Me llamo` para «El Primer Día de Clase». Su borrador recibió automáticamente la asociación `revisit` en fase `before` y se publicó como revisión 2. Ambas lecciones usan la misma ficha de vocabulario. La base QA estaba vacía de vocabulario; se crearon allí las fichas de `Me llamo` (ID 17) y `Mucho gusto` (ID 18) una sola vez. Las revisiones asignadas a los alumnos anteriores conservaron sus `planId`.

## Procedimiento de conversión para datos existentes

1. Inventariar `stories`, `questions`, `vocabulary`, `activity_configs`, `tooltips`, `progress` y asignaciones actuales. La migración `20260926000000-convert-activity-configs-to-story.js` convierte cada configuración por unidad en una configuración para cada historia de esa unidad. Si ya existe una configuración de esa actividad en una historia, prevalece la configuración específica de esa historia y se informa el conflicto. Las filas de una unidad sin historias detienen la migración antes de alterar la tabla. La conversión es irreversible sin restaurar el respaldo previo. **No ejecutar** `migrations/change_activity_configs_to_story_level.sql`, que borra datos y usa IDs fijos.

**Instalación nueva:** `migrations/20260115131716-create-activity-config.js` crea temporalmente `unitId`; `20260926000000-convert-activity-configs-to-story.js` lo elimina y deja `storyId` como vínculo vigente, expandiendo la configuración a las historias de cada unidad. `npm run db:migrate:tprs:test` aplica esta conversión antes de crear planes. `npm run db:init` usa `sequelize.sync({ alter: true })` y no sustituye una migración de producción.
2. Hacer una copia completa y comprobable de la base, incluidos `Story.text`, URL de audio, tooltips y progreso. Guardar también el esquema y el número de filas por tabla. Mantener la copia fuera del repositorio. Probar la restauración en una base separada antes de tocar datos reales.
3. Restaurar la copia en una base MySQL aislada y definir `DB_NAME_TEST` con un nombre distinto de `DB_NAME`, por ejemplo `spanishnow_tprs_test`. Desde `backend/`, ejecutar `DB_NAME_TEST=spanishnow_tprs_test npm run db:migrate:tprs:test`. Este comando se niega a trabajar sin un nombre de prueba explícito. Validar los recuentos: una revisión publicada por historia inicial, un keyframe y un bloque de lectura completa por historia, preguntas antiguas en `after`, refuerzos habilitados conservados cuando existen configuraciones por historia.
4. Curar una historia desde el editor: separar keyframes, elegir las pausas de las preguntas y publicar una nueva revisión. La API deriva `Story.text` de los keyframes activos y copia las preguntas, expresiones y URL de audio en la publicación. Los alumnos con `LessonProgress.planId` siguen en su revisión anterior. Publicar una historia futura después de programar una reaparición; la programación crea un borrador, no publica silenciosamente.
5. Migrar las demás historias de forma gradual. Mientras no se curen, la revisión inicial de un keyframe, lectura completa y preguntas posteriores es legible. No deducir pausas a partir del texto antiguo. Revisar manualmente las preguntas y el contenido antes de moverlas a fase `during`.

## Recuperación

MySQL confirma DDL de forma implícita. La migración S1 puede retomarse si se interrumpe: omite historias que ya tienen plan. Si hay que deshacer una ejecución sobre datos reales, detener escrituras y restaurar la copia completa en una base nueva, comprobar recuentos y asignaciones y cambiar la conexión solo tras validarla. El `down` de la migración elimina tablas `lesson_*` y exige `CONFIRM_LESSON_PLAN_DATA_LOSS=yes`; usarlo solo después de exportar y aceptar la pérdida de progreso nuevo. Restaurar únicamente el esquema no recupera `Story.text`, tooltips ni revisiones publicadas.

## Compatibilidad de audio y tooltips

- El audio completo lento/normal se copia a cada revisión publicada y se ofrece en `full_story`. El audio opcional del keyframe se reproduce desde su `audioUrl`. Las historias del fixture QA no tenían URL, por lo que se verificó el cableado y el build, **no** la reproducción de un archivo real.
- Los tooltips antiguos tienen desplazamientos referidos al texto completo. Al publicar, el servidor desactiva los que ya no coinciden con `Story.text`; el lector descarta además cualquier desplazamiento que no coincida exactamente con el texto de la revisión mostrada. Esto mantiene el uso seguro en la lectura completa, incluso para alumnos fijados a revisiones antiguas.
- El modo guiado no traslada automáticamente los desplazamientos de la historia completa a los keyframes. Para asociar un tooltip a un keyframe, debe guardarse una referencia estable al `blockKey`, desplazamientos relativos a ese fragmento y el texto seleccionado validado. Hasta disponer de ese dato, los tooltips se muestran en la lectura completa.

## Semillas heredadas

`seeds/complete_course_seed.sql` y `seeds/activity_configs_seed.sql` insertan configuraciones por `storyId` con `INSERT IGNORE`, sin borrar la configuración de una profesora. Los archivos de verificación en `seeds/` unen actividades con historias mediante `storyId`. Estas semillas no se ejecutaron en S4. `Dump20260122.sql` es una captura histórica y `migrations/change_activity_configs_to_story_level.sql` es la migración destructiva antigua; sus referencias a `unitId` se conservan como archivo histórico, no como instrucciones de despliegue.
