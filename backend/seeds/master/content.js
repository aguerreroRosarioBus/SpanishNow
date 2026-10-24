// Datos exclusivamente ficticios. No contienen cuentas, enlaces ni medios de proveedores.
const PEOPLE = ['Emma Wilson', 'Oliver Brooks', 'Sofia Martin', 'Liam Johnson', 'Charlotte Lee', 'Noah Williams', 'Amelia Davis', 'Ethan Miller', 'Isabella Moore', 'James Taylor', 'Mia Anderson', 'Lucas White', 'Harper Clark', 'Benjamin Lewis', 'Evelyn Walker', 'Henry Hall', 'Abigail Young', 'Alexander King', 'Emily Scott', 'Daniel Green', 'Elizabeth Adams', 'Michael Baker', 'Avery Nelson', 'Samuel Carter'];
const COURSES = [
  { key: 'primeros-pasos', title: 'Primeros pasos: español para conectar', level: 'A1', price: 0, color: '#d96d45', units: ['Presentarnos y conocernos', 'La vida en el barrio', 'Pequeños planes'], person: 'Ana', place: 'Rosario', object: 'un cuaderno azul', goal: 'conocer a sus vecinos' },
  { key: 'historias-cotidianas', title: 'Historias cotidianas: entender sin traducir', level: 'A1', price: 4900, color: '#9d445c', units: ['Personas y rutinas', 'Encuentros inesperados', 'Celebrar juntos'], person: 'Diego', place: 'Córdoba', object: 'una mochila verde', goal: 'organizar una merienda para sus amigos' },
  { key: 'viajar-con-confianza', title: 'Viajar con confianza por América Latina', level: 'A2', price: 6900, color: '#347e80', units: ['Llegar y orientarse', 'Sabores y mercados', 'Un viaje para recordar'], person: 'Lucía', place: 'Mendoza', object: 'un mapa de la ciudad', goal: 'encontrar una feria de libros' },
  { key: 'conversaciones-reales', title: 'Conversaciones reales: historias que nos unen', level: 'B1', price: 8900, color: '#496c9f', units: ['Contar experiencias', 'Resolver imprevistos', 'Mirar hacia adelante'], person: 'Martín', place: 'Salta', object: 'una cámara pequeña', goal: 'preparar una exposición de fotografías' },
  { key: 'voces-y-perspectivas', title: 'Voces y perspectivas: un club de lectura', level: 'B2', price: 9900, color: '#67764d', draft: true, units: ['Memoria e identidad', 'Decisiones compartidas', 'Imaginar otros futuros'], person: 'Valentina', place: 'La Plata', object: 'un libro de cuentos', goal: 'fundar un club de lectura en el barrio' }
];
const MOMENTS = [
  ['Un encuentro en la plaza', 'la plaza', 'por la mañana', 'Marta'],
  ['Una mesa junto a la ventana', 'el café', 'al mediodía', 'Pablo'],
  ['El camino a casa', 'la biblioteca', 'por la tarde', 'Clara'],
  ['La pregunta inesperada', 'el mercado', 'por la mañana', 'Tomás'],
  ['Un pequeño cambio de planes', 'la estación', 'al mediodía', 'Elena'],
  ['La ayuda de un vecino', 'la panadería', 'por la tarde', 'Nicolás'],
  ['Una invitación especial', 'el centro cultural', 'por la mañana', 'Laura'],
  ['Todo está casi listo', 'el parque', 'al mediodía', 'Andrés'],
  ['Una historia para compartir', 'la casa de una amiga', 'por la tarde', 'Mariana']
];
function lesson(course, index) {
  const [title, location, when, friend] = MOMENTS[index];
  const p = course.person;
  const introduction = `${p} vive en ${course.place} y quiere ${course.goal}. Hoy lleva ${course.object}.`;
  const scenes = [
    [
      `${introduction} Va a la plaza por la mañana. Allí ve un banco libre, se sienta y observa a las personas que pasan. Tiene muchas ideas, pero no sabe por dónde empezar.`,
      `En la plaza, ${p} encuentra a ${friend}. Le cuenta su idea y le pregunta si conoce a alguien que pueda ayudar. ${friend} escucha con atención y propone hacer una lista de tareas. Entre los dos, el proyecto parece más sencillo.`,
      `Antes de despedirse, escriben tres pasos: buscar información, elegir un lugar e invitar a otras personas. Acuerdan encontrarse el sábado. ${p} vuelve a casa con una lista corta y muchas ganas de comenzar.`
    ],
    [
      `${introduction} Al mediodía entra en el café del barrio. Pide una mesa junto a la ventana y un vaso de agua. Quiere revisar la lista antes de hablar con sus amigos.`,
      `En el café, ${p} encuentra a ${friend}, que está leyendo el periódico. Le muestra la lista y pregunta cuánto tiempo hace falta para preparar todo. ${friend} sugiere empezar con un encuentro pequeño, sin gastar demasiado dinero.`,
      `La idea le parece buena. En lugar de preparar una gran celebración, van a invitar primero a seis personas. Acuerdan encontrarse el sábado para comparar propuestas. Al pagar, ${p} agradece la conversación: ahora el plan es más realista.`
    ],
    [
      `${introduction} Por la tarde visita la biblioteca. Necesita información y prefiere consultar libros antes de comprar algo que quizá no vaya a utilizar. La bibliotecaria le indica una mesa tranquila.`,
      `Entre los estantes, ${p} encuentra a ${friend}. Buscan juntos un libro sobre proyectos del barrio. Descubren que muchas iniciativas empezaron con una pregunta sencilla: qué podemos compartir con nuestros vecinos.`,
      `Copian varias ideas en una hoja y devuelven los libros a su lugar. No hace falta tener todas las respuestas hoy. Acuerdan encontrarse el sábado y llevar una propuesta cada uno. Al salir, la biblioteca ya parece parte del proyecto.`
    ],
    [
      `${introduction} Va al mercado por la mañana para preguntar precios. No quiere comprar todavía: primero necesita saber qué materiales hay y cuánto cuestan. Recorre los puestos con calma.`,
      `Junto a un puesto de frutas, ${p} encuentra a ${friend}. Los dos comparan precios y hablan con una vendedora. Ella les explica que el sábado por la tarde algunos puestos ofrecen descuentos. Anotan la información para el grupo.`,
      `Después deciden aprovechar los materiales que ya tienen en casa. Comprar menos les permite dedicar más tiempo a conversar y organizarse. Acuerdan encontrarse el sábado, después de visitar el mercado, y revisar juntos el presupuesto.`
    ],
    [
      `${introduction} Al mediodía llega a la estación. Busca en el bolsillo la hoja con la dirección del encuentro, pero no la encuentra. Respira despacio y revisa la mochila una segunda vez.`,
      `En la estación, ${p} encuentra a ${friend}. Le explica el problema sin vergüenza. ${friend} recuerda la dirección y dibuja un pequeño plano. No está lejos: hay que caminar dos calles y doblar junto a la farmacia.`,
      `Cuando llegan, ${p} guarda una copia del plano junto a sus cosas. La próxima vez también llevará la dirección en el teléfono. Acuerdan encontrarse el sábado en ese mismo lugar. El pequeño imprevisto termina convirtiéndose en una buena conversación.`
    ],
    [
      `${introduction} Por la tarde entra en la panadería. Mientras espera su turno, escucha que dos vecinos hablan del fin de semana. Sonríe y pregunta si conocen un espacio donde pueda reunirse un grupo pequeño.`,
      `En la panadería, ${p} encuentra a ${friend}. La dueña del local también se suma a la conversación. Cuenta que el centro cultural presta mesas y sillas a los vecinos, siempre que se devuelvan limpias al terminar.`,
      `Entre todos anotan un número de contacto. ${p} llama y confirma que hay un espacio disponible. Acuerdan encontrarse el sábado para preparar las mesas. La ayuda que necesitaban estaba más cerca de lo que imaginaban.`
    ],
    [
      `${introduction} Por la mañana visita el centro cultural. La sala está vacía y entra mucha luz por las ventanas. Imagina dónde podrían sentarse las personas y qué haría falta llevar.`,
      `En la entrada, ${p} encuentra a ${friend}. Escriben juntos una invitación breve: qué van a hacer, dónde y a qué hora. Antes de compartirla, la leen en voz alta para comprobar que se entiende sin explicaciones.`,
      `La invitación ya está lista. Cada persona podrá llevar algo para compartir, pero no será obligatorio comprar nada. Acuerdan encontrarse el sábado y recibir juntos a quienes lleguen por primera vez. El proyecto empieza a tener nombres y caras.`
    ],
    [
      `${introduction} Al mediodía atraviesa el parque para revisar los últimos detalles. El cielo está nublado y piensa qué harán si empieza a llover. Quiere evitar que alguien llegue y no sepa dónde esperar.`,
      `Cerca de los árboles, ${p} encuentra a ${friend}. Revisan dos opciones: reunirse al aire libre si hace buen tiempo o usar la sala cubierta del centro cultural. Deciden explicar las dos alternativas en un mensaje claro.`,
      `Cada tarea tiene ahora una persona responsable. Nadie tiene que hacerlo todo. Acuerdan encontrarse el sábado y llegar quince minutos antes que el resto. ${p} mira una vez más la lista: todavía hay cosas pequeñas por hacer, pero lo principal está preparado.`
    ],
    [
      `${introduction} Por la tarde llega a la casa de una amiga para contar cómo salió el encuentro. Recuerda las dudas del primer día y se sorprende de todo lo que cambió al pedir ayuda.`,
      `Al entrar, ${p} encuentra a ${friend}. Conversan sobre lo que funcionó y lo que podrían mejorar. Lo mejor no fue que todo saliera perfecto: fue que las personas se escucharon y tuvieron ganas de volver.`,
      `Guardan las notas para la próxima vez y agradecen a quienes colaboraron. Acuerdan encontrarse el sábado para compartir una nueva historia. ${p} ya puede explicar el proyecto con sus propias palabras: empezó con una idea y creció gracias a una comunidad.`
    ]
  ];
  const frames = scenes[index];

  return { title: `${title}: ${p}`, frames, location, friend, words: [
    ['quiere', 'wants', `${p} quiere ${course.goal}.`, 'verbo'],
    ['lleva', 'carries', `${p} lleva ${course.object}.`, 'verbo'],
    ['encuentra', 'meets', `${p} encuentra a ${friend}.`, 'verbo'],
    ['acuerdan', 'agree', 'Los dos acuerdan encontrarse el sábado.', 'verbo'],
    [location, ['the square','the café','the library','the market','the station','the bakery','the cultural centre','the park',"a friend's house"][index], `El encuentro ocurre en ${location}.`, 'sustantivo']
  ], questions: [
    { text: `¿Dónde vive ${p}?`, correct: course.place, wrong: 'En otra ciudad', frame: 0 },
    { text: `¿A quién encuentra ${p}?`, correct: friend, wrong: 'A una persona desconocida', frame: 1 },
    { text: '¿Cuándo van a encontrarse otra vez?', correct: 'El sábado', wrong: 'El lunes', frame: 2 }
  ] };
}
const EXPECTATIONS = {
  es: { audience: 'Adultos que aprenden español mediante historias comprensibles.', prerequisites: 'Lee la descripción de nivel y avanza a tu ritmo.', objective: 'Comprender historias y usar expresiones frecuentes en contexto.', contents: 'Tres unidades, nueve historias, lectura guiada, vocabulario y evaluaciones.', selfStudy: 'Reserva veinte minutos, tres veces por semana, para leer y repasar.', outcomes: 'Reconocer expresiones, seguir una narración y contar una experiencia breve.', supportIncluded: 'Preguntas sobre las lecciones mediante comentarios del curso.', supportExcluded: 'Las clases individuales se contratan por separado; no se garantiza un nivel oficial.' },
  en: { audience: 'Adults learning Spanish through comprehensible stories.', prerequisites: 'Read the level description and work at your own pace.', objective: 'Understand stories and use common expressions in context.', contents: 'Three units, nine stories, guided reading, vocabulary and quizzes.', selfStudy: 'Set aside twenty minutes, three times a week, to read and review.', outcomes: 'Recognize expressions, follow a narrative and tell a short experience.', supportIncluded: 'Questions about the lessons through course comments.', supportExcluded: 'Individual classes are purchased separately; no official proficiency level is guaranteed.' }
};
module.exports = { PEOPLE, COURSES, lesson, EXPECTATIONS };
