# Base de datos: migraciones, semillas y reconstrucción

Motor: MySQL 8+ (probado en 9.6 local), ORM Sequelize 6, runner de migraciones `umzug` 3. El historial se guarda en la tabla `SequelizeMeta` con el nombre del archivo como clave, igual que `sequelize-cli`.

| Qué | Dónde |
| --- | --- |
| Migraciones (`up(queryInterface, Sequelize)` / `down`) | `migrations/*.js` |
| Runner (biblioteca) y CLI | `src/db/migrator.js`, `src/db/migrate.js` |
| Detectores de `adopt` | `src/db/adoptChecks.js` |
| Semillas curadas (scripts) y contenido (JSON) | `seeds/curated/*.js`, `seeds/content/` |
| Lógica de planes compartida con la API | `src/services/lessonPlanService.js` |
| Reconstrucción completa | `scripts/db-rebuild.sh` |
| Comparador de esquemas | `scripts/db-schema-diff.js` |

Todos los comandos leen `DB_HOST`, `DB_PORT` (3306 por defecto), `DB_USER`, `DB_PASSWORD` y `DB_NAME` del entorno o de `backend/.env`. Para apuntar un comando a otra base basta `DB_NAME=otra npm run ...`: dotenv no pisa variables ya definidas.

## Comandos

| Comando | Qué hace |
| --- | --- |
| `npm run db:migrate` | Aplica las migraciones pendientes (`up`). `-- --to <nombre>` aplica hasta esa inclusive. |
| `npm run db:migrate:status` | Lista aplicadas y pendientes. |
| `npm run db:migrate:down -- --to <nombre>` | Revierte, de la más nueva a la indicada (inclusive). `-- --last` revierte solo la última. Sin ninguno de los dos se niega. |
| `npm run db:migrate:adopt [-- --dry-run]` | Registra en `SequelizeMeta` las migraciones cuyo efecto **ya está** en el esquema. No modifica el esquema. |
| `npm run db:seed:curated` | Siembra cuentas de prueba, curso, planes e inscripción (idempotente). |
| `npm run db:verify` | Comprueba recuentos, una revisión publicada por historia, docente e inscripción. Solo lectura. |
| `npm run db:audit:tprs` | Auditoría de coherencia TPRS del contenido (`seeds/content`) o de la base. Solo lectura (ver «Auditoría TPRS»). |
| `npm run db:rebuild -- ...` | Dump previo, borrado, migraciones, semillas y verificación (ver abajo). |
| `node scripts/db-schema-diff.js <bdA> <bdB>` | Compara tablas, columnas, tipos, nulos, defaults, índices y claves foráneas de dos bases locales. |
| `npm run db:init` | **Solo desarrollo.** `sync({ alter: true })`, sin migraciones ni conversión de datos. Se niega con `NODE_ENV=production` y con hosts no locales (salvo `ALLOW_DB_INIT_REMOTE=yes`). |

`npm run db:migrate:tprs:test` queda como envoltorio obsoleto de `adopt` + `up` sobre `DB_NAME_TEST`.

Las confirmaciones de las migraciones destructivas se respetan tal cual: `CONFIRM_DROP_LEGACY_PROGRESS=yes` (borrar `progress`, `question_responses`, `activity_configs` con filas), `CONFIRM_LESSON_PLAN_DATA_LOSS=yes` (revertir `lesson_*`), `CONFIRM_KEYFRAME_TOOLTIP_DATA_LOSS=yes`, `CONFIRM_CLASSES_FOUNDATION_DATA_LOSS=yes` (revertir el esquema de clases, chat y paquetes de W00 con filas; ver `docs/clases-chat-integraciones/CONTRATO.md`) y `CONFIRM_DROP_BASELINE=yes` (revertir la línea base). Si faltan, la migración falla antes de borrar nada.

El runner toma un `GET_LOCK` de MySQL durante `up`/`down`/`adopt`, así que dos ejecuciones simultáneas (por ejemplo dos réplicas) no se pisan.

## Migración baseline

`migrations/20260101000000-baseline-schema.js` crea, con `queryInterface`, las tablas que antes solo existían en `Dump20260122.sql`: `users`, `courses`, `units`, `stories`, `questions` (sin `audioUrl`), `vocabulary`, `repetition_activities`, `enrollments` (sin los flags de actividad) y las heredadas `progress` y `question_responses`. Reproduce el estado **anterior** a `20260115131716`; el dump ya traía el efecto de las dos migraciones `20260115*`, que siguen corriendo encima de la baseline. Resultado: baseline + todas las migraciones, en orden, equivalen al esquema actual.

Es segura en bases que ya tienen las tablas: crea solo las que faltan (y `progress`/`question_responses` únicamente en una base completamente vacía, porque en una existente pueden haberse borrado a propósito). Cada tabla fija `ENGINE=InnoDB`, `utf8mb4` y la collation del dump (`utf8mb4_0900_ai_ci`, y `utf8mb4_unicode_ci` en `repetition_activities` y `question_responses`).

**Collation de las tablas posteriores.** Las migraciones que vinieron después no fijan collation: heredan la de la base. Por eso `db-rebuild.sh` crea la base con `utf8mb4_0900_ai_ci` (la del dump). Una base con otro valor por defecto (por ejemplo `utf8mb4_unicode_ci`) tiene el mismo esquema salvo la collation de `lesson_*` y `tooltips`; no afecta al funcionamiento.

## Bases nuevas, bases existentes y `adopt`

- **Base vacía:** `npm run db:migrate` (corre la baseline y todo lo demás).
- **Base con esquema previo** (restaurada de `Dump20260122.sql`, o parcheada a mano con los scripts viejos): no se reaplica la historia. Primero un respaldo, luego:

```bash
DB_NAME=mi_base npm run db:migrate:adopt -- --dry-run   # muestra qué detecta, no escribe
DB_NAME=mi_base npm run db:migrate:adopt
CONFIRM_DROP_LEGACY_PROGRESS=yes DB_NAME=mi_base npm run db:migrate   # solo si hay que borrar progreso heredado con filas
```

`adopt` mira `information_schema` para cada migración y solo registra la que encuentra aplicada: la baseline si existen las 8 tablas base; `audioUrl` en `questions`; la tabla `tooltips`; `activity_configs` ya por historia (o ausente con `lesson_plans` presente); las 5 tablas `lesson_*` con sus índices únicos y un plan por historia; `blockKey` + `'keyframe'` + índice en `tooltips`; la ausencia de las tablas y flags heredados. Una migración sin detector, o cuyo efecto no se ve, queda pendiente y corre normalmente. Si detecta una aplicada después de una pendiente, avisa de que correrá fuera de orden.

La tabla de historial puede llamarse `sequelizemeta` (así viene en el dump, tomado en Windows) o `SequelizeMeta`. El runner usa la que exista; en un servidor sensible a mayúsculas (Linux/Railway) esto importa.

Equivalencia verificada (ver `tests/migrationRunner.test.js`, que lo comprueba en cada `npm test`): base vacía + `db:migrate` produce el mismo esquema que dump + `adopt` + `db:migrate`.

## Semillas curadas

`npm run db:seed:curated` ejecuta en orden `seeds/curated/01-accounts.js`, `02-course-content.js`, `03-lesson-plans.js` y `04-enrollments.js`. Todas son idempotentes. Opciones (`npm run db:seed:curated -- ...`):

| Opción | Efecto |
| --- | --- |
| `--only <accounts\|course-content\|lesson-plans\|enrollments>` | Ejecuta solo esa semilla. |
| `--sync-content` | Actualiza filas existentes (por id) con lo que dicen los JSON: título, descripción, orden, preguntas, vocabulario. Corrige texto mal codificado en bases viejas. Para historias sin `plan` publica una revisión nueva con el texto del archivo si la última está sin curar. |
| `--force-plans` | Publica el plan del archivo como revisión nueva aunque la última revisión esté curada a mano o haya un borrador abierto. |
| `--reset-passwords` | Vuelve a fijar la contraseña de las cuentas de prueba. |

Reglas de seguridad por defecto: nunca se pisa una fila existente; un plan solo se publica si la historia no tiene revisión, si la última revisión está sin curar (un keyframe, sin expresiones ni preguntas durante la narración) o si ya coincide; si un docente la editó o hay un borrador abierto, la semilla avisa y no toca nada. Las revisiones que alumnos ya usan nunca cambian (el progreso queda fijado a su plan).

**Cuentas.** `seeds/local-test-accounts.json` (docente y alumno). La contraseña sale de `SEED_TEST_PASSWORD`; si no está, se usa la del JSON **solo** cuando `DB_HOST` es `localhost`/`127.0.0.1`/`::1`; en otro host la semilla falla. El hash lo calcula el hook del modelo `User`. Una cuenta puede llevar `"permissions": ["users.manage", "test_users.manage"]` (claves de `src/config/permissions.js`): se aplica al crearla y también a las cuentas que ya existen (es configuración, no datos). `admin@gmail.com` los lleva ambos.

**Panel de administración.** La migración `20261107000000-add-user-admin-fields.js` añade a `users`: `permissions` (JSON nullable, lista de claves), `isTestAccount` (BOOLEAN NOT NULL, default 0) y `suspendedAt` (DATETIME nullable). Los permisos efectivos suman los guardados y todos los de quien esté en `ADMIN_EMAILS` (env); las cuentas de prueba nunca tienen. Borrar una cuenta de prueba (`DELETE /api/admin/test-users`) usa los FK reales: `users` y `courses` hacen CASCADE a su contenido y `enrollments` a progreso, intentos y certificados, pero `orders` es RESTRICT hacia `courses` y `affiliates` (y SET NULL hacia `users`), así que las órdenes se borran primero. Si un curso de una cuenta de prueba tiene inscripciones, órdenes o clases de usuarios reales, no se borra nada (409). Ver `docs/admin/SPEC.md`.

**Contenido.** `seeds/content/course.json` (curso, unidades, vocabulario) y `seeds/content/stories/NN-titulo.json` (una historia con sus preguntas y, opcionalmente, su plan). Convertido de `complete_course_seed.sql`, que queda como referencia histórica. Los ids son estables y las semillas hacen upsert por id. Antes de escribir nada se valida: ids y títulos únicos, preguntas con la respuesta correcta entre las opciones y texto limpio (sin mojibake ni NFC roto).

**Formato de una historia** (la fase de curación edita solo estos archivos):

```json
{
  "id": 1, "unitId": 1, "order": 100,
  "title": "María en la Fiesta",
  "text": "Texto completo…",
  "questions": [
    { "id": 1, "text": "¿Dónde está María?", "type": "choice", "options": ["…"], "correct": "…" }
  ],
  "plan": {
    "before":    [ { "expression": "Me llamo", "role": "target" } ],
    "keyframes": [
      { "text": "María va a una fiesta…", "questionsAfter": ["¿Dónde está María?"] },
      { "text": "María ve a Juan…" }
    ],
    "after":     [ "full_story", "flashcards" ],
    "later":     [ { "expression": "Me llamo", "role": "revisit", "story": "El Primer Día de Clase" } ]
  }
}
```

- `plan` es opcional, y también cada sección. Sin `plan`: un keyframe con todo el texto, lectura completa, todas las preguntas en `after`, `flashcards` y `matching` (equivale al relleno inicial de la migración `20260927`).
- Las preguntas se citan por su texto, las expresiones por su palabra (`vocabulary.word` del curso) y las historias por su título; los archivos no contienen ids de la base. Un error de tipeo falla con un mensaje claro antes de escribir.
- `after` es una lista ordenada: `"full_story"` (exactamente una), `"flashcards"`, `"matching"`, `"listen_repeat"` o `{ "question": "texto" }`. Esas preguntas quedan ligadas al último keyframe.
- `later` programa la reaparición de una expresión en **otra** historia. Al publicar, el servicio (el mismo de la API) deja una expresión `revisit` en `before` del borrador de esa historia. La historia destino debe declararlo también en su `plan.before` (como hace «El Primer Día de Clase»), así la semilla lo publica; si no, la semilla avisa de que quedó un borrador pendiente y no lo publica a escondidas.
- Cada historia recibe primero su revisión 1 inicial y luego, si tiene `plan`, la curada como revisión 2 (lo mismo que hace el flujo de la API: borrador, `PUT` y publicar). Publicar reescribe `Story.text` con los keyframes unidos por una línea en blanco, igual que la API.

`seeds/tprs_pilot_plan.json` sigue como referencia editorial del piloto; un test comprueba que coincide con el `plan` de «María en la Fiesta».

### Correcciones de codificación

`complete_course_seed.sql` ya estaba en UTF-8 correcto (revisados todos sus caracteres no ASCII: `¿ á é í ñ ó ú`, sin secuencias rotas), así que la conversión a JSON no necesitó correcciones. El mojibake está en `Dump20260122.sql`: 33 secuencias (25 en `questions`, 7 en `vocabulary`, 1 en `stories`), UTF-8 leído como CP437:

| Roto | Correcto | Veces |
| --- | --- | --- |
| `┬┐` | `¿` | 10 |
| `├®` | `é` | 9 |
| `├í` | `á` | 6 |
| `├¡` | `í` | 4 |
| `├▒` | `ñ` | 3 |
| `├│` | `ó` | 1 |

Además el dump trae textos sin tildes («Maria en la Fiesta», «Cafe»), que no son mojibake sino contenido distinto; el contenido canónico es el del seed. `db:verify` y la validación de los JSON rechazan estas secuencias. Una base vieja se corrige con `npm run db:seed:curated -- --sync-content`. En las historias sin `plan` el texto del keyframe se corrige publicando una revisión nueva (`--sync-content` lo hace si la última está sin curar).

## Auditoría TPRS

`npm run db:audit:tprs` revisa que cada historia cumpla el diseño del plan TPRS (`spanishnow-plan-refactorizacion-tprs.md`). Solo lee; nunca escribe.

```bash
npm run db:audit:tprs                          # contenido: seeds/content/course.json + stories/*.json (sin base de datos)
npm run db:audit:tprs -- --json                # salida para máquina
npm run db:audit:tprs -- --source db           # revisiones publicadas vigentes de DB_NAME (conexión normal de src/config/database.js)
npm run db:audit:tprs -- --source db --course 1
```

- `--source content` (por defecto) usa el mismo cargador que las semillas (`seeds/curated/lib/content.js`) y la misma lectura del `plan` que `plan.js`: una historia sin `plan` se audita como el plan por defecto (un keyframe, todas las preguntas al final). Si el cargador rechaza el contenido (mojibake, duplicados, pregunta `choice` sin su respuesta entre las opciones), la auditoría termina con ese error.
- `--source db` se niega si `DB_HOST` no es local, salvo `--allow-remote`. Audita el plan publicado más reciente de cada historia (bloques activos); una historia sin revisión publicada sale con todos los faltantes.
- Salida: una tabla por historia (orden de unidad/historia) con ✓ / ⚠ / ✗ por regla, el detalle de cada observación y un resumen. **Código de salida 1 si hay algún ✗; 0 si solo hay ⚠.**
- Código: reglas puras en `src/services/tprsAudit.js` (modelo en memoria, sin base ni archivos), CLI en `src/db/auditTprs.js`, tests con fixtures en `tests/tprsAudit.test.js`.

| Regla | ✗ error | ⚠ advertencia |
| --- | --- | --- |
| R1 Estructuras objetivo | 0 o más de 4 expresiones `target` en `before`; una objetivo que no aparece en el texto de la historia (sin tildes ni mayúsculas, tolerando flexión simple: gato/gatos, cuesta/cuestan) | 1 o 4 objetivos |
| R2 Keyframes | ningún keyframe; la unión de los keyframes no coincide con el texto de la historia (salvo espacios) | un solo keyframe; más de 45 o menos de 3 palabras en un keyframe |
| R3 Preguntas durante | ninguna pregunta `during` con 2+ keyframes; `choice` sin la correcta entre las opciones; `yes_no` con correcta distinta de Sí/No; la respuesta solo aparece en un keyframe posterior al que sigue la pregunta | ninguna pregunta con 1 keyframe; `choice` con 3+ opciones (o 1); opciones de `yes_no` distintas de Sí/No; no se pudo verificar que el keyframe contenga la respuesta (heurística por palabras de contenido: la respuesta correcta en `choice`, las palabras de la pregunta en `yes_no`) |
| R4 Sin cuestionario final | | más de 1 pregunta en `after` |
| R5 Reaparición (todas menos la última historia del curso) | `later` hacia una historia anterior, ella misma o inexistente; la expresión no aparece en el texto de la historia destino | ningún `later`; la destino no la incluye en `before` con rol `revisit` |
| R6 Vocabulario y codificación | expresión que no está en el vocabulario del curso; mojibake (el `MOJIBAKE` del cargador) en título, texto, keyframes, preguntas u opciones | |
| R7 Lectura y refuerzos | no hay exactamente un `full_story` en `after` | ningún refuerzo (`flashcards`, `matching`, `listen_repeat`) |

## Reconstruir una base local

```bash
scripts/db-rebuild.sh --target local --db spanishnow_rebuild_test --yes
# o: npm run db:rebuild -- --target local --db spanishnow_rebuild_test --yes
```

Pasos: (1) `mysqldump --single-transaction --routines --triggers` (utf8mb4) a `~/SpanishNow-backups/local-<db>-<fecha>.sql.gz`, verificado con `gunzip -t` y buscando `CREATE TABLE`; si falla, aborta sin tocar nada (si la base no existe o no tiene tablas, no hay nada que respaldar); (2) `DROP/CREATE DATABASE` con `utf8mb4_0900_ai_ci`; (3) `db:migrate`; (4) `db:seed:curated`; (5) `db:verify`.

Guardas: `--target local` se niega si el host no es `localhost`/`127.0.0.1`/`::1`; `--db spanishnow` exige `--force-dev-db` y además la confirmación escrita del nombre; el nombre solo admite letras, dígitos y `_`. `--dry-run` imprime el plan sin ejecutar nada. `--skip-dump` omite el respaldo previo y solo se admite con `--target local` y una base cuyo nombre contenga `e2e` (lo usa la suite E2E, `spanishnow_e2e_test`). Contraseñas: van por `MYSQL_PWD` y por el entorno de node, nunca por la línea de comandos ni por la salida.

Para probar la actualización de una base existente sin tocarla: copiarla (`mysqldump bd | mysql copia`), `db:migrate:adopt`, `db:migrate` y `db:seed:curated -- --sync-content`, y comparar recuentos antes y después.

## Subidas sin Cloudinary (desarrollo y E2E)

Con `MEDIA_FAKE_UPLOADS=1` el backend no llama a Cloudinary: `cloudinary.uploadFromBuffer` guarda el archivo en `backend/uploads-dev/` (ignorado por git, nombre = UUID y extension segun la firma del archivo) y devuelve una URL absoluta `MEDIA_FAKE_BASE_URL/uploads-dev/<archivo>` (por defecto `http://localhost:$PORT`). `app.js` sirve esa carpeta en `/uploads-dev` solo si el modo esta activo. Cubre las ilustraciones de keyframe (`POST /api/lesson-plans/story/:storyId/draft/blocks/:blockKey/image`) y las imagenes de vocabulario (`POST/PUT /api/vocabulary`). Con esta variable el proceso **se niega a arrancar** si `NODE_ENV=production` o si existe `RAILWAY_ENVIRONMENT`. La suite E2E (`e2e/global-setup.ts`) la activa para su backend en `:3101`; para el backend de desarrollo basta anadir `MEDIA_FAKE_UPLOADS=1` al `.env` local.

## Procedimiento propuesto para Railway (sin aplicar todavía)

Railway es solo de prueba, sin datos reales, pero se respalda igual. **Requiere OK del usuario antes de ejecutarse.** Elegí reconstruir (A); la actualización en el lugar (B) queda por si alguien ya registró cuentas que quiere conservar.

1. **Credenciales públicas.** En Railway, servicio MySQL, pestaña *Variables*/*Connect*: la conexión interna (`mysql.railway.internal`) no se alcanza desde la laptop; hay que habilitar *TCP Proxy* (Settings, Networking) y usar `RAILWAY_TCP_PROXY_DOMAIN` y `RAILWAY_TCP_PROXY_PORT`. Usuario `MYSQLUSER`, contraseña `MYSQLPASSWORD`, base `MYSQLDATABASE` (normalmente `railway`). Exportarlas solo en la sesión de la terminal, sin escribirlas en archivos del repo ni en `backend/.env`:

```bash
export RAILWAY_DB_HOST=<dominio-del-proxy> RAILWAY_DB_PORT=<puerto-del-proxy> RAILWAY_DB_USER=root RAILWAY_DB_NAME=railway
read -rs RAILWAY_DB_PASSWORD && export RAILWAY_DB_PASSWORD
read -rs SEED_TEST_PASSWORD && export SEED_TEST_PASSWORD   # contraseña elegida para docente y alumno de prueba
```

2. **Revisar sin cambiar nada:** `cd backend && scripts/db-rebuild.sh --target railway --yes --dry-run`. Opcional, solo lectura: `DB_HOST=$RAILWAY_DB_HOST DB_PORT=$RAILWAY_DB_PORT DB_USER=$RAILWAY_DB_USER DB_PASSWORD=$RAILWAY_DB_PASSWORD DB_NAME=$RAILWAY_DB_NAME npm run db:migrate:status` para ver en qué estado está hoy (si se importó el dump a mano, mostrará pendientes).
3. **(A) Reconstruir:** `scripts/db-rebuild.sh --target railway --yes` y escribir el nombre de la base cuando lo pida (o `--confirm-db railway` en modo no interactivo). Hace el dump previo en `~/SpanishNow-backups/railway-railway-<fecha>.sql.gz`, borra **todas las tablas** (Railway puede no permitir `DROP DATABASE`), migra, siembra y verifica. Con la base ya limpia y la nueva versión del backend desplegada no hay ventana de inconsistencia; hacerlo antes del deploy o con el backend detenido.
   **(B) Actualizar en el lugar:** respaldo manual (paso 6), luego con las variables `DB_*` apuntando a Railway: `npm run db:migrate:adopt -- --dry-run`, `npm run db:migrate:adopt`, `CONFIRM_DROP_LEGACY_PROGRESS=yes npm run db:migrate`, `npm run db:seed:curated -- --sync-content`.
4. **Variables del servicio backend** (ya referenciadas a MySQL): `DB_HOST`, `DB_USER`, `DB_PASSWORD`, `DB_NAME` y, ahora soportado, `DB_PORT` (3306 por defecto; dentro de la red interna no hace falta).
5. **Verificar:** `GET /health`; login con las cuentas de prueba; `GET /api/lesson-plans/story/1` como alumno (revisión 2, tres keyframes).
6. **Si algo sale mal, restaurar desde el dump:**

```bash
# 1) dejar la base vacía (mismo bloque que usa el script) y 2) cargar el dump
gunzip -c ~/SpanishNow-backups/railway-railway-<fecha>.sql.gz | \
  MYSQL_PWD="$RAILWAY_DB_PASSWORD" mysql --protocol=TCP -h "$RAILWAY_DB_HOST" -P "$RAILWAY_DB_PORT" -u "$RAILWAY_DB_USER" --default-character-set=utf8mb4 "$RAILWAY_DB_NAME"
```

El dump trae `DROP TABLE IF EXISTS` + `CREATE TABLE` de cada tabla, así que pisa las existentes; si la reconstrucción dejó tablas que el dump no conoce (`lesson_*`, `tooltips`), borrarlas antes. Como último recurso: `Dump20260122.sql` restaura el estado histórico (después hay que migrar de nuevo con `adopt` + `db:migrate`).

### railway.json y arranque

Recomendación: **correr `db:migrate` como *pre-deploy command*, no a mano ni en `npm start`.** En `backend/railway.json`:

```json
"deploy": {
  "preDeployCommand": "npm run db:migrate",
  "startCommand": "npm start",
  "restartPolicyType": "ON_FAILURE",
  "restartPolicyMaxRetries": 10
}
```

Por qué: corre una vez por despliegue (no en cada reinicio ni en cada réplica), antes de que reciba tráfico el contenedor nuevo; si una migración falla, el despliegue no se publica y sigue el anterior; usa las mismas variables `DB_*` del servicio; y el `GET_LOCK` evita carreras. No en `npm start` porque un bucle de reinicios (`ON_FAILURE`, 10 reintentos) reintentaría migraciones parciales. Cuidados: MySQL confirma el DDL de forma implícita, así que una migración que falla a mitad deja el esquema a medias (las existentes son idempotentes; escribir las nuevas igual); las confirmaciones destructivas no se definen en Railway, de modo que una migración que borra datos falla de forma segura; **las semillas no van en el pre-deploy** (siembran cuentas con contraseña): se ejecutan a mano con `db-rebuild.sh` o `npm run db:seed:curated`. Activarlo solo después de la reconstrucción/adopción del paso 3: sobre una base importada a mano del dump, la migración `20261022` se negaría a borrar el progreso heredado y bloquearía el despliegue (el fallo es seguro, pero conviene no tropezarse). No se modificó `railway.json`.

## Escribir una migración nueva

Archivo `migrations/AAAAMMDDHHMMSS-descripcion.js` con `up(queryInterface, Sequelize)` y `down`. Reglas del repo: idempotente cuando sea posible (consultar el esquema antes de crear o alterar), confirmación por variable de entorno para cualquier borrado de datos, y fijar `charset`/`collate` si la tabla debe ser independiente de la base. No hace falta detector en `adoptChecks.js`: `adopt` existe solo para las migraciones anteriores al runner.

## Hallazgos pendientes

- El modelo `Question` declara `answerType` con `open_ended`, pero la columna real es `ENUM('yes_no','choice')` desde la baseline (igual que en el dump): insertar una pregunta abierta fallaría en MySQL estricto. Es previo a este cambio; hace falta una migración si se quiere esa opción.
- `RAILWAY_DEPLOY_GUIDE.md` (en la raíz) tiene claves de Cloudinary y un `JWT_SECRET` escritos en claro y versionados. Rotarlos y quitarlos del archivo.
