# Fase 2: cargar el curso de Hotmart tal cual

Objetivo: que un curso como "Learn Spanish with a Short Film (PART 1)" (bienvenida en video + 3 módulos × 5 lecciones, quiz al final de cada módulo, PDFs descargables y certificado) se pueda armar en SpanishNow sin perder nada.

Equivalencias: módulo de Hotmart = unidad; lección = historia (con su lección TPRS); quiz de módulo = quiz de unidad (nuevo); PDF = material (nuevo); certificado de finalización (nuevo).

## Decisiones

- **Video: no lo alojamos.** El docente pega un link de YouTube (no listado), Vimeo o Bunny Stream y se incrusta. El backend valida el dominio y lo normaliza a la URL de embed (`youtube-nocookie.com/embed/ID`, `player.vimeo.com/video/ID`, `iframe.mediadelivery.net/embed/LIB/ID`). Cualquier otro dominio: 400.
- **Video por historia** (`stories.videoUrl`) se muestra arriba de la lección en el reproductor, antes de la narración. **Video de bienvenida del curso** (`courses.introVideoUrl`) se muestra en la página de venta (sirve de preview) y como primer ítem del reproductor.
- **PDFs: solo alumnos con acceso.** El link real nunca sale en endpoints públicos. La descarga pasa por `GET /api/materials/:id/download-url`, que verifica acceso y devuelve un link de vencimiento corto (en Cloudinary con URL firmada de vencimiento corto si se puede; en local con `MEDIA_FAKE_UPLOADS=1` al archivo de `uploads-dev`). Solo PDF, máx. 20 MB, validado por firma `%PDF-`.
- **Quiz de unidad:** opción múltiple, intentos ilimitados, cuenta el mejor puntaje, aprobado con `passingScore` (70 % por defecto). La respuesta correcta nunca se manda al alumno antes de que envíe el intento; después se le devuelve qué acertó y la explicación.
- **Certificado:** se habilita cuando el alumno completó la narración de todas las historias con lección publicada del curso y aprobó todos los quizzes de unidad publicados. Es un PDF en inglés generado en el servidor (`pdfkit`), con un código único verificable en una página pública.
- Las pantallas del alumno y públicas siguen en inglés donde ya lo están (venta, verificación de certificado, PDF del certificado); el reproductor y el dashboard del alumno siguen en el idioma actual de la app (español). Docente en español.

## Modelo de datos (migraciones idempotentes, estilo de las existentes)

- `courses.introVideoUrl` STRING(500) nullable
- `stories.videoUrl` STRING(500) nullable
- `materials`: `id`, `courseId` (FK, NOT NULL), `unitId` (FK nullable), `storyId` (FK nullable), `title` STRING(200), `fileUrl` STRING(500), `providerPublicId` STRING(300) nullable, `sizeBytes` INTEGER, `order` INTEGER default 0, timestamps. Un material es del curso, de una unidad o de una historia (a lo sumo uno de `unitId`/`storyId`).
- `unit_quizzes`: `id`, `unitId` (FK, único), `title`, `passingScore` INTEGER default 70, `isPublished` BOOLEAN default false, timestamps.
- `unit_quiz_questions`: `id`, `quizId` (FK, cascade), `order`, `prompt` TEXT, `options` JSON (array de 2 a 6 strings), `correctIndex` INTEGER, `explanation` TEXT nullable, timestamps.
- `unit_quiz_attempts`: `id`, `quizId` (FK), `enrollmentId` (FK, cascade), `answers` JSON (array de índices), `score` INTEGER (0–100), `passed` BOOLEAN, timestamps.
- `certificates`: `id`, `enrollmentId` (FK, único), `code` STRING(16) único (aleatorio, sin caracteres ambiguos), `studentName`, `courseTitle`, `teacherName` (copias al momento de emitir), `issuedAt`, timestamps.
- Quitar acceso / reset de progreso de una inscripción también borra sus intentos de quiz (el certificado ya emitido se conserva sólo si la inscripción sigue existiendo; al borrar la inscripción se borra).

## API

Docente (dueño del curso):
- `PUT /courses/:id` acepta `introVideoUrl` (string o null). `PUT /stories/:id` acepta `videoUrl`. Respuesta con la URL normalizada; 400 `{ error }` si no es de un proveedor admitido.
- `GET /courses/:id/materials` → todos los materiales del curso (con `unitId`, `storyId`, `title`, `sizeBytes`, `order`).
- `POST /courses/:id/materials` multipart `file` + `title` + `unitId?` + `storyId?` → 201. `PUT /materials/:id` `{ title?, order? }`. `DELETE /materials/:id` → 204 (borra también el archivo en el proveedor si se puede).
- `GET /units/:id/quiz` → el quiz completo con respuestas correctas (o 404 si no hay). `PUT /units/:id/quiz` `{ title, passingScore, isPublished, questions: [{ id?, prompt, options, correctIndex, explanation? }] }` crea o reemplaza (las preguntas se sincronizan por `id`). Validar: 1 a 50 preguntas, 2 a 6 opciones no vacías, `correctIndex` dentro de rango, `passingScore` 1–100. `DELETE /units/:id/quiz` → 204.

Alumno (inscripto) o docente dueño:
- `GET /materials/:id/download-url` → `{ url, filename }`: URL de descarga de vencimiento corto (Cloudinary firmada, ~5 min; en local la ruta de `uploads-dev`). 401/403 como el resto de lecturas protegidas. El frontend la pide con el token y abre `url` en una pestaña nueva.
- La respuesta que usa hoy el reproductor para armar la navegación (`GET /courses/:id` y/o el progreso de inscripción) suma: `introVideoUrl`, `videoUrl` por historia, `materials` por curso/unidad/historia **sin** `fileUrl` (solo `id`, `title`, `sizeBytes`), y por unidad `quiz: { id, title, questionCount, passingScore } | null` solo si está publicado.

Alumno:
- `GET /units/:id/quiz/student` → `{ id, title, passingScore, questions: [{ id, prompt, options }], bestAttempt: { score, passed } | null }`. 404 si no hay quiz publicado.
- `POST /units/:id/quiz/attempts` `{ answers: number[] }` (una por pregunta, en orden) → `{ score, passed, bestScore, results: [{ questionId, correct, correctIndex, explanation }] }`.
- `GET /enrollments/:id/progress` suma `quizzes: [{ unitId, quizId, bestScore, passed }]` y `certificate: { eligible, code | null, missing: { stories: n, quizzes: n } }`.
- `POST /enrollments/:id/certificate` `{ name? }` → emite (idempotente: si ya existe la devuelve). 409 `{ error, missing }` si no es elegible. `name` permite corregir el nombre que aparece (máx. 100, por defecto `user.name`).

Público:
- `GET /public/certificates/:code` → `{ code, studentName, courseTitle, teacherName, issuedAt }` o 404.
- `GET /public/certificates/:code/pdf` → `application/pdf` (A4 apaisado, en inglés: "Certificate of Completion", nombre, curso, "taught by", fecha, código y URL de verificación `FRONTEND_URL/certificates/:code`). Usar los colores de la marca (vino `#3d1420`, coral `#e8573a`, fondo crema).
- `GET /public/courses/:slug` suma `introVideoUrl` y por historia un `hasVideo` booleano; por unidad `hasQuiz`; y `materialsCount`. Nunca URLs de materiales.

## Frontend

Docente (español):
- Modal de edición de curso: campo "Video de bienvenida (YouTube, Vimeo o Bunny)" con vista previa incrustada.
- Modal de edición de historia: campo "Video de la lección" con vista previa.
- En cada unidad (menú de acciones de la unidad o botones en la tarjeta): "Materiales" (lista, subir PDF con título, renombrar, borrar, y a qué historia pertenece o a la unidad) y "Quiz de la unidad" (editor: título, puntaje para aprobar, publicado, lista de preguntas con opciones, marcar la correcta, explicación, agregar/quitar/reordenar preguntas).
- Materiales generales del curso: sección en la pestaña "Contenido" o en el modal de curso.
- Indicadores en la tarjeta de unidad e historia: ícono de video, cantidad de PDFs, "Quiz" publicado/borrador.

Alumno:
- Reproductor: el video de bienvenida como primer ítem de la barra lateral; en cada historia, el video incrustado (iframe responsive 16:9, `allow="fullscreen; picture-in-picture"`, `loading="lazy"`) arriba de la lección; la lista de materiales de la historia y de la unidad con botón de descarga (pide `/api/materials/:id/download-url` y abre el `url` devuelto en una pestaña nueva); al final de cada unidad, ítem "Quiz" con su pantalla: preguntas, enviar, resultado con correctas/incorrectas y explicaciones, reintentar.
- Progreso/dashboard: en cada curso, estado del certificado ("Faltan N lecciones y M quizzes" o botón "Obtener certificado" → confirma el nombre → emite → descarga el PDF y muestra el link de verificación).
- Público (inglés): `/certificates/:code` muestra si es válido con los datos y botón para descargar el PDF. La página de venta muestra el video de bienvenida (si hay) en lugar de la portada vacía, y en el índice un ícono de video/quiz por ítem y "N downloadable PDFs".

## Seed y pruebas

- El seed curado agrega al curso demo: un video de bienvenida (YouTube público de ejemplo), video en 2 historias, 1 PDF de prueba generado en el seed (con `MEDIA_FAKE_UPLOADS`), y un quiz publicado de 3 preguntas en la unidad 1. Solo al crear; nunca pisa datos existentes.
- Tests jest: normalización de URLs de video (válidas e inválidas), acceso a descarga (401/403/200), CRUD de materiales solo del dueño, el quiz no filtra `correctIndex` al alumno, puntaje y mejor intento, elegibilidad y emisión idempotente del certificado, verificación pública y PDF (`%PDF-` y content-type).

## Fuera de esta fase
Hosting propio de video, progreso de visualización del video, descarga sin conexión, firmas personalizadas en el certificado, preguntas abiertas en el quiz.
