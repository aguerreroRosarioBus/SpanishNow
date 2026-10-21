# SQL archivado (solo referencia histórica)

Estos archivos **NO se ejecutan** y no forman parte de ningún flujo de despliegue, seed ni test. Se conservan únicamente como historial de cómo evolucionó la base antes de pasar a las migraciones de Sequelize (`backend/migrations/*.js`) y al flujo TPRS (`lesson_*`).

Son peligrosos de correr hoy: asumen un esquema que ya no existe (tablas `activity_configs` por unidad, `progress`, `question_responses`, columnas de actividad en `enrollments`, que la migración `20261022000000-drop-legacy-progress.js` elimina), usan IDs fijos y varios borran o reescriben preguntas, textos y asignaciones de contenido real. No los uses contra una base con datos.

| Archivo | Qué era |
|---|---|
| `add_activity_config_system.sql`, `change_activity_configs_to_story_level.sql`, `complete_tprs_activities_system.sql` | Creación y paso a nivel historia de `activity_configs` (reemplazado por las migraciones JS y los bloques de refuerzo de `lesson_blocks`). |
| `add_granular_progress_tracking.sql`, `add_question_responses_table.sql` | Progreso viejo (`progress` granular y `question_responses`), reemplazado por `lesson_progress`/`lesson_answers`/`lesson_reinforcements`. |
| `add_audio_to_questions.sql`, `add_open_ended_question_type.sql`, `add_vocabulary_enrichment_fields.sql`, `fix_correct_answer_not_null.sql` | Cambios de esquema sueltos previos a las migraciones JS. |
| `seed_example_course.sql`, `activity_configs_seed.sql` | Semillas viejas de curso de ejemplo y de configuración de actividades. |
| `fix_all_assignments.sql`, `fix_questions.sql`, `fix_questions_encoding.sql`, `fix_story_texts.sql`, `recreate_questions_clean.sql`, `update_story_orders.sql` | Parches puntuales de datos (borran/reescriben preguntas, textos y orden de historias). |
| `verify_complete_structure.sql`, `verify_navigation.sql` | Consultas de verificación del esquema viejo. |

Vigentes (no archivados): `backend/migrations/*.js`, `backend/seeds/complete_course_seed.sql` (contenido canónico de los cursos de ejemplo, sin datos de progreso), `backend/seeds/tprs_pilot_plan.json`, `backend/seeds/local-test-accounts.json` y `backend/Dump20260122.sql` (lo usa `tests/globalSetup.js` y es el origen del esquema base que hoy reproduce `migrations/20260101000000-baseline-schema.js`; el contenido de semilla vigente está en `backend/seeds/content/*.json`).
