# SpanishNow — implementación por etapas con relevo Luna → Sol

**Plan:** `/Users/andresguerrero/Documents/Codex/2026-09-27/co/outputs/spanishnow-plan-refactorizacion-tprs.md`  
**Repositorio:** `/Users/andresguerrero/Repos/SpanishNow/`  
**Informe de relevo:** `/Users/andresguerrero/Documents/Codex/2026-09-27/co/outputs/spanishnow-relevo-implementacion.md`

## Uso

Entrega este documento y el plan al agente. En cada ejecución indica **una sola etapa**: `Ejecuta L0`, `Ejecuta S1`, `Ejecuta L2`, `Ejecuta L3`, `Ejecuta S4` o `Ejecuta SR`. Usa **GPT-6 Luna, esfuerzo medio** para las etapas L y **GPT-6 Sol, esfuerzo medio** para las etapas S. El orden normal es **L0 → S1 → L2 → L3 → S4**. Ante un bloqueo durante L2 o L3: **L2/L3 → SR → reanudar L2/L3**. No saltes S1 ni S4. No encargues dos etapas en un mismo turno.

El modelo no cambia por sí solo. Cuando Luna se detenga, inicia una ejecución de Sol con la etapa indicada y el informe de relevo. Cuando Sol termine SR, vuelve a Luna en la etapa interrumpida.

## Reglas para todos los agentes

Eres un agente implementador de SpanishNow. Lee el plan completo, las instrucciones aplicables del repositorio y el informe de relevo si existe. Antes de editar, revisa `git status`, el diff local y los archivos no rastreados. Conserva los cambios previos, incluidos los cambios sin confirmar sobre `ActivityConfig` por historia, tooltips y editor. No restablezcas el árbol a `origin/main` ni sobrescribas trabajo ajeno. Si no puedes preservar una edición previa con certeza, detente y describe el conflicto exacto.

Trabaja solo en la etapa asignada. No afirmes que una función opera correctamente por inspección estática: distingue **COMPROBADO**, **NO COMPROBADO** y **FALLIDO**. No ejecutes migraciones ni semillas destructivas sobre una base con datos, ni uses `sequelize.sync({ alter: true })` como migración de producción. `backend/migrations/change_activity_configs_to_story_level.sql` no es seguro para una base con datos. Si falta permiso de archivos o una base de prueba, solicita el acceso necesario y documenta las verificaciones pendientes; no simules resultados.

La meta es una lección TPRS editable por la profesora: **Antes** (expresiones), **Durante** (keyframes y questions en pausas elegidas por la profesora), **Después** (lectura/audio completo y refuerzos opcionales) y **Más adelante** (expresiones en otra historia). El plan fija los criterios funcionales. No inventes decisiones pedagógicas que alteren esa experiencia.

Al terminar **cada** etapa, actualiza el informe de relevo con estos seis apartados, en este orden:

1. Etapa y estado: `COMPLETA`, `BLOQUEADA` o `RELEVO A SOL`.
2. `git status` resumido y archivos modificados en esta etapa, separados de los cambios que ya existían.
3. Cambios hechos y decisiones concretas de datos, API o interfaz.
4. Comandos de verificación y resultados reales, con lo no comprobado y su causa.
5. Fallos reproducibles: ruta, operación, resultado esperado, resultado obtenido y mensaje de error.
6. Próxima etapa exacta y primer paso del siguiente agente.

No hagas commit, push, despliegue ni migración sobre datos reales salvo instrucción explícita del usuario.

## L0 — Luna: inventario

**Solo lectura del repositorio.** Identifica modelos, rutas, servicios, componentes, migraciones, semillas, pruebas y cambios locales relevantes. En el informe propón un contrato mínimo para S1: bloques y revisiones; rutas de borrador, publicación, lectura del alumno, respuesta y progreso; errores; compatibilidad con historias antiguas. Señala qué decisiones ya están resueltas por el plan. No cambies código ni esquema.

**Parada obligatoria:** una vez escrito el informe, detente y pide `Ejecuta S1 con Sol`.

## S1 — Sol: datos, migración y API

Implementa el núcleo de datos del plan: borradores y revisiones publicadas, bloques ordenados, expresiones asociadas, preguntas ligadas a keyframes y progreso por alumno/historia/revisión. Crea una migración segura y convierte las historias existentes de manera conservadora. Implementa rutas de edición/publicación, lectura del alumno, respuesta y progreso. Valida rol, propiedad, pertenencia a historia/revisión y reordenamiento atómico. La API del alumno no debe entregar `correctAnswer` antes de responder. Documenta en el informe los endpoints, requests, responses, códigos de error y reglas de revisión que usará Luna.

**Cierre:** prueba migración en una base de prueba, casos válidos y rechazos relevantes de API, y lectura de historias antiguas. Si no hay base de prueba, marca esos puntos `NO COMPROBADO` con comando y requisitos precisos. Detente y pide `Ejecuta L2 con Luna`.

## L2 — Luna: compositor y tutorial

**Puede editar:** frontend del profesor y sus pruebas. Usa el contrato API de S1. Implementa la plantilla de cuatro fases, línea de tiempo con añadir/reordenar/desactivar bloques, controles accesibles «Mover arriba/abajo», edición de keyframes, questions y expresiones, borrador/publicación, validaciones visibles y vista previa del recorrido. Integra el tutorial emergente **«Cómo construir una lección con historias»**: cuatro secciones, ejemplo «María en la Fiesta», demostración de mover un bloque, acciones «Usar plantilla», «Ver ejemplo» y «Cerrar», primera apertura por usuario/versión y enlace permanente para reabrir. Comprueba Escape, foco, teclado y móvil.

**No puede editar:** modelos, migraciones, semillas de datos, rutas, autenticación, evaluación de respuestas ni progreso del servidor. Si hace falta cambiar alguno, aplica el relevo inmediato descrito abajo.

**Cierre:** frontend compila y la profesora puede crear borrador, ordenar, previsualizar y publicar usando una base de prueba. Si se probó solo con respuestas simuladas, declara el flujo real `NO COMPROBADO`. Detente y pide `Ejecuta L3 con Luna`.

## L3 — Luna: recorrido del alumno

**Puede editar:** frontend del alumno y sus pruebas. Usa el contrato API de S1. Muestra expresiones, keyframes y questions en el orden publicado; un error enseña el contexto y permite reintentar sin exigir 100 %. Ofrece lectura y audio completos, refuerzos opcionales y reanudación desde el bloque guardado. La interfaz usa la revisión asignada al alumno y no muestra refuerzos de otra historia como completados.

**No puede editar:** modelos, migraciones, semillas de datos, rutas, autenticación, evaluación de respuestas ni reglas de progreso del servidor. Si hace falta cambiar alguno, aplica el relevo inmediato.

**Cierre:** frontend compila y se comprueba con una revisión publicada: entrar, responder mal, ver contexto, reintentar, salir, volver y continuar. Si no hay infraestructura de prueba, indica el requisito exacto y marca el flujo `NO COMPROBADO`. Detente y pide `Ejecuta S4 con Sol`.

## Relevo inmediato de Luna a Sol

Durante L2 o L3, Luna debe **detener las ediciones de la parte afectada** y pedir `Ejecuta SR con Sol` si ocurre cualquiera de estos casos:

1. La solución requiere cambiar esquema, migración, seed con efecto de datos, modelo Sequelize, contrato o ruta API, permisos, propiedad del curso, evaluación de respuestas, publicación de revisiones o progreso del servidor.
2. Una operación necesaria no existe en el contrato S1 o el servidor lo contradice. Registra endpoint, request, respuesta esperada y respuesta obtenida.
3. La compilación o una prueba relevante sigue fallando tras **dos correcciones locales distintas** del mismo problema. Registra comandos, errores y cambios intentados. Si el fallo precede a la etapa, demuestra ese hecho con el estado inicial.
4. Para avanzar habría que descartar trabajo local previo o modificar una regla pedagógica del plan. Describe el conflicto; no inventes una regla nueva.

Luna puede seguir otras partes independientes de su etapa. Antes de acabar, deja el informe en estado `RELEVO A SOL` con reproducción mínima, archivos afectados y punto preciso para reanudar. No afirmes que Sol ya empezó ni asumas traspaso automático.

## SR — Sol: resolver un bloqueo

Lee primero el informe. Corrige **solo** el bloqueo registrado y las pruebas necesarias, sin rehacer la interfaz de Luna. Actualiza el contrato si cambió. Verifica el caso que provocó el relevo y una regresión cercana. Deja escrita la etapa L2 o L3 que se debe reanudar y el primer paso. **Detente después de SR.** Si el bloqueo exige una decisión pedagógica ausente del plan, plantea una pregunta concreta al usuario y avanza únicamente en trabajo independiente.

## S4 — Sol: piloto y verificación final

Completa los hitos 4 y 5 del plan. Cura «María en la Fiesta» con tres keyframes; coloca «¿Dónde está María?» y «¿Cómo se llama el amigo de María?» tras los fragmentos pertinentes; presenta «me llamo» y «mucho gusto» antes; configura la reaparición de «me llamo» en «El Primer Día de Clase» o «En el Café». Actualiza semillas antiguas con `activity_configs` por `unitId`; conserva lectura/audio completo y tooltips. Corrige fallos de integración entre frontend y backend. Documenta migración, recuperación y conversión de las demás historias.

**Cierre:** verifica con cuentas de profesora y alumno y base de prueba el flujo editar → publicar → consumir → equivocarse → reintentar → salir → volver → completar → reencontrar expresión. Reporta cada tramo no comprobado con su causa y procedimiento exacto. No presentes la refactorización como completa si queda un criterio de aceptación fallido o no comprobado.
