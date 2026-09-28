# SpanishNow — plan de refactorización del flujo TPRS

**Fecha:** 27 de septiembre de 2026  
**Repositorio:** `/Users/andresguerrero/Repos/SpanishNow/`  
**Objetivo:** que cada historia se consuma como una lección guiada por significado, narración con comprobaciones breves, lectura/escucha y reencuentro posterior del lenguaje. La profesora debe poder ordenar y publicar ese flujo desde el editor.

## 1. Resultado esperado

Una lección se compone de bloques ordenables en una línea de tiempo:

```text
ANTES             DURANTE                                      DESPUÉS                  MÁS ADELANTE
Expresiones  →    Keyframe → Question → Keyframe → Question   → Lectura/audio → Refuerzo → Expresión en otra historia
```

La plantilla propone este orden, pero la profesora puede añadir, mover, desactivar y configurar bloques. «Más adelante» se planifica desde la lección actual y se ejecuta en una lección futura: no es una actividad inmediatamente posterior al cierre de la misma historia.

### Reglas pedagógicas del producto

- Un *keyframe* es un fragmento narrativo con sentido, no un segundo fijo del audio. Puede contener texto y audio propio opcional.
- Una *question* de comprobación se inserta después de un keyframe concreto. La profesora elige las pausas; no debe aparecer una pregunta automáticamente después de cada fragmento.
- Las comprobaciones durante la historia privilegian sí/no, elección entre dos opciones o respuestas breves. Una respuesta incorrecta muestra el contexto relevante, permite reintentar y no impone un examen de 100 % para continuar.
- La lectura y el audio de la historia completa se ofrecen después de la narración guiada. El audio completo existente se conserva.
- Tarjetas, emparejamiento y repetición oral son refuerzos configurables. La plantilla no los agrega obligatoriamente detrás de cada historia.
- El progreso distingue el recorrido narrativo de los refuerzos opcionales. «Completar la historia» no equivale a acertar todas las preguntas ni a completar cuatro actividades.

## 2. Estado actual que debe preservarse

- Stack: Angular 21; Express 5; Sequelize/MySQL; Cloudinary.
- Ya existen cursos, unidades, historias, preguntas, vocabulario, audios, actividades de repetición, respuestas y progreso.
- `Story.text` es un bloque único; `Question` solo tiene `storyId`. El reproductor muestra el texto completo y abre preguntas en un modal posterior.
- `ActivityConfig` está siendo trasladado de unidad a historia en cambios locales **sin confirmar**. También hay trabajo local sobre tooltips, navegación y el editor del profesor. La rama `main` estaba dos commits por delante de `origin/main` al elaborar este plan.
- Las marcas de finalización de actividades aún mezclan estado de toda la inscripción con estado por historia.
- Existen historias y preguntas de ejemplo; «María en la Fiesta» sirve de piloto. Algunos SQL de semillas siguen usando el esquema anterior por unidad.

**Antes de editar:** leer `git status`, registrar el estado y conservar íntegro el trabajo local. Si se usa aislamiento, debe partir de una copia fiel del árbol actual, incluidos archivos no rastreados; un worktree creado solo desde `origin/main` omitiría parte del desarrollo. No ejecutar sobre una base con datos el SQL `backend/migrations/change_activity_configs_to_story_level.sql`: borra configuraciones y presupone identificadores concretos.

## 3. Diseño del editor del profesor

Sustituir la edición dispersa entre texto, preguntas y cuatro interruptores por un **compositor visual de lección** dentro de la gestión del curso.

### Capacidades

1. Crear una lección desde la plantilla TPRS: sección «Antes», secuencia «Durante», sección «Después» y planificación «Más adelante».
2. Añadir y ordenar bloques con arrastrar y soltar **y** controles accesibles «Mover arriba/abajo».
3. Dividir una historia en keyframes, editar su texto, reordenarlos y asociarles audio opcional. Mantener el audio completo de la historia para la escucha posterior.
4. Insertar o mover preguntas entre keyframes. Mostrar claramente el keyframe al que sigue cada pregunta y avisar si pierde su contexto.
5. Seleccionar expresiones del vocabulario existente para presentarlas antes de la historia. Permitir reutilizar una expresión en otra historia sin duplicar su ficha.
6. Colocar y activar refuerzos opcionales después de la historia; mostrar su alcance (historia o unidad). Evitar que «4/4 actividades» se interprete como criterio de calidad.
7. En «Más adelante», elegir una historia futura donde reaparezca una expresión. La profesora debe ver en qué lección se recuperará.
8. Previsualizar el recorrido **exactamente como lo verá el alumno**, incluidos estados de acierto, error, ayuda, audio y navegación.
9. Guardar borrador y publicar. La edición de una lección publicada debe crear una nueva revisión para no alterar silenciosamente el recorrido de alumnos que ya la empezaron.

### Tutorial emergente de la plantilla

Al abrir el compositor por primera vez, mostrar una ventana emergente breve y descartable titulada **«Cómo construir una lección con historias»**. Contenido sugerido en cuatro pantallas o secciones:

1. **Antes:** elige pocas expresiones imprescindibles y establece su significado.
2. **Durante:** divide la historia en keyframes y coloca preguntas breves donde necesites comprobar comprensión.
3. **Después:** ofrece la historia completa y añade solo los refuerzos que tengan sentido.
4. **Más adelante:** reutiliza expresiones en una historia posterior para que el alumno las reconozca en otro contexto.

El tutorial debe incluir un ejemplo concreto de «María en la Fiesta», una demostración visual de cómo mover un bloque, las acciones «Usar plantilla», «Ver ejemplo» y «Cerrar», y un enlace permanente **«¿Cómo funciona esta plantilla?»** para volver a abrirlo. Guardar que se vio por usuario y versión de tutorial; una preferencia local es suficiente para la primera entrega, siempre que la reapertura manual funcione. Debe poder cerrarse con Escape, mantener el foco dentro mientras está abierto, devolver el foco al activador y funcionar en móvil y con teclado. No debe bloquear la edición una vez cerrado.

## 4. Diseño del recorrido del alumno

1. **Antes:** ve las expresiones seleccionadas, con significado y ejemplo. Puede repasarlas sin prueba obligatoria.
2. **Durante:** avanza keyframe por keyframe; reproduce audio del fragmento si existe; responde las preguntas insertadas. Ante un error, recibe la frase o el fragmento pertinente y puede reintentar o seguir según la regla de la lección.
3. **Después:** lee el texto reunido, escucha el audio completo y usa los tooltips. Puede abrir los refuerzos publicados.
4. **Más adelante:** una lección posterior presenta de nuevo la expresión elegida por la profesora dentro de su propio contexto narrativo.
5. Al salir y volver, continúa en su último bloque visitado. Puede volver a leer o escuchar sin reiniciar el curso.

La navegación lateral debe mostrar lecciones e hitos de progreso, no una cadena fija de «historia + cuatro actividades». Las flechas de avance y la selección lateral deben aplicar las mismas reglas de acceso.

## 5. Contrato de datos y API propuesto

La implementación puede ajustar los nombres de tablas, pero debe respetar estos invariantes:

- `Story` sigue siendo la unidad de lección dentro de `Unit`.
- Un plan de lección tiene una revisión, estado de borrador/publicado y una colección ordenada de bloques. Un plan publicado permanece estable para los alumnos que lo comenzaron.
- Cada bloque tiene identificador estable, tipo, fase, posición, activo y obligatoriedad. Tipos iniciales: `expression`, `keyframe`, `question`, `full_story`, `flashcards`, `matching`, `listen_repeat`.
- Los bloques `keyframe` guardan su texto y audio opcional. Los bloques `question` referencian una pregunta y se vinculan al keyframe que les da contexto. Validar que todas las referencias pertenezcan a la misma historia/plan.
- El texto completo de la historia debe tener una sola fuente de verdad: derivarlo de los keyframes al publicar y mantener `Story.text` como representación compatible mientras existan consumidores antiguos.
- El vocabulario conserva su pertenencia a una unidad y obtiene asociaciones con historias y un papel (`target`, `support` o `revisit`).
- El progreso queda por alumno, historia y revisión de plan, con el identificador del último bloque visitado. Las respuestas a preguntas y los refuerzos se registran por separado. Un identificador estable evita que cambiar el orden desplace el progreso arbitrariamente.
- La API del alumno solo entrega la revisión publicada y **no incluye `correctAnswer` antes de responder**. La API de edición de la profesora entrega borradores y claves, protegida por rol y propiedad del curso.
- La evaluación de preguntas verifica que la pregunta, el bloque, la revisión y el progreso pertenecen a la misma lección/alumno. Responder una pregunta no debe marcar por sí solo todos los refuerzos como completados.
- La operación de reordenar bloques es atómica y valida posiciones duplicadas, referencias y fases. Publicar valida que existe al menos un keyframe y que los bloques necesarios tienen contenido.

Archivos de partida principales:

```text
backend/src/models/{Story,Question,Vocabulary,Progress,ActivityConfig}.js
backend/src/models/index.js
backend/src/routes/{story,question,questionResponse,enrollment,activityConfig,course}.routes.js
frontend/src/app/core/models/course.model.ts
frontend/src/app/core/services/*
frontend/src/app/features/teacher/course-manage/{course-manage.ts,course-manage.html}
frontend/src/app/features/student/story-player/*
frontend/src/app/features/student/activity-modal/*
frontend/src/app/features/student/{flashcard-modal,matching-modal,listen-repeat-modal}/*
frontend/src/app/shared/components/tooltip-*/*
```

Separar componentes pequeños del editor y del reproductor durante la refactorización; `course-manage.ts` y `story-player.component.ts` ya concentran demasiadas responsabilidades. Reutilizar los controles de pregunta, audio, vocabulario y tooltip donde sea útil.

## 6. Migración de contenido y compatibilidad

1. Crear migraciones Sequelize/SQL reversibles o, cuando una reversión de datos no sea viable, documentar copia de seguridad y plan de recuperación. No usar `sequelize.sync({ alter: true })` como mecanismo de migración de producción.
2. Convertir cada historia existente en un plan compatible con **un keyframe** y una lectura completa. Las preguntas existentes pasan inicialmente a una sección posterior; no inferir automáticamente un punto narrativo a partir del texto.
3. Curar manualmente «María en la Fiesta»: tres keyframes, preguntas «¿Dónde está María?» y «¿Cómo se llama el amigo de María?» ubicadas tras los fragmentos pertinentes, expresiones «me llamo» y «mucho gusto» antes de narrar.
4. Asociar esas expresiones a «El Primer Día de Clase» o «En el Café» como primer caso de «Más adelante».
5. Mantener una vista legible para historias aún no curadas. Migrar las semillas que aún insertan `activity_configs` por `unitId`.
6. Revisar tooltips anclados por desplazamientos de texto al dividir una historia. Conservar su uso en la lectura completa y definir una asociación segura por keyframe para el modo guiado.

## 7. Orden de implementación

| Hito | Entrega comprobable |
|---|---|
| 0. Preparación | Estado local preservado; inventario de migraciones/semillas y contrato de datos acordado. |
| 1. Núcleo de datos | Plan, bloques, asociaciones de expresiones, revisión publicada y API con validaciones. |
| 2. Editor | Línea de tiempo ordenable, borrador/publicación, vista previa y tutorial emergente. |
| 3. Alumno | Narración por keyframes, questions integradas, lectura/audio completo, refuerzos y reanudación. |
| 4. Piloto | «María en la Fiesta» completa y reaparición en una historia siguiente. |
| 5. Consolidación | Migración del resto del contenido, pruebas de regresión, corrección de incidencias y documentación actualizada. |

## 8. Criterios de aceptación

- La profesora puede crear, reordenar y publicar un plan sin editar código ni SQL; la vista previa respeta el orden publicado.
- El tutorial aparece al primer acceso al compositor, explica las cuatro fases, se puede cerrar y reabrir, y es usable con teclado y móvil.
- «María en la Fiesta» intercala dos comprobaciones en los keyframes elegidos y no presenta un cuestionario obligatorio al final de la narración.
- Un error muestra contexto y una opción clara para reintentar; no bloquea el avance por exigir 100 % de aciertos.
- El alumno puede salir y volver al mismo bloque; los refuerzos de una historia no se marcan completados en otra.
- La lectura y el audio completos siguen disponibles; los contenidos existentes que no se han curado todavía siguen funcionando.
- Publicar un nuevo orden no cambia la revisión de un alumno que ya comenzó la anterior.
- Una cuenta de alumno no recibe `correctAnswer` antes de responder ni puede responder preguntas de otra historia.
- El flujo se verifica de extremo a extremo con cuentas de profesor y alumno y con una base de datos de prueba: editar → publicar → consumir → equivocarse → reintentar → salir → volver → completar → reencontrar expresión.

## 9. Trabajo relacionado y límites

Corregir dentro de esta refactorización los fallos que impiden el flujo: progreso de actividad a nivel de inscripción, validación de pertenencia de preguntas, exposición anticipada de respuestas, navegación que no respeta acceso y subida de audio al editar bloques si se usa el almacenamiento actual en memoria.

La evaluación automática de pronunciación, la generación de historias con IA, un algoritmo de repetición espaciada y los pagos quedan para productos posteriores. La primera entrega de «Más adelante» consiste en **reaparición planificada por la profesora en otra historia**, con su correspondiente asociación de contenido.

## 10. Evidencia que debe entregar el agente implementador

- Resumen de los cambios y decisiones de modelo.
- Migración aplicada en una base de prueba, con resultado y procedimiento seguro para datos existentes.
- Capturas o recorrido verificable del compositor, tutorial, vista previa y lección del alumno.
- Resultado de compilación y de las pruebas relevantes; incidencias aún abiertas.
- Lista de archivos modificados y confirmación de que los cambios locales iniciales fueron preservados.
