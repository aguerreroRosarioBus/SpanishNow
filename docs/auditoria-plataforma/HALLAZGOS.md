# Auditoría QA/UX de la plataforma (docente y alumno)

Fecha: 25/11/2026 · Rama `claude/teacher-platform-audit-3efaf2` · Solo revisión, sin cambios de código.

## 1. Resumen
- Entorno: https://localhost:4200 (copia fija de `main`, base `spanishnow_main`). Navegador integrado; para ver errores de red y de consola usé un hook de `fetch`/XHR en la página (solo 4xx/5xx) y la consola.
- Cuentas usadas: docente `admin@gmail.com` (rol `teacher`, `permissions: []`) y alumno `lucas@gmail.com`, contraseña de prueba local. La cuenta de Solange **no entró** con la contraseña de prueba (401, no insistí): por eso no pude ver el panel de una docente con paquetes activos ni la pantalla de «Enviar oferta» con datos. No probé `jane.smith@example.test` ni alumnos de la semilla maestra.
- Tamaños: escritorio 1440x900 y teléfono 390x844 (también un panel de ~541 px por accidente). Idiomas: ES y EN. Se restauró el preset `desktop` al final.
- Pantallas cubiertas (docente): Mis cursos, detalle/gestión de curso (contenido, alumnos, edición de curso, vocabulario, preguntas, quiz, composer de lección, expectativas), Ventas, Órdenes, Cupones (y diálogo nuevo), Afiliados, Comentarios, Gestión de paquetes/paquetes comprados, Paquetes de clases, Grupos y detalle de grupo, Integraciones y Zoom, Agenda (incluye «Proponer una clase» y ayuda), Mensajes (lista y conversación), Oferta nueva, Clases en vivo y pizarra, Ajustes, Maestros, Contacto, `/admin/class-commerce`.
- Pantallas cubiertas (alumno y públicas): login, registro, recuperación y restablecer contraseña, catálogo, detalle de curso, certificado público, afiliado, checkout (éxito/gracias), legales, acerca de, mis cursos, reproductor (historia, audio normal/lento, flashcards, matching, listen-repeat, quiz), progreso, paquetes, agenda, mensajes, compras, ajustes, pizarras, 404/URLs inexistentes.
- NO cubiertas (motivo): crear/editar/borrar contenido y toda acción irreversible (guardar, publicar, cancelar clases, reembolsos, reset de progreso, «Quitar acceso»); formulario de «Nueva oferta» con paquetes y detalle de oferta (`/class-offers/:id`, sin paquetes activos en la cuenta disponible); «Nuevo afiliado»; edición de comentarios/respuesta; `/admin/users` y `/admin/legal` (la cuenta no tiene permiso; el acceso directo reenvió a login); checkout real (Hotmart, externo); registro real; recuperación de contraseña real (correo); `/zoom/sessions/:id` con datos; `/live/join/:code` válido; reserva real de clases; alumnos distintos de `lucas`; dark mode (no existe selector); revisión por Tab completa de todas las pantallas.
- Conteo (31 hallazgos): alta 2, media 13, baja 16. Por rol: docente 14 (0 alta, 5 media, 9 baja), alumno 11 (1 alta, 7 media, 3 baja), comunes 6 (1 alta, 1 media, 4 baja).

## 2. Índice
| ID | Rol | Pantalla / ruta | Tipo | Severidad | Título |
|---|---|---|---|---|---|
| D-01 | Docente | `/teacher/integrations`, `/teacher/integrations/zoom` | funcional | media | Zoom: 403 silencioso y pantalla contradictoria |
| D-02 | Docente | `/admin/class-commerce` | funcional | media | Pantalla en blanco ante 403 |
| D-03 | Docente | `/class-cohorts/:id` | pantalla mal resuelta | media | Detalle de grupo sin estilos ni acciones; no recarga al cambiar de id |
| D-04 | Docente | `/schedule` | pantalla mal resuelta | media | Clases pasadas pendientes con acciones, avisos repetidos y texto mal dirigido |
| D-05 | Docente | `/teacher/class-offers/new` | funcional | baja | Sin conversación: 404 y pantalla vacía |
| D-06 | Docente | `/teacher/class-packages` | pantalla mal resuelta | baja | Vigencia en horas y banners de habilitación |
| D-07 | Docente | `/teacher/coupons` | estilo | baja | Filas de alturas distintas y estado redundante |
| D-08 | Docente | órdenes/cupones/afiliados/ventas (390 px) | pantalla mal resuelta | media | Tablas cortadas sin pista de scroll en móvil |
| D-09 | Docente | `/live/:id` (390 px) | estilo | baja | Pizarra diminuta y descentrada en móvil |
| D-10 | Docente | composer de lección | pantalla mal resuelta | baja | «Borrador · revisión 2» en historia publicada; ayuda siempre encima |
| D-11 | Docente | varias | estilo | baja | Textos mezclados y ayuda inconsistente |
| D-12 | Docente | `/schedule` → Proponer una clase | pantalla mal resuelta | baja | Alumnos sin filtrar, zona vacía, jerga IANA |
| D-13 | Docente | `/messages` | pantalla mal resuelta | baja | Lista sin extracto del mensaje |
| D-14 | Docente | `/teacher/sales` | pantalla mal resuelta | baja | Etiqueta de eje «oct 26» ambigua |
| A-01 | Alumno | cualquier URL inexistente | funcional | alta | Un 404 cierra la sesión |
| A-02 | Alumno | `/student/course/:id/play` | funcional | media | Imágenes rotas (URL absoluta `localhost:3001`, 404 en `/uploads-dev`) |
| A-03 | Alumno | reproductor | funcional | media | «Listen and repeat» ofrecida sin contenido |
| A-04 | Alumno | reproductor (matching/flashcards) | estilo | baja | Escape no cierra Match; contraste bajo |
| A-05 | Alumno | `/student/progress`, reproductor | pantalla mal resuelta | media | «Continue with…» de un curso ya inscrito |
| A-06 | Alumno | `/live` | pantalla mal resuelta | media | Copy de docente y pizarras con nombres de otros alumnos |
| A-07 | Alumno/Docente | `/teachers` | pantalla mal resuelta | media | Expone emails de docentes |
| A-08 | Alumno | `/student/purchases` | pantalla mal resuelta | baja | Compras duplicadas y recibos vacíos |
| A-09 | Alumno | quiz demo | pantalla mal resuelta | baja | Preguntas de ejemplo repetidas |
| A-10 | Alumno/Docente | `/schedule`, `/messages/:id` | funcional | media | Falso aviso de zona por alias IANA; propuestas vencidas |
| A-11 | Alumno | `/class-packages` → `/schedule` | pantalla mal resuelta | media | «Schedule a class» no ofrece acción |
| C-01 | Común | varias | pantalla mal resuelta | baja | Mezcla de tuteo y voseo |
| C-02 | Común | `/contact` | pantalla mal resuelta | baja | Formulario «próximamente» |
| C-03 | Común | `/legal/*` | funcional | alta | Textos legales sin publicar (404) |
| C-04 | Común | `/courses`, `/courses/:slug` | pantalla mal resuelta | media | Títulos duplicados entre docentes y texto en inglés |
| C-05 | Común | `/checkout/thanks` | pantalla mal resuelta | baja | «Pago recibido» sin pago |
| C-06 | Común | `/auth/login` | estilo | baja | Sin foco inicial |

## 3. Fichas
## Fichas (docente)

### D-01 · Integraciones/Zoom: 403 silencioso y pantalla contradictoria
- Ruta: `/teacher/integrations` y `/teacher/integrations/zoom` (escritorio, ES).
- Pasos: entrar con `admin@gmail.com` y abrir «Calendar y Zoom» y luego «Administrar Zoom».
- Observado: `GET /api/integrations/zoom` responde **403** (`{"error":"Zoom: forbidden","code":"forbidden"}`), tres veces en la pantalla de Zoom. En `/teacher/integrations` la tarjeta Zoom queda sin estado (solo el botón «Administrar Zoom», sin «Sin conectar»), mientras Google Calendar sí muestra «Sin conectar». En `/teacher/integrations/zoom` aparece «No tenés permiso para esta acción.» junto a «Clases confirmadas / No hay clases confirmadas.», como si fuera un estado vacío normal.
- Esperado: ocultar o deshabilitar con explicación («Zoom no está habilitado para tu cuenta») o mostrar estado coherente; no hacer 3 llamadas que fallan.
- Sugerencia: condicionar la tarjeta y el enlace a la capacidad del usuario; en la pantalla Zoom reemplazar el estado vacío por el aviso de falta de permiso. Componentes: `features/integrations/integrations.component.ts`, `features/zoom/zoom-card.component.ts`.

### D-02 · `/admin/class-commerce` queda en blanco ante 403
- Ruta: `/admin/class-commerce` (la guarda solo exige sesión).
- Observado: título «Gestión comercial de clases», un párrafo y «Actualizar estado»; nada más. `GET /api/admin/class-provider` → **403** sin mensaje en pantalla.
- Esperado: aviso de acceso denegado o redirección.
- Sugerencia: mostrar el error del 403 y usar guarda por permiso. `features/packages/commerce-admin.component.ts`.

### D-03 · Detalle de grupo (`/class-cohorts/:id`) sin estilos ni acciones
- Ruta: `/class-cohorts/1` (desde «Grupos de clases», escritorio, ES).
- Observado: página de texto plano: sin tarjetas, sin enlace «Volver», sin jerarquía; el botón «Actualizar estado» sin estilo y pegado al estado («Grupo pagado — falta aceptar el horario de la sesión»). El texto dice «enviá las ofertas acordadas» pero no hay botón para hacerlo ni enlace a la conversación. Título «Invitación al grupo» (vista del alumno) también para el docente. Las fechas del grupo 1 y 2 son de octubre (pasadas) y se presentan como «Sesión tentativa».
- Además (verificado con navegación SPA): pasar de `/class-cohorts/3` a `/class-cohorts/1` sin salir del componente deja los datos del grupo 3 (la pantalla lee el id una sola vez).
- Sugerencia: aplicar el patrón de tarjetas del resto, agregar miga/volver y CTA; suscribirse a `paramMap`. `features/packages/` (componente de grupo).

### D-04 · Agenda del docente: clases pasadas pendientes con acciones, avisos repetidos y mensaje mal dirigido
- Ruta: `/schedule` → pestañas «Todos» / «Historial» (docente, ES).
- Observado: «Próximas» → «No hay clases en este período.» pero «Todos» lista clases del 19 y 20 nov (hoy es 25 nov) en estado «Esperando aceptación» con «Responder antes de: 25 de oct de 2026» (plazo vencido hace un mes) y con botones «Proponer otro horario» y «Cancelar clase». «Historial» muestra una clase del 25 nov 07:30 aún «Esperando aceptación». Cada tarjeta repite un aviso amarillo: «Las reglas de zona difieren de la intención guardada… pedí al docente revisar o proponer otro horario» (el lector ES el docente) más un enlace «Confirmar zona» duplicado de la tarjeta de zona de arriba.
- Esperado: estado «Venció» / «No respondida», sin acciones sobre clases pasadas; aviso de zona una sola vez; texto según el rol.
- Sugerencia: derivar el estado visible de `fecha < ahora`; mostrar el aviso de zona a nivel de página y adaptar el texto al rol. `features/schedule/schedule.component.ts`.

### D-05 · Oferta sin conversación: 404 y pantalla vacía
- Ruta: `/teacher/class-offers/new` (sin `?conversationId`).
- Observado: `GET /api/conversations/0` → **404** y texto «Este recurso no está disponible.».
- Sugerencia: si falta `conversationId`, redirigir a `/messages` con un aviso.
- Nota: con `?conversationId=8` la pantalla es correcta pero sin paquetes activos solo muestra «No tenés ningún paquete disponible para ofrecer» (todos los paquetes de `admin@gmail.com` están en Borrador).

### D-06 · Paquetes de clases: vigencia en horas y banners de «habilitación» para quien administra
- Ruta: `/teacher/class-packages` (docente, ES).
- Observado: «Vigencia 720 h transcurridas desde el pago» / «2.160 h» (difícil de leer: son 30 y 90 días). Dos banners «Un administrador debe habilitar a este docente antes de vender.» (Ventas y Consultas por chat) con «Crear paquete» activo. Al cargar, el contador «Tus paquetes 0» y «Cargando…» antes de mostrar 6.
- Sugerencia: formatear en días; deshabilitar «Crear paquete» o explicar el efecto del banner; ocultar el contador hasta cargar.

### D-07 · Cupones: filas de alturas distintas y estado redundante
- Ruta: `/teacher/coupons` (1440 px).
- Observado: las filas con «Todos los cursos» llevan un `<select>` «Curso del link…» incrustado y quedan más altas que las de un curso concreto; el botón del enlace queda desactivado sin explicación en las primeras; un cupón vencido muestra «Inactivo» y «Vencido» a la vez.
- Sugerencia: mover el selector de curso al diálogo del enlace; un solo estado.

## Fichas (comunes)

### C-01 · Mezcla de tuteo y voseo en la interfaz
- Rutas: `/settings` («Administra tu cuenta», «Cambia tu contraseña» frente a «Elegí el idioma», «Buscá por ciudad»), `/teacher/class-packages` («Configurá y activá»), `/schedule` («Revisá esta zona»), `/courses` («Aprende español»).
- Sugerencia: elegir un registro (el producto parece apuntar a voseo rioplatense en lo nuevo) y homogeneizar con la clave I18N.

### C-02 · `/contact`: formulario «próximamente»
- Ruta: `/contact`. El título «Envíanos un mensaje» promete un formulario que no existe («El formulario de contacto estará disponible próximamente»). Sugerencia: ocultar la sección hasta que exista.

### D-08 · Teléfono (390 px): las tablas de Pedidos, Cupones, Afiliados y Ventas se cortan sin pista de desplazamiento
- Rutas: `/teacher/orders`, `/teacher/coupons`, `/teacher/affiliates`, `/teacher/sales` (390x844, ES).
- Observado: la tabla mide 438–1185 px dentro de un contenedor de 390 px; en Pedidos solo se ven «Fecha» y «Comprador»; Monto, Estado y «Detalles» quedan fuera de pantalla y no hay sombra ni indicador de scroll. No hay vista de tarjetas.
- Sugerencia: vista de tarjetas en móvil o sombra/scroll hint; ocultar columnas secundarias. `.data-table` compartido.

### D-09 · Pizarra (`/live/:id`) en móvil: lienzo diminuto y descentrado
- Ruta: `/live/11` a 390 px. El tablero arranca al 18 % de zoom, desplazado a la izquierda (parte fuera de la vista) y la barra de herramientas ocupa casi toda la altura. Sugerencia: «ajustar a pantalla» al abrir, barra de herramientas horizontal en móvil.

### D-10 · Composer de lección: una historia publicada se abre como «Borrador · revisión 2» y la ayuda se superpone cada vez
- Ruta: `/teacher/course/4/manage` → «Componer lección» de «Un encuentro en la plaza: Ana» (publicada).
- Observado: el encabezado dice «Borrador · revisión 2» aunque nadie editó nada y la lista marca «Publicada»; además se abre siempre encima el modal «Cómo construir una lección con historias». No verifiqué si abrir el composer crea una revisión nueva (no pulsé guardar).
- Sugerencia: aclarar el estado («Publicada · editando borrador») y mostrar la ayuda solo la primera vez. Dudas para producto: ¿abrir crea un borrador?

### D-11 · Textos mezclados y ayuda inconsistente en el panel docente
- «Calendar y Zoom» en el menú (mezcla ES/EN); en `/teacher/course/:id/expectations` el bloque «Inglés» aparece antes que «Español» con la UI en español; el botón «Ayuda de esta pantalla» existe en Agenda, Mensajes y Pizarras pero no en `/teacher/dashboard`; en `/schedule` el recorrido de ayuda no resalta el elemento al que se refiere (solo un globo centrado). Baja.

### D-12 · Agenda: formulario «Proponer una clase»
- Ruta: `/schedule` → «Proponer una clase» (panel lateral).
- Observado: el selector «Alumno» lista a los 28 alumnos (incluido «lucas» en minúscula), no solo a los que tienen paquete comprado; «Zona IANA de programación» sale vacía aunque el docente tiene zona (America/Cordoba) y usa jerga («IANA»); en «Pizarra» aparece «QA Miro responsive» duplicada.
- Sugerencia: filtrar alumnos por paquetes disponibles, precargar la zona del docente y quitar «IANA» del rótulo.

### D-13 · Mensajes del docente: la lista no muestra contenido del mensaje
- Ruta: `/messages`. Cada fila dice solo «Aviso del sistema» / «Oferta de clases» / «Propuesta de horario» (sin extracto del último mensaje) y la hora en tipografía muy pequeña; las 11 primeras filas son idénticas salvo el nombre. Sugerencia: mostrar el extracto del último mensaje y la fecha relativa.

### D-14 · Ventas: etiqueta de eje ambigua
- Ruta: `/teacher/sales`. El eje del gráfico mensual dice «oct 26» (octubre de 2026), que se lee como «26 de octubre». Sugerencia: «oct 2026». Con un único mes la barra única también es poco informativa (sin comparación).

## Fichas (alumno)

### A-01 · Un URL desconocido (404) cierra la sesión
- Ruta: cualquier URL inexistente, p. ej. `/nope-404`, con sesión iniciada como alumno (y docente).
- Pasos: iniciar sesión → cambiar la URL a `/nope-404` (recarga o navegación interna).
- Observado: redirige a `/auth/login` y la sesión queda borrada (`localStorage.token` desaparece); no existe pantalla 404. Causa: `path: '**'` redirige a `auth/login` y `LoginComponent` llama a `authService.logout()` en el constructor (`frontend/src/app/features/auth/login/login.component.ts` ~línea 46; `app.routes.ts` línea 267). Mismo efecto al abrir `/auth/login` con sesión.
- Esperado: página 404 con enlace al inicio, sin perder la sesión.
- Severidad alta (un enlace mal copiado o una URL mal escrita saca al usuario).

### A-02 · Imágenes de historia rotas (URL absoluta a `localhost:3001`)
- Ruta: `/student/course/1/play` (Español A1 - Completo, «Juan quiere comprar una bici»), alumno `lucas@gmail.com`, EN.
- Observado: la imagen apunta a `http://localhost:3001/uploads-dev/0a342379-….png` (contenido mixto desde una página https y puerto del API directo); además `GET /uploads-dev/0a342379-….png` por el proxy da **404**. Se muestra el texto alternativo (la historia completa) dentro de la miniatura, con un recuadro enorme.
- Sugerencia: guardar rutas relativas (`/uploads/...`), servir `/uploads-dev` en el proxy y limitar el alt a una descripción corta.

### A-03 · Actividad «Listen and repeat» ofrecida sin contenido
- Ruta: `/student/course/5/play`, bloque «Practice vocabulary», tarjeta «Listen and repeat» → «Practice».
- Observado: el botón está activo pero solo aparece un toast «No listen and repeat activities are available for this story». Esperado: deshabilitar o esconder la tarjeta cuando no hay actividades.

### A-04 · Actividad «Match vocabulary» no se cierra con Escape; baja legibilidad en cabeceras
- Ruta: `/student/course/5/play` → «Match vocabulary». Escape no cierra el modal (sí lo hace en Flashcards); hay que usar la X. Las cabeceras de los modales usan texto oscuro sobre verde (Match) y el texto «Click to see the translation» de la tarjeta naranja casi no se lee (contraste bajo). La imagen de la tarjeta de vocabulario es la portada genérica del curso (relacionado con U22).

### A-05 · «Continue with …» para un curso que el alumno ya tiene
- Rutas: `/student/progress` y fin de cada historia/quiz (`/student/course/5/play`).
- Observado: bloque «Continue with Viajar con confianza… — You are already enrolled in this course. [Go to course]»; el botón lleva a la página pública de venta `/courses/master-1-viajar-con-confianza`, que repite «You already have access to this course. Go to course». Doble salto y mensaje redundante.
- Sugerencia: enlazar directo a `/student/course/:id/play` y cambiar el texto a «Siguiente curso de la serie».

### A-06 · «Live classes» muestra al alumno copy de docente y pizarras con nombres de otros alumnos
- Ruta: `/live` (alumno `lucas@gmail.com`, EN).
- Observado: subtítulo «Your ideas, your students and a board to share.» (texto del docente); lista pizarras llamadas «Conversación guiada · Emma / Oliver / Sofia / Liam / Charlotte / Noah / Emma…» (nombres de otros alumnos) vinculadas a un curso en el que Lucas está inscrito. Verificar si es filtrado por curso (privacidad) o solo datos de demostración.
- Sugerencia: filtrar por pertenencia/invitación y usar subtítulo propio del alumno.

### A-07 · `/teachers` muestra el email de cada docente
- Ruta: `/teachers` (alumno y docente; el anónimo es redirigido a login). Lista «Andres — admin@gmail.com — 7 cursos», «Solange Riff — la cuenta de Solange — 6 cursos». Sugerencia: no exponer emails (usar «Escribir a…» por mensajería interna). Pantalla sin foto/bio ni enlace a sus cursos.

### A-08 · Compras del alumno: filas duplicadas y recibos vacíos
- Ruta: `/student/purchases` (alumno `lucas@gmail.com`). Muestra seis compras (cada curso comprado el 21 y el 22 oct con importes idénticos) y la columna «Receipt» con «—» en todas. En el panel docente solo hay una orden por curso para el otro Lucas. Sugerencia: confirmar si es dato demo; si no, el recibo debería enlazar o decir «No disponible».

### A-09 · Calidad de contenido de ejemplo en quizzes
- `/student/course/5/play` → «Repaso: Personas y rutinas»: las tres preguntas son «¿A quién encuentra Diego?» con opciones «Marta» / «A una persona desconocida» y se repiten con distinto nombre (Pablo, Clara). Es dato de demo; lo anoto porque confunde las pruebas de evaluación.

## Fichas (comunes, públicas)

### C-03 · Textos legales sin publicar
- Rutas: `/legal/terms`, `/legal/privacy`, `/legal/refunds` (enlaces del pie de todas las pantallas). Observado: «Este documento todavía no fue publicado.» y `GET /api/public/legal/*?locale=es` → **404**. Severidad media/alta para producción (registro y compra enlazan estos textos). Sugerencia: publicar los tres antes del lanzamiento o ocultar los enlaces.

### C-04 · Catálogo `/courses` con títulos duplicados entre docentes
- Ruta: `/courses` (anónimo). 10 tarjetas; «Historias cotidianas…», «Primeros pasos…», «Viajar con confianza…», «Conversaciones reales…» aparecen dos veces, una «Por Solange Riff» (slug `master-10-…`) y otra «Por Andres» (`master-1-…`), con la misma portada y descripción. Sin distinguir es imposible elegir. Sugerencia: variar títulos en la semilla o mostrar el docente de forma más visible. La página de curso también mezcla idioma: «Descripción original · inglés» seguido de texto en inglés con la UI en español.

### C-05 · `/checkout/thanks` muestra «Pago recibido» sin pago
- Ruta: `/checkout/thanks` abierta directamente (anónimo): «Payment received — We’ve emailed you how to access your course». Sugerencia: validar el parámetro de la compra o mostrar un mensaje neutro.

### C-06 · Login sin foco inicial
- `/auth/login`: al cargar, el foco queda en «Saltar al contenido»/body, no en el campo email. Baja.

### A-10 · Falso «las reglas de zona difieren»: `America/Cordoba` vs `America/Argentina/Cordoba`
- Rutas: `/schedule` (alumno `lucas@gmail.com`, EN; y el docente `admin@gmail.com`, pestaña «Todos») y `/messages/54`.
- Observado: en las clases «Awaiting acceptance» del 22 nov aparece el aviso amarillo «Time zone rules differ from the saved intention… ask the teacher to review or propose a new time», aunque «Your time · America/Cordoba · UTC-03:00» y «Teacher time · America/Argentina/Cordoba · UTC-03:00» son la misma zona (alias IANA, mismo desfase). Solo se ofrece «Cancel class»; no vi un botón para aceptar (no verificado si el aviso lo bloquea).
- Además: «Respond before: Oct 25, 2026» ya venció hace un mes y la clase del 22 nov ya pasó (hoy es 25 nov), pero sigue «Awaiting acceptance» con «Cancel class».
- Sugerencia: normalizar alias (`Intl.DateTimeFormat().resolvedOptions().timeZone` / tabla de alias) o comparar reglas (desfase y transiciones) en vez de strings; derivar «Venció» por fecha. `features/schedule/schedule.component.ts`.

### A-11 · «Schedule a class» del alumno lleva a una agenda sin acción
- Rutas: `/class-packages` → «Schedule a class» → `/schedule` (alumno, EN).
- Observado: el botón principal de cada paquete («Schedule a class») navega a «Class schedule» con «No classes in this period.» y sin ningún botón para pedir o elegir horario (solo el docente propone). No hay «comprar paquete/saldo» en el área del alumno: solo «New inquiry» en `/messages`.
- Sugerencia: renombrar a «Ver agenda / Pedir horario al docente» (abrir el chat con la oferta) o explicar «Tu docente te propondrá un horario».
- Nota: `Reset progress` (menú «…» de cada curso en `/student/dashboard`) no se probó por ser destructivo.

## Lo que está bien
- Login: mensaje claro para credenciales incorrectas; botón desactivado hasta completar; foco visible al navegar con Tab; Escape cierra los diálogos del docente (cupones, curso, vocabulario, preguntas, composer).
- Panel docente: gestión de curso muy clara (unidades, estados «Publicada», cuenta de preguntas/comentarios, menú «…» ordenado); modales de cupón, curso y vocabulario con jerarquía y validación en línea; chat docente-alumno prolijo.
- Estados de error bien resueltos: curso inexistente, certificado inexistente, afiliado inválido, código de invitación inválido, clase no disponible, conversación inexistente.
- Reproductor del alumno: audio normal/lento reproduce, flashcards, quiz con puntaje mínimo y mejor puntuación; certificados con código verificable.
- ES/EN: las pantallas revisadas (docente y alumno) traducen etiquetas y fechas/importes con el formato de cada idioma (`USD 4.374,12` / `USD 4,374.12`).
- En 390 px ninguna pantalla produce scroll horizontal de la página (las tablas se desplazan dentro de su contenedor, ver D-08).

## Dudas para el dueño del producto
1. ¿La cuenta `admin@gmail.com` debe tener permisos (`users.manage`, `test_users.manage` según `backend/seeds/local-test-accounts.json`) y habilitación de ventas/Zoom? Hoy el login devuelve `permissions: []`, por lo que `/admin/*`, Zoom y ventas de clases dan 403 o estados vacíos (D-01, D-02, D-06).
2. ¿Un URL desconocido debe llevar a login (y cerrar la sesión) o a una página 404? (A-01).
3. ¿El alumno debe poder pedir un horario o solo aceptar los que propone el docente? (A-11).
4. ¿Se muestran emails de docentes en `/teachers`? (A-07).
5. ¿Las pizarras ligadas a un curso son visibles para todo el curso o solo para el alumno/invitados? (A-06).
6. Registro del texto: ¿voseo rioplatense o tuteo neutro en toda la interfaz? (C-01).
7. ¿Abrir el composer de una historia publicada crea una revisión en borrador? (D-10).
8. U22 sigue parcial: las portadas/ilustraciones se repiten en cada párrafo y como imagen de vocabulario (se vio en el reproductor y en flashcards).

## Verificación independiente (25/11/2026)

Andrés pidió comprobar si los hallazgos eran reales o producto de una prueba defectuosa. Se revisaron por separado en el código, en la base `spanishnow_main` y en el navegador. Leyenda: **Confirmado** = reproducido y es defecto de producto; **Artefacto** = el síntoma existe pero lo causa el dato sembrado o el entorno (worker apagado, permisos sin cargar), no el código; **Producto** = el código hace lo que dice, la duda es de decisión; **No verificado** = no lo comprobé todavía.

| ID | Veredicto | Evidencia |
|---|---|---|
| A-01 | **Confirmado** (alta) | `app.routes.ts:267` redirige `**` a `auth/login` y `LoginComponent` llama a `logout()` en el constructor. En el navegador, abrir `/esto-no-existe` borró `token` y `user` de `localStorage`. |
| C-03 | **Artefacto** | `legal_documents` está vacía en `spanishnow_main`; el 404 es la respuesta prevista para «sin publicar». Es una tarea de contenido previa al lanzamiento, no un fallo de código. Los enlaces del pie sí apuntan a páginas vacías hoy. |
| A-10 | **Artefacto** (diagnóstico del informe erróneo) | No es un alias IANA. `classSessionService.js:95-100` compara el instante guardado con el recalculado desde `localStart`+zona. En la base, 69 de 70 sesiones sembradas tienen segundos ≠ 0 (p. ej. `10:30:17` frente a `07:30` −03:00 = `10:30:00`), así que el aviso salta siempre. Las sesiones creadas por la app pasan por `resolveLocalIntent` y no deberían tenerlo. |
| D-04 | **Artefacto** (en gran parte) | 18 propuestas `proposed` ya vencidas. La expiración (`expire()` en `classSessionService.js`) la ejecuta el worker de la cola de salida, que está apagado (`OUTBOX_WORKER` sin definir). Falta comprobar si la lectura debería mostrar «Venció» aun sin worker. |
| D-01 | **Artefacto** + posible fallo de UI | `GET /api/integrations/zoom` → 403 es correcto: `users.permissions` es `NULL` en la base para `admin@gmail.com` y Solange, aunque `local-test-accounts.json` diga otra cosa. Que la pantalla no lo explique no lo comprobé a ojo. |
| D-02 | **Confirmado** (UI) sobre causa de datos | `GET /api/admin/class-provider` → 403 «Missing permission» (por permisos vacíos). La pantalla muestra solo el título y el párrafo, sin aviso. El defecto de producto es el silencio ante el 403. |
| D-03 | **Confirmado** | `/class-cohorts/1` se ve como texto plano sin tarjetas, sin «volver», con el botón sin estilo. Es la pantalla de invitación al grupo. El «no recarga al cambiar de id» no lo verifiqué. |
| D-05 | **Confirmado** (API) | `GET /api/conversations/0` → 404. La pantalla no la miré. |
| D-06 | **Confirmado** | «Vigencia 720 h / 2.160 h transcurridas desde el pago» y dos banners de «Un administrador debe habilitar…» con «Crear paquete» activo. El banner depende de que el docente no esté habilitado. |
| D-08 | **Confirmado** | En 390 px `/teacher/orders`: tabla de 945 px en un contenedor de 348 px con `overflow-x: auto`; solo se ven Fecha y Comprador y no hay pista de desplazamiento. |
| D-13 | **Confirmado** (con matiz) | La lista muestra solo «Aviso del sistema / Oferta de clases / Propuesta de horario». Todos los mensajes sembrados son eventos del sistema; con mensajes de texto reales no lo comprobé. |
| A-02 | **Artefacto** | Solo 3 de 276 bloques de lección tienen `imageUrl` absoluta a `localhost:3001/uploads-dev`; 273 son relativas. `/uploads-dev` es el sustituto local de Cloudinary y el proxy solo cubre `/api`. Guardar una URL absoluta es frágil, pero no afecta a producción. |
| A-06 | **Producto** | `liveClassService.list` muestra a un alumno todas las pizarras no borrador de los cursos en los que está inscrito. Los nombres de otros alumnos vienen de la semilla, que crea una pizarra por alumno ligada al curso. La duda es si eso debe ser visible para todo el curso. |
| A-07 | **Confirmado** (privacidad) | `GET /api/users/teachers` (cualquier usuario autenticado) devuelve `email` de cada docente. Decisión de producto si se mantiene. |
| A-08 | **Artefacto** | Las órdenes 5-7 y 10-12 de Lucas repiten los mismos cursos en dos lotes de semilla (22/10 00:11 y 21:51); `receiptUrl` vacío por ser registros ficticios. |
| C-04 | **Artefacto** | La semilla maestra creó los mismos cinco títulos para los dos docentes (ids 1 y 10). |
| A-09 | **Artefacto** | Preguntas de demostración repetidas (el propio informe lo marcaba). |
| C-05 | **Producto** | Página estática de agradecimiento de Hotmart, sin datos de compra por diseño; mostrar «Pago recibido» al abrirla directo es una decisión de copy. |
| A-03 | **Confirmado** | «Listen and repeat» tiene el botón «Practice» activo; al pulsarlo solo aparece «No listen and repeat activities are available for this story» y no abre nada. |
| A-04 | **Confirmado** (parcial) | Con Escape real el modal «Match vocabulary» sigue abierto. Cabecera con texto oscuro sobre verde. El contraste de la tarjeta naranja no lo medí. |
| A-05 | **Parcial** | En `/student/progress` «Go to course» enlaza directo a `/student/course/5/play`, no a la página de venta como decía el informe (no hay doble salto ahí). Se confirma solo el texto redundante «Continue with… You are already enrolled in this course». El final de historia/quiz no lo revisé. |
| A-11 | **Confirmado** (etiqueta) | «Schedule a class» enlaza a `/schedule`, y la agenda del alumno solo trae zona, filtros y fechas, sin acción para pedir un horario. Que el alumno deba poder pedirlo es decisión de producto; el rótulo promete algo que la pantalla no ofrece. |
| C-01 | **Confirmado** | Voseo en 6 archivos (28 líneas: agenda, paquetes, Calendar, Zoom, promociones y `visual.ts`) frente a tuteo en el resto (96 líneas). |
| C-02 | **Confirmado** | `/contact`: «Envíanos un mensaje» y debajo «El formulario de contacto estará disponible próximamente»; los correos se ven. Los correos son `@spanishnow.com`; conviene confirmar el dominio real (no verificado). |
| C-06 | **Confirmado** | En `/auth/login` el foco queda en `BODY`, sin `autofocus`. |
| D-07 | **Confirmado** (parcial) | En `/teacher/coupons` las filas «Todos los cursos» llevan un selector incrustado y quedan más altas que la de un curso concreto (se ve en la captura). No comprobé el estado «Inactivo + Vencido». |
| D-09 | **Confirmado** | `/live/11` a 390 px: el lienzo arranca al 18 % de zoom y la barra de herramientas vertical ocupa casi toda la altura. |
| D-10 | **Confirmado** el comportamiento, **con efecto secundario** | `GET /story/:id/draft` crea una revisión en borrador al abrir el compositor: el plan 117 (historia 13, revisión 2, `draft`) se creó el 25/11 durante la auditoría. Por eso un relato publicado muestra «Borrador · revisión 2». Hay 23 borradores en la base. La ayuda «siempre encima» no se reproduce por código: se muestra solo hasta cerrarla (clave `spanishnow.lesson-tutorial.<id>.v1`). |
| D-11 | **Confirmado** (parcial) | El menú dice «Calendar y Zoom» y «Pedidos», pero la pantalla se titula «Órdenes». El panel docente no tiene botón de ayuda. El resto no lo comprobé. |
| D-12 | **Confirmado** | El selector «Alumno» lista los 28 alumnos; «Zona IANA de programación» sale vacía y con jerga; la pizarra «QA Miro responsive» aparece duplicada (dato). |
| D-14 | **Confirmado** | El eje del gráfico mensual dice «oct 26». |

Conclusión (31 de 31 revisados): 20 se confirman, total o parcialmente (A-01, A-03, A-04, A-07, A-11, C-01, C-02, C-06, D-02 UI, D-03, D-05, D-06, D-07, D-08, D-09, D-10, D-11, D-12, D-13, D-14); 8 se explican por datos de semilla o entorno (C-03, A-10, D-04, D-01, A-02, A-08, C-04, A-09); 2 son decisiones de producto (A-06, C-05); 1 se confirma solo en parte (A-05).

## Decisiones tomadas por sentido común (25/11/2026)

Andrés delegó las decisiones de producto de este informe. Criterio: lo más seguro por defecto, el cambio más pequeño que resuelve el problema y no tocar reglas de dinero, zonas horarias ni D01–D10. Quedan registradas como propuesta; si Andrés las revierte, se actualiza esta sección.

| Tema | Decisión | Por qué |
|---|---|---|
| A-01 URL inexistente | Página 404 propia, con enlaces a inicio y a «Mis cursos» o «Iniciar sesión» según haya sesión. La sesión no se cierra. Entrar a `/auth/login` a propósito sigue descartando la sesión anterior. | Un enlace mal copiado no debe sacar a nadie. El `logout()` del login es útil (evita mostrar a otro usuario), así que solo se cambia a dónde cae `**`. |
| A-07 emails de docentes | `/api/users/teachers` deja de devolver `email` a los alumnos. Se muestra nombre, cursos y un botón «Escribir» por mensajería interna. El email solo lo ve el propio docente y quien administra. | Privacidad por defecto y el producto ya tiene chat para consultas. |
| A-06 pizarras de curso | Un alumno solo ve las pizarras en las que es miembro. Las pizarras de un curso no se muestran a todos los inscritos por defecto. Compartir con todo el curso, si hace falta, será una opción explícita del docente. | Una pizarra «Conversación guiada · Emma» no debe verla Lucas. Se coordina con #68 (pizarra, en revisión) antes de tocarla. |
| A-11 y agenda del alumno | Se mantiene la regla de que propone el docente. El botón pasa a «Ver agenda» y la agenda vacía explica «Tu docente te propondrá un horario» con acceso al chat con ese docente. | No se cambia el flujo de negocio; se corrige la promesa del rótulo. |
| C-01 tuteo o voseo | Tuteo neutro en toda la interfaz en español. Se convierten las 28 líneas con voseo. | Es el registro de la mayoría (96 líneas) y de lo que ya ven los alumnos de habla inglesa. Es el cambio más pequeño. |
| D-10 compositor | Abrir el compositor no crea una revisión. El borrador se crea al primer guardado, y una historia publicada se muestra «Publicada» hasta entonces. | Abrir una pantalla no debe escribir datos. Requiere tocar `lessonPlan.routes.js` y su prueba de concurrencia, por lo que va con revisión. |
| C-05 agradecimiento | `/checkout/thanks` no dice «Pago recibido». Dice «Gracias» y que, si se completó la compra, llegará un correo con el acceso. | La página no tiene datos de la compra; no debe afirmar lo que no sabe. |
| C-03 legales | No se ocultan los enlaces. Publicar los tres textos con el flujo de administración es una tarea de contenido previa al lanzamiento y se agrega a la lista de lanzamiento. | Ocultar legales sería peor que mostrarlos en preparación. Los textos los define Andrés o su asesor. |
| C-02 contacto | Se oculta «Envíanos un mensaje» hasta que exista el formulario y se dejan los correos. Hay que confirmar si los correos deben ser `@spanishnow.com` o del dominio real. | No prometer lo que no existe. |
| D-04 clases vencidas | La lectura muestra «Venció» y quita acciones cuando el plazo pasó, aunque el worker no haya expirado la propuesta. | La pantalla no debe depender de un worker para no mentir. |
| D-01, D-02 permisos | Ante 403 se muestra «Tu cuenta no tiene este permiso. Pídelo a quien administra» y se oculta el enlace si no hay permiso. | Silencio en blanco es lo peor para quien usa la pantalla. |
| D-11 nombres | «Pedidos» en menú y título, «Calendar y Zoom» pasa a «Calendario y Zoom», y el panel docente gana botón de ayuda. | Un solo nombre por pantalla. |
| Resto de pulido | D-03 estilos y «Volver», D-05 redirigir a Mensajes sin conversación, D-06 vigencia en días y botón «Crear paquete» explicado, D-07 selector de curso al diálogo del enlace, D-08 tablas móviles con tarjetas o sombra de desplazamiento, D-09 «ajustar a pantalla» al abrir, D-12 alumnos con paquete y zona precargada, D-13 extracto en la lista, D-14 «oct 2026», A-03 ocultar tarjeta sin actividades, A-04 Escape cierra, A-05 texto «Siguiente curso», C-06 foco inicial. | Son correcciones sin decisión de negocio. |
| Artefactos de datos | En la semilla: sesiones con segundos en 0, permisos de `admin@gmail.com` cargados, sin duplicar órdenes, nombres de curso distintos entre docentes. En el entorno de pruebas: encender `OUTBOX_WORKER=1` en un `.env` de pruebas, nunca en el de la copia fija sin avisar. | Estos 8 hallazgos no son defectos del producto; la prueba debe reflejar el uso real. |

### Orden propuesto de trabajo (un implementador a la vez)
1. **Lote 1, seguridad y sesión:** A-01, A-07, A-06 (tras #68), D-01/D-02.
2. **Lote 2, honestidad de pantallas:** D-04, D-10, C-05, A-11, A-03, C-02, D-03, D-05.
3. **Lote 3, pulido:** C-01 y el resto de la fila «Resto de pulido».
4. **Lote 4, semilla y entorno:** los 8 artefactos, más repetir la auditoría en una base clonada con permisos y worker activos. La auditoría original no vio que el entorno tuviera permisos vacíos, segundos en las sesiones y el worker apagado, así que atribuyó a la app lo que causaban los datos.

## Estado de los arreglos (25/11/2026)

| Lote | Hallazgos | PR | Estado |
|---|---|---|---|
| 1 · sesión y privacidad | A-01, A-07, D-01, D-02 | #103 | Mergeado |
| 2 · honestidad de pantallas | D-03, D-04, D-05, D-10, C-05, C-02, A-03, A-11 | #106 | Mergeado |
| 3 · pulido | C-01, D-06, D-07, D-08, D-12, D-13, D-14, A-04, A-05, C-06 | #107 | Mergeado |
| 4 · semilla y entorno | C-03 (solo la tarea de contenido), A-10, D-04 (dato), D-01 (dato), A-02, A-08, C-04, A-09 | Ver el PR del Lote 4 | En curso |

Pendientes sin lote: **D-09** (pizarra en móvil) y **A-06** (pizarras visibles solo para sus miembros), ambos a la espera de #68; **D-11** (nombres del menú y ayuda del panel docente), sin lote asignado. La segunda pasada de la auditoría, con una base clonada, permisos cargados y el worker activo, cubrirá los flujos que esta no pudo ejecutar (guardar, publicar, cancelar, reembolsar, ofertas con datos).
