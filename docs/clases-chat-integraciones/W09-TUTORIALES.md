# W09 — Tutoriales interactivos con Driver.js

Seguimiento #78. Solicitud de Andrés: detectar las pantallas menos intuitivas de alumno/docente, comprender su propósito y enseñar su uso dentro de la interfaz. Motor elegido expresamente: Driver.js.

Prioridad aclarada por Andrés durante el desarrollo: «Gestión de paquetes», «Paquetes de clases» y «Grupos de clases» resultan inentendibles a primera vista. Los destinos reales son, respectivamente, compras y saldo, catálogo de opciones y formación de grupos. Se agregan subtítulos explicativos al menú y una presentación permanente del propósito en cada una de esas tres pantallas, con enlaces a las otras tareas. No hace falta iniciar el tutorial para distinguirlas.

## Auditoría y selección

Inspección de las rutas, componentes, plantillas y acciones de cada rol. Criterios: número de estados, conceptos que se confunden, acciones con consecuencias y controles poco visibles. Es una evaluación de la interfaz implementada, no un estudio con usuarios ni una medición de abandono.

| Pantalla | Rol | Dificultad identificada | Propósito que abre la guía |
| --- | --- | --- | --- |
| Editor de lección | Docente | Cuatro fases TPRS, bloques, borrador y publicación | Diseñar cómo el alumno descubre una historia |
| Gestión del curso | Docente | Jerarquía curso/unidad/historia y panel de alumnos | Estructurar contenido y gestionar inscripciones |
| Reproductor de historias | Alumno | Índice, bloque actual, progreso, audio y refuerzos | Aprender siguiendo una historia paso a paso |
| Agenda | Ambos | Zona propia/programación, propuesta/confirmación/reprogramación | Consultar propuestas y clases confirmadas |
| Aula en vivo | Ambos | Herramientas, permisos, guardado, zoom y participantes | Trabajar sobre una pizarra compartida |
| Listado de aulas | Ambos | Sala frente a cita; borrador/en vivo/finalizada | Encontrar y preparar el espacio de trabajo |
| Compras de clases | Ambos | Disponible/reservado/consumido, vigencia, renovación | Consultar compras, saldo y condiciones propias |
| Catálogo de paquetes | Docente | Plantilla frente a oferta, versiones y pausa de ventas | Preparar plantillas para ofertas concretas |
| Preparación de oferta | Docente | Destinatario, plantilla y envío irreversible | Revisar una oferta antes de compartirla |
| Detalle de oferta | Ambos | Snapshot, condiciones, aceptación y pago | Entender una oferta y su estado |
| Formación de grupos | Docente | Plazas, instante con offset, formación/confirmación | Reunir participantes y acordar un horario tentativo |
| Integraciones | Docente | Calendar y Zoom cumplen funciones distintas | Revisar conexiones y detectar atención necesaria |
| Bandeja de mensajes | Ambos | Inicio de contacto y conversaciones vacías | Encontrar una conversación privada |
| Conversación | Ambos | Mensaje frente a oferta/propuesta y confirmación | Acordar el próximo paso con una persona |

Se prioriza la complejidad de los flujos anteriores. Login, recuperación, dashboards, progreso, directorio de docentes y preferencias tienen objetivos directos y explicaciones locales; no se agrega una guía genérica a cada página. Las actividades aisladas mantienen sus instrucciones propias. Las pantallas públicas, administración, venta de cursos, promociones y editores legales quedan fuera de esta entrega centrada en aprendizaje y gestión de clases. No se consideran evaluadas con usuarios ni resueltas por estos recorridos.

## Comportamiento y criterios verificables

- **TUT-01 / AC-TUT01:** cada pantalla seleccionada tiene propósito expreso y pasos asociados a controles existentes, según esta auditoría.
- **TUT-02 / AC-TUT02:** cada recorrido respeta el rol actual. Un alumno no recibe pasos docentes; al abrir el compositor se ofrece su guía específica.
- **TUT-03 / AC-TUT03:** práctica sobre controles reversibles: abrir formulario de propuesta/sala, pestaña Alumnos, vista previa, editor de plantilla, selección de paquete y controles de repetición. Avanza después de la acción y de que su resultado sea visible. Omitir práctica no hace clic ni envía formularios. Los demás pasos bloquean interacción con el elemento resaltado.
- **TUT-04 / AC-TUT04:** inicio voluntario desde «Ayuda de esta pantalla», disponible para repetir. Sugerencia descartable y finalización guardadas por cuenta/rol/recorrido/versión en este navegador. Escape/cerrar/navegar no equivale a completar. No hay persistencia entre dispositivos. Si storage falla se conserva en memoria.
- **TUT-05 / AC-TUT05:** todos los textos EN/ES; teclado con Tab/Shift+Tab, flechas y Escape, foco devuelto al botón de inicio, nombre y descripción accesibles, controles táctiles y preferencia de movimiento reducido. Cambiar idioma cierra la guía para reiniciarla en el nuevo idioma sin alterar borradores (SPEC AC17).
- **TUT-06 / AC-TUT06:** carga diferida del motor, pasos ausentes/ocultos omitidos, guías útiles sin registros, limpieza al navegar/cambiar cuenta/rol/idioma/destruir la pantalla, errores de carga con reintento. Sin sondeo continuo; observación de estructura del DOM.

Una práctica puede omitirse en cualquier momento. La guía no cambia dinero, horarios, progreso, mensajes, consentimientos, publicaciones ni permisos. Abrir formularios conserva el estado elegido por la persona cuando se cierra la guía; no se deshacen sus acciones.

## Superficies y compatibilidad

- `frontend/src/app/core/tutorials`: definiciones, traducciones bajo `tutorial.*`, servicio de ciclo de vida y estilos globales del motor.
- `frontend/src/app/shared/components/screen-tutorial`: iniciador contextual y sugerencia opcional.
- Superficies compartidas: adición del iniciador al layout, del bundle a `app.config.ts` y de descripciones a tres ítems del menú docente. Sin reordenar ni renombrar rutas, menús ni traducciones ajenas.
- Cuatro plantillas reciben identificadores aditivos `data-tour` para controles de práctica. La ayuda introductoria preexistente del compositor se conserva y se agrega un iniciador dentro del propio diálogo para respetar su contexto accesible.
- Dependencia fijada `driver.js@1.10.2` (MIT). Sin nuevas API, variables de entorno, migraciones ni capacidades del servidor.
- No hay renderizado HTML de textos humanos: la guía usa únicamente copias propias traducidas y escapadas antes de pasarlas al motor.

## Prueba manual con cuentas ficticias

1. En una cuenta docente de prueba, abrir Agenda y «Ayuda de esta pantalla». Avanzar hasta la práctica, abrir la propuesta y comprobar el avance. No enviar el formulario.
2. Cerrar con Escape: el formulario sigue abierto, el foco vuelve a Ayuda y la guía se puede repetir. Omitir práctica en otro recorrido debe dejar cerrado el formulario.
3. Abrir una sala, un curso y su editor. Probar participantes, pestaña Alumnos y vista previa, respectivamente. No crear/publicar/invitar durante la prueba.
4. Con alumno ficticio y EN, revisar Agenda, Mensajes, compras vacías e historia. No deben aparecer acciones docentes. La guía no debe reproducir audio, responder ni avanzar la historia.
5. Repetir en móvil y con teclado; activar movimiento reducido. Cambiar idioma/cuenta o navegar mientras la guía está abierta: debe cerrarse y conservar los datos de la pantalla.
6. Completar y recargar: la sugerencia desaparece y Ayuda sigue disponible. Otra cuenta no hereda la finalización.

Reversión: quitar el registro del iniciador del layout y el bundle `TUTORIAL_MESSAGES` de `app.config.ts`; las pantallas conservan su funcionamiento. Los marcadores y las preferencias locales restantes son inertes.

## Validación

- `cd frontend && npm test -- --watch=false`: **586/586 aprobadas**, 81 archivos, incluidas 12 pruebas nuevas de ciclo de vida, práctica, roles, carga, almacenamiento e idioma.
- `cd e2e && npx playwright test --config tutorial.playwright.config.ts`: **24/24 aprobadas**, 12 escenarios en escritorio y móvil. Se recorren las 14 pantallas, la diferencia entre los tres accesos de paquetes, los pasos prácticos, omisión, cierre, foco, navegación, borrador de mensaje, repetición, EN y movimiento reducido. Sin errores JavaScript sin manejar.
- `cd frontend && npm run build`: **aprobado**, dentro del límite de error de tamaño existente. Motor Driver.js y activador contextual con carga diferida.
- `git diff --check`: **aprobado**.

Playwright intercepta toda la API y no inicia backend ni accede a bases de datos o proveedores (SPEC AC20). Las pruebas registran las solicitudes de escritura: las guías no envían mensajes, ofertas, compras, publicaciones ni progreso. En la pizarra se distingue el aviso de presencia preexistente de las operaciones sobre el contenido. Se revisan capturas de las tres pantallas prioritarias y de la guía de agenda. El build conserva las advertencias del proyecto sobre presupuestos de tamaño, Sass y `jsbi`; no se ampliaron presupuestos para esta entrega.
