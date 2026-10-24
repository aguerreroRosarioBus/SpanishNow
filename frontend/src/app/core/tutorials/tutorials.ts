import { TutorialDefinition, TutorialStep, TutorialText } from './tutorial.model';

const s = (id: string, target: string, title: TutorialText, description: TutorialText,
  extra: Partial<TutorialStep> = {}): TutorialStep => ({ id, target, title, description, ...extra });

/** Primero los contextos más específicos: el editor abierto reemplaza la guía del curso. */
export const TUTORIALS: readonly TutorialDefinition[] = [
  {
    id: 'composer', root: 'app-lesson-composer .composer-dialog', roles: ['teacher'],
    title: ['Diseñar una lección', 'Design a lesson'],
    purpose: ['Aquí organizas cómo el alumno descubre una historia: expresiones, fragmentos, preguntas y práctica. Los cambios del borrador llegan al alumno cuando publicas.', 'Here you plan how students discover a story: expressions, fragments, questions and practice. Draft changes reach students when you publish.'],
    steps: [
      s('before', '[data-phase="before"] .phase-heading', ['Preparar la comprensión', 'Prepare for understanding'], ['Antes presenta las expresiones que el alumno necesitará. Añádelas desde el vocabulario de la unidad.', 'Before introduces the expressions students will need. Add them from the unit vocabulary.']),
      s('during', '[data-phase="during"] .phase-heading', ['Contar y comprobar', 'Tell and check'], ['Durante alterna fragmentos de historia y preguntas sobre lo que el alumno ya leyó. El orden de los bloques determina el recorrido.', 'During alternates story fragments with questions about what students have already read. Block order determines the learning path.']),
      s('after', '[data-phase="after"] .phase-heading', ['Volver a la historia', 'Return to the story'], ['Después reúne la lectura completa y los refuerzos. Más adelante prepara la reaparición de expresiones en otra historia.', 'After brings together the full reading and reinforcement. Later prepares expressions to reappear in another story.']),
      s('try-preview', '[data-tour="composer-preview"]', ['Prueba la vista del alumno', 'Try the student preview'], ['Pulsa Vista previa para explorar el resultado sin publicar ni cambiar el progreso de un alumno.', 'Click Preview to explore the result without publishing or changing student progress.'], { practice: { event: 'click', ready: '#side-panel-preview' } }),
      s('preview', '#side-panel-preview', ['Revisar antes de publicar', 'Review before publishing'], ['Esta simulación permite revisar la secuencia y las preguntas. Puedes volver a las otras pestañas para consultar la historia y la lista TPRS.', 'This simulation lets you review the sequence and questions. Return to the other tabs to consult the story and TPRS checklist.']),
      s('save', '.composer-footer .footer-actions', ['Borrador y publicación', 'Draft and publication'], ['Guardar borrador conserva tu trabajo. Publicar crea la revisión para alumnos; revisa el contenido antes de hacerlo.', 'Save draft preserves your work. Publish creates the student revision; review the content before doing so.']),
    ],
  },
  {
    id: 'schedule', root: 'app-schedule .schedule-page', roles: ['student', 'teacher'],
    title: ['Entender tu agenda', 'Understand your schedule'],
    purpose: ['Aquí consultas propuestas y clases confirmadas. El docente propone el horario y cada participante revisa su fecha y hora antes de aceptar.', 'Here you review proposals and confirmed classes. The teacher proposes a time and each participant checks their date and time before accepting.'],
    steps: [
      s('zone', '.zone-box', ['Primero, tu zona horaria', 'First, your time zone'], ['Comprueba tu zona y confírmala cuando corresponda. El idioma y la zona son preferencias independientes; cambiar la zona no reprograma una clase.', 'Check your zone and confirm it when needed. Language and time zone are separate preferences; changing the zone does not reschedule a class.']),
      s('try-proposal', '[data-testid="open-schedule-form"]', ['Explora una propuesta', 'Explore a proposal'], ['Pulsa Proponer una clase para conocer el formulario. Abrirlo no envía nada y puedes volver sin confirmar.', 'Click Propose a class to explore the form. Opening it sends nothing and you can go back without confirming.'], { role: 'teacher', practice: { event: 'click', ready: '[data-testid="schedule-form"]' } }),
      s('proposal', '[data-testid="schedule-form"]', ['Elegir y revisar', 'Choose and review'], ['Selecciona alumno y paquete, o grupo, y completa fecha, zona y duración. Revisa la vista previa; solo el botón de enviar crea la propuesta.', 'Choose a student and package, or a group, and enter date, zone and duration. Review the preview; only the submit button creates the proposal.'], { role: 'teacher' }),
      s('dates', '.date-filters', ['Encontrar una clase', 'Find a class'], ['El intervalo limita las clases que ves. Aplica el filtro después de elegir fechas, o límpialo para volver al listado habitual.', 'The range limits the classes you see. Apply it after choosing dates, or clear it to return to the usual list.']),
      s('classes', '.class-list', ['Propuesta o clase confirmada', 'Proposal or confirmed class'], ['Consulta el estado de cada tarjeta. Una propuesta requiere respuesta; una reprogramación pendiente mantiene el horario original hasta aceptarse. Si no hay clases, acuerda el próximo paso por Mensajes.', 'Check each card status. A proposal needs a response; a pending reschedule keeps the original time until accepted. If there are no classes, agree on the next step in Messages.']),
    ],
  },
  {
    id: 'live-room', root: 'app-live-room .live-room:has(.board-header)', roles: ['teacher', 'student'],
    title: ['Orientarte en el aula', 'Find your way around the classroom'],
    purpose: ['Esta es la pizarra compartida de la clase. El docente controla la sesión y los permisos; los alumnos participan cuando la edición está habilitada.', 'This is the shared class whiteboard. The teacher controls the session and permissions; students participate when editing is enabled.'],
    steps: [
      s('saved', '.save-state', ['Comprobar el guardado', 'Check saving'], ['Aquí se indica si los cambios están guardados o pendientes. Si aparece un problema de conexión, revisa los avisos antes de salir.', 'This shows whether changes are saved or pending. If a connection problem appears, review the notices before leaving.']),
      s('tools', '.board-toolbar', ['Elegir una herramienta', 'Choose a tool'], ['Selecciona, escribe o dibuja desde esta barra. Los controles deshabilitados indican que esa acción no está disponible; esta guía no dibuja sobre la pizarra.', 'Select, write or draw from this toolbar. Disabled controls mean an action is unavailable; this guide does not draw on the board.']),
      s('view', '.zoom-controls', ['Moverte sin editar', 'Move without editing'], ['Usa el zoom y el ajuste de vista para orientarte. La herramienta mano permite desplazarte por el espacio.', 'Use zoom and fit view to get oriented. The hand tool lets you move around the workspace.']),
      s('try-people', '.collaborators', ['Abre Participantes', 'Open Participants'], ['Pulsa el contador de participantes para ver quién está en la sala. Abrir el panel no invita a nadie ni cambia permisos.', 'Click the participant count to see who is in the room. Opening the panel does not invite anyone or change permissions.'], { practice: { event: 'click', ready: '.room-panel' } }),
      s('people', '.room-panel', ['Consultar y volver', 'Check and return'], ['El panel muestra sus opciones según tu rol. Ciérralo para volver a toda la pizarra; compartir enlaces o cambiar permisos son acciones separadas.', 'The panel shows options for your role. Close it to return to the full board; sharing links and changing permissions are separate actions.']),
    ],
  },
  {
    id: 'player', root: 'app-story-player .player', roles: ['student'],
    title: ['Aprender con una historia', 'Learn with a story'],
    purpose: ['Aquí aprendes siguiendo una historia paso a paso: comprendes expresiones, lees o escuchas fragmentos y respondes preguntas.', 'Here you learn by following a story step by step: understand expressions, read or listen to fragments and answer questions.'],
    steps: [
      s('index', '.player__index', ['Tu recorrido por el curso', 'Your path through the course'], ['El índice muestra unidades, historias y su estado. Los candados indican contenido que todavía no está disponible; consulta la indicación de desbloqueo.', 'The index shows units, stories and their status. Locks indicate content that is not available yet; check the unlock hint.']),
      s('steps', '.steps', ['Ubicarte en la historia', 'Find your place in the story'], ['La barra indica el bloque actual y tu avance en esta historia. Responde las preguntas del recorrido para continuar.', 'The bar shows the current block and your progress in this story. Answer the questions along the way to continue.']),
      s('audio', 'app-lesson-audio-controls', ['Escuchar a tu ritmo', 'Listen at your own pace'], ['Cuando hay audio puedes pausar, volver atrás y repetir un tramo. Escuchar por sí solo no completa la historia.', 'When audio is available you can pause, go back and repeat a section. Listening alone does not complete the story.']),
      s('try-repeat', 'app-lesson-audio-controls details summary', ['Explora la repetición', 'Explore repetition'], ['Abre Repetir fragmento A–B para ver sus controles. Abrirlos no reproduce audio ni cambia tu progreso.', 'Open Repeat A–B segment to see its controls. Opening them does not play audio or change your progress.'], { practice: { event: 'click', ready: 'app-lesson-audio-controls details[open] .bounds' } }),
      s('navigation', '.lesson-foot', ['Continuar cuando estés listo', 'Continue when ready'], ['Anterior permite repasar. El botón principal avanza o finaliza la historia según el paso; la guía no lo pulsa por ti.', 'Previous lets you review. The main button advances or finishes the story depending on the step; the guide does not click it for you.']),
      s('practice', 'app-reinforcements', ['Reforzar lo aprendido', 'Reinforce what you learned'], ['Aquí encontrarás las actividades de refuerzo que el docente haya preparado. Su disponibilidad depende de la lección.', 'Here you will find the reinforcement activities your teacher prepared. Availability depends on the lesson.']),
    ],
  },
  {
    id: 'course', root: 'app-course-manage .page-container:has(app-unit-list), app-course-manage .page-container:has(app-students-panel)', roles: ['teacher'],
    title: ['Organizar tu curso', 'Organize your course'],
    purpose: ['Aquí estructuras el curso en unidades e historias y gestionas sus alumnos. Cada historia tiene su propio editor de lección.', 'Here you structure the course into units and stories and manage students. Each story has its own lesson editor.'],
    steps: [
      s('sections', '.filter-chips', ['Contenido y alumnos', 'Content and students'], ['Estas pestañas separan la organización del contenido y la gestión de inscripciones.', 'These tabs separate content organization from enrollment management.']),
      s('try-students', '[data-tour="course-students"]', ['Explora los alumnos', 'Explore students'], ['Abre Alumnos para conocer el panel. Cambiar de pestaña no modifica inscripciones.', 'Open Students to explore the panel. Switching tabs does not change enrollments.'], { practice: { event: 'click', ready: 'app-students-panel' } }),
      s('students', 'app-students-panel', ['Gestionar con contexto', 'Manage with context'], ['Aquí consultas los inscritos y sus opciones de acceso. Revisa cada acción antes de guardar cambios o enviar invitaciones.', 'Here you review enrolled students and access options. Review each action before saving changes or sending invitations.']),
      s('units', 'app-unit-list', ['De unidad a lección', 'From unit to lesson'], ['Cada unidad agrupa historias y recursos. Abre el editor de una historia para ordenar sus expresiones, fragmentos y preguntas; allí hay otra guía.', 'Each unit groups stories and resources. Open a story editor to arrange expressions, fragments and questions; another guide is available there.']),
    ],
  },
  {
    id: 'purchases', root: 'app-class-purchases .page-container', roles: ['student', 'teacher'],
    title: ['Entender los paquetes comprados', 'Understand purchased packages'],
    purpose: ['Aquí consultas las compras de clases, su saldo y vigencia. Un paquete de clases tiene su propio seguimiento, separado de los cursos de historias.', 'Here you review class purchases, credits and validity. Class packages have their own tracking, separate from story courses.'],
    steps: [
      s('balance', '.purchase-card .balance', ['Disponible no es lo mismo que total', 'Available is different from total'], ['El saldo disponible indica cuántas clases quedan para reservar. Las reservadas, utilizadas, vencidas y reembolsadas se muestran aparte cuando corresponda.', 'Available credits show how many classes remain to book. Reserved, used, expired and refunded credits appear separately when relevant.']),
      s('expiry', '.purchase-card .expiry', ['Revisar la vigencia', 'Check validity'], ['Consulta la fecha de vencimiento y el detalle de hora y zona. Las condiciones pertenecen a esta compra y no cambian al editar el catálogo.', 'Check the expiry date and its time and zone details. These conditions belong to this purchase and do not change when the catalog is edited.']),
      s('actions', '.purchase-card .card-actions', ['Elegir el próximo paso', 'Choose the next step'], ['Desde aquí puedes ir a la agenda, consultar la oferta o conversar sobre la continuidad. Renovar genera una compra nueva; no hay débito automático.', 'From here you can open the schedule, review the offer or discuss continuing. Renewal creates a new purchase; there is no automatic debit.']),
      s('history', '.purchase-card .card-details', ['Consultar los movimientos', 'Review transactions'], ['El historial explica los movimientos de saldo de esta compra. Abrir o cerrar el detalle solo cambia la vista.', 'History explains credit transactions for this purchase. Opening or closing it only changes the view.']),
    ],
  },
  {
    id: 'catalog', root: 'app-package-catalog .page-container', roles: ['teacher'],
    title: ['Preparar paquetes para ofrecer', 'Prepare packages to offer'],
    purpose: ['Este catálogo contiene las plantillas de tus paquetes. Prepararlas aquí permite enviar después una oferta concreta desde una conversación.', 'This catalog holds your package templates. Preparing them here lets you send a specific offer from a conversation later.'],
    steps: [
      s('sales', 'section[aria-labelledby="salesTitle"]', ['Estado de nuevas ventas', 'New sales status'], ['Pausar ventas afecta las ofertas nuevas. Los compromisos ya existentes conservan su seguimiento.', 'Pausing sales affects new offers. Existing commitments keep their tracking.']),
      s('templates', '.row', ['Plantillas y versiones', 'Templates and versions'], ['Cada tarjeta muestra precio, sesiones y estado. Completa las plantillas incompletas antes de usarlas en una oferta.', 'Each card shows price, sessions and status. Complete unfinished templates before using them in an offer.']),
      s('try-edit', '[data-tour="catalog-edit"]:not([disabled])', ['Explora una plantilla', 'Explore a template'], ['Pulsa Editar para revisar los campos. Abrir el editor no guarda cambios ni envía una oferta.', 'Click Edit to review the fields. Opening the editor does not save changes or send an offer.'], { practice: { event: 'click', ready: '[data-tour="catalog-editor"]' } }),
      s('editor', '[data-tour="catalog-editor"]', ['Guardar una versión nueva', 'Save a new version'], ['Revisa nombres, condiciones y configuración de cobro. Guardar crea una versión; las compras y ofertas anteriores conservan sus condiciones.', 'Review names, conditions and payment configuration. Saving creates a version; previous purchases and offers retain their conditions.']),
    ],
  },
  {
    id: 'offer-create', root: 'app-offer-create .page-container', roles: ['teacher'],
    title: ['Preparar una oferta personal', 'Prepare a personal offer'],
    purpose: ['Aquí preparas una oferta para la persona de la conversación. Revisa destinatario, paquete y condiciones antes de enviarla.', 'Here you prepare an offer for the person in the conversation. Review the recipient, package and conditions before sending.'],
    steps: [
      s('choose', '#packageChoice', ['Elegir el paquete', 'Choose the package'], ['Selecciona una plantilla activa para ver el resumen. La selección todavía no envía la oferta.', 'Select an active template to see its summary. Selecting it does not send the offer.'], { practice: { event: 'change', ready: 'article' } }),
      s('empty', '[data-testid="offer-empty"]', ['Preparar el catálogo primero', 'Prepare the catalog first'], ['Si no hay opciones, abre el catálogo y completa una plantilla activa. Después vuelve a esta conversación para preparar la oferta.', 'If there are no options, open the catalog and complete an active template. Then return to this conversation to prepare the offer.']),
      s('review', 'article', ['Revisar antes de enviar', 'Review before sending'], ['Comprueba precio, sesiones, duración y condiciones. Enviar oferta la comparte con el alumno; la guía se detiene antes de esa acción.', 'Check price, sessions, duration and conditions. Send offer shares it with the student; the guide stops before that action.']),
    ],
  },
  {
    id: 'offer-detail', root: 'app-offer-detail .page-container', roles: ['student', 'teacher'],
    title: ['Revisar una oferta', 'Review an offer'],
    purpose: ['Esta pantalla reúne las condiciones de una oferta concreta y su estado. Revísalas antes de continuar al pago o gestionar la oferta.', 'This screen brings together the conditions and status of a specific offer. Review them before continuing to payment or managing the offer.'],
    steps: [
      s('summary', 'article', ['Una propuesta con condiciones propias', 'An offer with its own conditions'], ['El resumen incluye precio, sesiones, vencimiento y versiones. Si cambian las condiciones se necesita otra oferta; no se reescribe esta.', 'The summary includes price, sessions, expiry and versions. Changed conditions require another offer; this one is not rewritten.']),
      s('conditions', 'dl', ['Entender qué incluye', 'Understand what is included'], ['Lee expectativas, reglas y documentos vinculados. Ante dudas, vuelve a la conversación antes de aceptar o pagar.', 'Read expectations, rules and linked documents. If unsure, return to the conversation before accepting or paying.']),
      s('consent', 'app-legal-consent', ['Tu revisión antes del pago', 'Your review before payment'], ['La aceptación de documentos es una decisión tuya. Este tutorial no marca casillas ni inicia pagos.', 'Accepting documents is your decision. This tutorial does not check boxes or start payments.'], { role: 'student' }),
    ],
  },
  {
    id: 'groups', root: 'app-package-groups .page-container', roles: ['teacher'],
    title: ['Formar un grupo', 'Form a group'],
    purpose: ['Aquí reúnes participantes alrededor de un paquete grupal y un horario tentativo. El grupo necesita completar sus confirmaciones antes de agendarse.', 'Here you bring participants together around a group package and tentative time. The group needs to complete its confirmations before scheduling.'],
    steps: [
      s('package', '#groupPackage', ['Elegir la modalidad', 'Choose the format'], ['Selecciona un paquete grupal y revisa cuántas plazas incluye y cómo se cobra.', 'Select a group package and review how many seats it includes and how it is billed.']),
      s('instant', '#groupInstant', ['Proponer un instante inequívoco', 'Propose an unambiguous time'], ['El campo requiere una fecha y hora con desplazamiento UTC, como el ejemplo visible. Acuerda primero el horario con los participantes.', 'The field requires a date and time with a UTC offset, as shown in the example. Agree on the time with participants first.']),
      s('members', 'fieldset', ['Identificar a los participantes', 'Identify participants'], ['Selecciona a las personas con las que ya tienes conversación. Crear el grupo inicia su formación; no equivale a una clase confirmada.', 'Select people you already have a conversation with. Creating a group starts its formation; it does not mean a class is confirmed.']),
    ],
  },
  {
    id: 'integrations', root: 'app-integrations .integrations', roles: ['teacher'],
    title: ['Conectar tus herramientas', 'Connect your tools'],
    purpose: ['Aquí consultas la conexión de Calendar y Zoom. Sus estados ayudan a detectar qué falta para sincronizar las clases.', 'Here you review Calendar and Zoom connections. Their statuses help identify what is missing to synchronize classes.'],
    steps: [
      s('zoom', 'app-zoom-summary', ['Videollamadas', 'Video calls'], ['Zoom permite gestionar los enlaces de las sesiones. Revisa su estado y abre su configuración si necesita atención.', 'Zoom manages session links. Check its status and open its settings if attention is needed.']),
      s('calendar', 'app-calendar-card', ['Eventos y ocupación', 'Events and busy times'], ['Calendar mantiene eventos vinculados a las clases y permite consultar ocupación según los permisos concedidos. Conectar requiere tu autorización externa.', 'Calendar maintains events linked to classes and can check busy times according to granted permissions. Connecting requires your external authorization.']),
    ],
  },
  {
    id: 'messages', root: 'app-chat-inbox .page-container', roles: ['student', 'teacher'],
    title: ['Encontrar una conversación', 'Find a conversation'],
    purpose: ['Mensajes reúne tus conversaciones privadas para acordar clases y consultar ofertas. Los mensajes de personas se conservan en su idioma original.', 'Messages brings together your private conversations to arrange classes and discuss offers. Human messages remain in their original language.'],
    steps: [
      s('new', '.new-chat', ['Empezar por un docente', 'Start with a teacher'], ['Elige al docente y pulsa Iniciar conversación cuando quieras contactarlo. La guía no crea conversaciones por ti.', 'Choose a teacher and click Start conversation when you want to contact them. The guide does not create conversations for you.'], { role: 'student' }),
      s('list', '.inbox, .state-box', ['Leer el contexto', 'Read the context'], ['Las filas muestran la otra persona, el último mensaje y los no leídos. Abre una para continuar; si está vacío, todavía no hay conversaciones para mostrar.', 'Rows show the other person, the latest message and unread messages. Open one to continue; if empty, there are no conversations to show yet.']),
    ],
  },
  {
    id: 'conversation', root: 'app-chat-conversation .chat-page:has(.chat)', roles: ['student', 'teacher'],
    title: ['Acordar el próximo paso', 'Agree on the next step'],
    purpose: ['Aquí conversas con una persona y consultas las ofertas o propuestas vinculadas. Conversar sobre un horario no lo confirma en la agenda.', 'Here you talk with one person and review linked offers or proposals. Discussing a time does not confirm it in the schedule.'],
    steps: [
      s('actions', '.chat__actions', ['Conversación, oferta y agenda', 'Conversation, offer and schedule'], ['Usa Agenda para consultar clases. Si eres docente y está disponible, Enviar oferta abre la preparación de un paquete para esta persona.', 'Use Schedule to review classes. If you are a teacher and it is available, Send offer opens package preparation for this person.']),
      s('history', '.chat__scroll', ['Mensajes y eventos', 'Messages and events'], ['El historial combina mensajes con eventos del proceso. Revisa la tarjeta de una oferta o propuesta para conocer su estado vigente.', 'History combines messages with process events. Review the offer or proposal card to check its current status.']),
      s('compose', 'textarea', ['Escribir sin enviar por accidente', 'Write without sending accidentally'], ['Redacta tu mensaje y revísalo antes de enviarlo. El tutorial no escribe ni envía mensajes y conserva tu borrador al cerrarse.', 'Draft your message and review it before sending. The tutorial does not write or send messages and preserves your draft when closed.']),
    ],
  },
  {
    id: 'live-list', root: 'app-live-classes .live-list', roles: ['student', 'teacher'],
    title: ['Encontrar tu aula en vivo', 'Find your live classroom'],
    purpose: ['Aquí encuentras las salas y pizarras de clases en vivo. Una sala de trabajo y una cita de la agenda cumplen funciones distintas.', 'Here you find live class rooms and whiteboards. A workspace room and a scheduled appointment serve different purposes.'],
    steps: [
      s('join', '.join-form', ['Entrar con una invitación', 'Join with an invitation'], ['Si tu docente te dio un código o enlace, úsalo aquí. La guía no se une a ninguna sala por ti.', 'If your teacher gave you a code or link, use it here. The guide does not join a room for you.'], { role: 'student' }),
      s('try-create', '[data-tour="live-create"]', ['Explora una sala nueva', 'Explore a new room'], ['Pulsa Nueva clase para ver los campos. Abrir el formulario no crea una sala ni inicia una sesión.', 'Click New class to see the fields. Opening the form does not create a room or start a session.'], { role: 'teacher', practice: { event: 'click', ready: '.create-form' } }),
      s('create', '.create-form', ['Preparar antes de empezar', 'Prepare before starting'], ['El título identifica la sala y el curso es opcional. Crear guarda una sala; el inicio de la sesión se gestiona dentro del aula.', 'The title identifies the room and the course is optional. Create saves a room; starting the session is managed inside the classroom.'], { role: 'teacher' }),
      s('filters', '.live-filters', ['Distinguir estados', 'Distinguish statuses'], ['Filtra las salas en vivo, los borradores o las finalizadas. Una sala finalizada permite consultar lo trabajado según tu acceso.', 'Filter live rooms, drafts or ended rooms. An ended room lets you review work according to your access.']),
      s('library', '.live-grid, .empty-live', ['Abrir tu espacio de trabajo', 'Open your workspace'], ['Abre una tarjeta para entrar a su pizarra. Si todavía no hay salas, el docente puede preparar una o el alumno entrar con una invitación.', 'Open a card to enter its whiteboard. If there are no rooms yet, the teacher can prepare one or the student can join with an invitation.']),
    ],
  },
];
