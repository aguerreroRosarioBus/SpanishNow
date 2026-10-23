# Guía de desarrollo: clases, chat, paquetes e integraciones

Versión 1 · 22 de octubre de 2026 · Documento de producto y coordinación de agentes IA.

## 1. Objetivo, alcance y autoridad

Construir un recorrido completo: una persona consulta al docente por chat, recibe una oferta de clases, paga un paquete, acuerda horarios, confirma sesiones y accede a Zoom y a su calendario. Puede renovar comprando una nueva oferta en la misma conversación. La interfaz permite elegir inglés o español.

Este documento guía varios PR de implementación. El PR que lo incorpora solo añade documentación. No autoriza activar cobros, enviar mensajes reales, conectar cuentas o modificar producción durante desarrollo.

### 1.1 Decisiones confirmadas por el usuario

| ID | Decisión vinculante |
| --- | --- |
| D01 | Paquetes de **pago único**; renovación manual mediante nueva oferta/link dentro del chat. **Sin cobro recurrente ni renovación automática.** |
| D02 | Docente y alumno acuerdan horarios por chat; el docente programa y el alumno confirma. No construir un buscador público de disponibilidad/reserva automática en esta entrega. |
| D03 | El chat admite interesados antes de comprar, con controles contra spam. |
| D04 | Cada docente conecta sus propias cuentas de Google Calendar y Zoom. |
| D05 | Selector **inglés/español para toda la aplicación**, incluidos docentes y administración. |
| D06 | Paquetes, precios y duraciones se toman de `spanishnow.ar` y deben ser configurables. |
| D07 | Incluir clases individuales y grupales desde esta versión: grupo de 2 con un comprador que paga USD 30 total; grupo de 3 con USD 15 por participante. |
| D08 | Las zonas horarias requieren especial atención en todos los recorridos de agenda. |
| D09 | El resto de reglas comerciales se puede definir con criterio. Las propuestas de este documento son valores iniciales configurables, no restricciones codificadas. |

### 1.2 Convenciones para leer la guía

- **DEBE**: requisito de esta entrega; puede cambiar mediante una decisión explícita documentada.
- **Valor inicial propuesto**: decisión tomada bajo D09. Se implementa como configuración validada y se muestra antes de comprar o confirmar; no requiere otra ronda de preguntas para avanzar.
- **Posterior**: fuera del MVP; no implementarlo por iniciativa propia.
- Los ejemplos de clases de 50 minutos no excluyen las clases de 30 minutos.
- Esta guía prevalece sobre especificaciones históricas en su alcance. Conservar pagos de cursos, comentarios y pizarra actuales salvo los cambios explícitamente definidos aquí.

### 1.3 Funcionalidades incluidas

| Código | Funcionalidad | Dificultad relativa |
| --- | --- | --- |
| SALES | Expectativas de cursos y paquetes: destinatario, requisitos, dedicación, resultados y acompañamiento. | Baja |
| LEGAL | Términos, privacidad y devoluciones; enlaces y registro de la versión aceptada. | Baja–media |
| AUDIO | Controles completos de escucha. | Media |
| I18N | Selector EN/ES integral. | Media |
| CHAT | Chat privado docente–alumno, también previo a la compra. | Media–alta |
| TZ / AGENDA | Horarios internacionales, propuestas, confirmaciones y reprogramaciones. | Alta; fundamento transversal |
| CAL | Google Calendar por docente, eventos y detección de ocupación. | Media–alta, después de agenda |
| ZOOM | Reuniones por sesión usando la cuenta propia del docente. | Media–alta, después de agenda |
| PACK | Catálogo configurable, ofertas por chat, compra, saldo, pausa, cancelación y renovación manual. | Alta |

No añadir en este alcance marketplace abierto, clases ilimitadas, mensajería entre alumnos, tutor de IA, app nativa, videollamada propia, grabación de reuniones, facturación recurrente ni reparto automático de ingresos a docentes.

## 2. Base técnica que se debe reutilizar

Base inspeccionada: `main` en commit `618d257bb723ff31d1110eb20cd77a67c8e9b11c`. Antes de implementar, actualizar contra `main` y contrastar cambios posteriores.

| Área | Referencia existente | Regla de evolución |
| --- | --- | --- |
| Aplicación | [Angular/rutas](../../frontend/src/app/app.routes.ts), Express, Sequelize/MySQL. | Mantener estructura y convenciones; no crear otro frontend/backend. |
| Administración | [Especificación admin](../admin/SPEC.md), [permisos](../../backend/src/config/permissions.js). | Ya existe administración sobre roles `teacher`/`student`. Usar capacidades explícitas; no inventar un rol incompatible ni dar a todo docente acceso global. |
| Identidad | [User](../../backend/src/models/User.js), [middleware](../../backend/src/middlewares/auth.middleware.js). | Respetar suspensión, permisos efectivos, cuentas de prueba e impersonación. |
| Pago de cursos | [Order](../../backend/src/models/Order.js), [pagos](../../backend/src/services/paymentService.js), [fulfillment](../../backend/src/services/orderService.js). | La orden actual exige `courseId`. No simular paquetes como cursos vacíos: diseñar órdenes de paquetes separadas y reutilizar adaptadores donde corresponda. |
| Hotmart | [Servicio](../../backend/src/services/hotmartService.js). | Conservar ventas de cursos. Por D10 también cobra paquetes: diseñar en W00 cómo una oferta del chat se vincula a un producto/oferta de Hotmart y cómo el webhook la concilia; no forzar paquetes dentro del flujo de cursos. |
| Google | [Servicio OAuth/Drive/Classroom](../../backend/src/services/liveGoogleService.js), [GoogleConnection](../../backend/src/models/GoogleConnection.js). | Reutilizar identidad/cifrado con separación de capacidades; hoy no incluye Calendar. Autorizar Calendar no debe exigir Classroom/Drive y viceversa. |
| Pizarra | [LiveClass](../../backend/src/models/LiveClass.js), [servicio](../../backend/src/services/liveClassService.js), [documentación](../clases-en-vivo/README.md). | Una pizarra no es una reserva. Crear entidad de sesión programada separada y vincular pizarra opcional. |
| Comunidad | [Comentarios](../../backend/src/services/commentService.js). | No convertir comentarios públicos de curso en mensajes privados. Mantener ambos recorridos. |
| Audio | [Servicio de reproducción](../../frontend/src/app/features/student/story-player/lesson-audio.service.ts), [historia completa](../../frontend/src/app/features/student/story-player/components/full-story-block.component.html). | Extender el reproductor existente y conservar audios lento/normal, por bloque y ayudas de texto. |
| Diseño | [Guía visual](../rediseno-ui/REDISENO_UI.md). | Usar componentes, tokens y confirmaciones existentes. |
| Datos/tests | [Guía de base de datos](../../backend/docs/database.md), Jest, tests Angular y [E2E](../../e2e/playwright.config.ts). | Migraciones nuevas reversibles e idempotentes según convenciones; pruebas aisladas, sin reconstruir bases reales. |

## 3. Catálogo inicial verificable y configurable

Fuente: [paquetes publicados en SpanishNow](https://spanishnow.ar/packages/), consultados el 22/10/2026 mediante navegador. Son datos comerciales iniciales; las cantidades y precios siguientes se transcriben del sitio. El sitio presenta las clases en vivo como pausadas: **el seed no debe habilitar ventas/reservas automáticamente**.

| Clave sugerida | Modalidad | Clases por compra | Minutos por clase | Plazas cubiertas | Precio USD | Quién compra |
| --- | --- | --- | --- | --- | --- | --- |
| `individual-1x30` | Individual | 1 | 30 | 1 | 15 | Alumno |
| `individual-1x50` | Individual | 1 | 50 | 1 | 25 | Alumno |
| `individual-4x30` | Individual | 4 | 30 | 1 | 50 | Alumno |
| `individual-4x50` | Individual | 4 | 50 | 1 | 90 | Alumno |
| `group2-1x50-total` | Grupo de 2 | 1 | 50 | 2 | 30 total | Un comprador por el grupo, confirmado por D07 |
| `group3-1x50-seat` | Grupo de 3 | 1 | 50 | 1 de 3 | 15 por persona | Cada participante compra su plaza, confirmado por D07 |

PACK-01. Dinero en unidades menores enteras, moneda ISO explícita; USD como moneda inicial. Por ejemplo, USD 15 se almacena como `1500`. No asumir formato de moneda por idioma ni sumar importes de monedas diferentes.

PACK-02. Configurar nombre y descripción EN/ES, docente, modalidad, cantidad de sesiones, duración, precio/moneda, capacidad, esquema de pago, vigencia, reglas aplicables y estado `draft/active/paused/archived`. El título de un paquete no sustituye sus campos estructurados.

PACK-03. El docente gestiona sus paquetes y puede pausarlos; la gestión global requiere permiso específico. Un paquete vendido conserva una instantánea inmutable de condiciones/precio/duración. Editar catálogo afecta nuevas ofertas, no compras anteriores.

PACK-04. No asignar automáticamente todo el catálogo a cada nuevo docente. El docente configura su oferta y conexiones. Los precios iniciales no son tarifas obligatorias universales para futuros docentes.

PACK-05. Separar pausa de ventas de una docente, pausa de catálogo y pausa del paquete comprado. Ninguna debe borrar mensajes, pagos o progreso de cursos.

## 4. Reglas comerciales iniciales propuestas

Estos valores no fueron extraídos del sitio: se proponen bajo D09. Deben existir en una configuración versionada, con validación y pantalla de gestión. Una oferta guarda su versión para que un cambio futuro no altere derechos ya comprados.

| Parámetro | Valor inicial propuesto | Regla exacta |
| --- | --- | --- |
| Vigencia, compra de 1 clase | 30 días transcurridos desde pago confirmado | `expiresAt` es un instante UTC explícito mostrado en zona del alumno. |
| Vigencia, compra de 4 clases | 90 días transcurridos desde pago confirmado | Las clases deben finalizar como máximo en `expiresAt`; mostrar esta condición antes de comprar. |
| Caducidad de oferta enviada | 7 días transcurridos | Al vencer, generar otra oferta; no cambiar precio de la anterior. |
| Anticipación para proponer sesión | 24 horas transcurridas | Excepción docente explícita, registrada y aceptada por alumno; no sobrepasar vencimiento del paquete. |
| Plazo para confirmar propuesta | Hasta el menor entre 24 h después de proponer y 2 h antes de empezar | La propuesta reserva provisionalmente capacidad/horario hasta ese instante; expiración libera el bloqueo. |
| Cancelar/reprogramar por alumno sin cargo | Como mínimo 24 h transcurridas antes de inicio | Exactamente 24 h está dentro del plazo. Si es menor, cuenta como cancelación tardía. |
| Cancelación tardía / ausencia alumno | Consume la sesión/plaza reservada | Mostrarlo antes de confirmar; el docente puede dispensar el cargo con motivo registrado. |
| Ausencia docente / cancelación docente | No consume saldo del alumno | Devolver reserva; si impide usar el paquete antes de vencer, extender vigencia por el tiempo de indisponibilidad o reembolsar saldo no utilizado. |
| Tolerancia de llegada | 10 minutos transcurridos | Llegar tarde no desplaza el fin acordado. Ausencia requiere marca docente registrada; no inferirla solo por abrir Zoom. |
| Pausa del paquete comprado | Una pausa de hasta 30 días | Pausar exige resolver/cancelar sesiones futuras conforme a las reglas; no borra ni perdona una cancelación tardía. Al reanudar, extender vencimiento por duración real de pausa. |
| Renovación | Nueva compra independiente | El docente puede enviar oferta cuando reste 1 clase disponible o falten 7 días para vencer; es una sugerencia, nunca un cobro automático. |
| Reembolso de paquete — P01 resuelta | Garantía comercial inicial de 15 días (360 horas bajo la semántica actual); prevalece un plazo más favorable | Voluntario estándar total sin créditos consumidos dentro del plazo aplicable. Resolver reservas expresamente. Con uso previo, fuera de plazo o ante excepciones: revisión individual, sin rechazo automático ni deuda/recobro. Sin prorrateo automático inicial por elección comercial. Verificar formato/cuenta/producto y garantía efectiva Hotmart antes de habilitar ventas reales; no presentar un vencimiento calculado como verificado. |
| Servicio no prestable por la escuela/docente | Reembolso de saldo no utilizado sin el límite anterior | Registrar razón. Derechos aplicables o condiciones del proveedor que sean más favorables prevalecen; no inventar exclusiones legales. |
| Reembolso de cursos digitales | Conserva condiciones actuales de cada producto/proveedor | No aplicar automáticamente la política de paquetes a cursos ya vendidos. |
| Recordatorios de sesión confirmada | 24 h y 1 h antes | Enviar solo los que aún sean futuros al confirmar; zona/idioma del destinatario y preferencias de avisos. |
| Separación entre sesiones del docente | 10 minutos | Configurable; validar también al reprogramar y al confirmar. |

**P01 resuelta (22/10/2026, por delegación expresa de Andrés al orquestador):** esta decisión reemplaza la propuesta original de 14 días/prorrateo para nuevas ofertas y compras, mediante configuración y snapshots nuevos. No editar reglas inmutables ni reducir derechos comprados; cursos digitales intactos. Plazo configurado/contractual/legal más favorable prevalece. Uso previo o fuera de plazo exige revisión individual; no supone aprobación ni rechazo automáticos. Si la escuela/docente no puede cumplir o no se forma el grupo, conservar soluciones y devoluciones incluso fuera de garantía, con resolución humana auditada y sin imponer fecha/vale/extensión sin aceptación. La solicitud interna no devuelve dinero: se tramita en Hotmart de forma manual si falta capacidad verificada y se concilia solo el resultado real. Si Hotmart reembolsa tras uso, cerrar compra, retirar disponibles, conservar consumidos y revisar reservas, sin segundo cobro. La verificación efectiva de formato/garantía/cuenta sigue siendo condición técnica previa a habilitación real, no una decisión comercial pendiente.

PACK-06. Cancelar un paquete significa impedir nuevas reservas y tramitar el saldo según condiciones; no equivale a cancelar un débito recurrente, porque no existe. Mostrar por separado estado del paquete, saldo y estado del reembolso.

PACK-07. La pausa no prolonga por sí sola clases ya confirmadas ni cambia su hora. El formulario debe enumerarlas y permitir resolverlas antes de completar la pausa.

PACK-08. Mostrar el desglose de reembolso y pedir confirmación para ejecutarlo. Primero se solicita/registra, después se concilia el resultado del proveedor. Un fallo no debe marcar dinero como devuelto.

PACK-09. Un cambio excepcional de vigencia/saldo requiere permiso, motivo y auditoría. El docente no puede modificar silenciosamente una compra ni borrar el historial para corregirla.

## 5. Zonas horarias y agenda: requisitos de máxima prioridad

### 5.1 Representación e invariantes

TZ-01. Guardar instantes de sesión, pago, aceptación, vencimiento y avisos en UTC. API en ISO 8601 con `Z` o desplazamiento inequívoco; persistencia y conexiones de base deben usar UTC explícitamente. No aceptar fechas/horas sin zona como instantes.

TZ-02. Guardar también identificador **IANA** de la zona de programación y zona preferida de cada usuario: por ejemplo `America/Argentina/Cordoba`, `America/New_York`, `Europe/London`, `Australia/Sydney`. No guardar únicamente `UTC-3`, abreviaturas `CST/EST` o un país.

TZ-03. Detectar zona del navegador solo como sugerencia; pedir confirmación en la primera acción de agenda. Un cambio del dispositivo o viaje no cambia automáticamente la zona preferida ni mueve sesiones confirmadas. Ofrecer cambiar la visualización y mostrar el aviso pertinente.

TZ-04. Una sesión puntual confirmada mantiene sus instantes UTC al cambiar idioma/zona del usuario. La nueva zona solo cambia su representación. Cambiar la hora real requiere propuesta de reprogramación y aceptación.

TZ-05. Conservar intención de programación: fecha/hora local solicitadas, IANA, desplazamiento usado, instante calculado y resolución de ambigüedad, junto a versión de la sesión. Validar en servidor que el desplazamiento corresponde a esa zona/fecha; el cliente no determina la verdad temporal.

TZ-06. Usar una biblioteca mantenida con base IANA y desambiguación explícita, validada por el responsable de contratos. No implementar reglas de horario de verano a mano, ni sumar/restar horas con constantes. `Intl.DateTimeFormat` sirve para presentar; por sí solo no resuelve toda conversión de hora local a instante.

### 5.2 Presentación y confirmación

TZ-07. Toda propuesta estructurada muestra **fecha completa, día, inicio, fin, zona IANA y desplazamiento aplicable en esa fecha**. Para coordinar, mostrar hora del destinatario como principal y la del docente como secundaria. Nunca mostrar solo «mañana a las 10».

TZ-08. Si las fechas difieren entre zonas, mostrar ambas fechas y una aclaración del cambio de día. El idioma controla nombres/formato; la zona horaria se elige por separado. Evitar formatos numéricos ambiguos como `03/04/2027` sin contexto.

TZ-09. Antes de confirmar/reprogramar, mostrar resumen inequívoco. Botón del alumno confirma versión específica de la propuesta, no cualquier edición posterior. Una propuesta editada invalida la aceptación pendiente anterior.

TZ-10. El chat puede contener horarios escritos libremente, pero solo una tarjeta estructurada y confirmada crea una sesión. No interpretar automáticamente lenguaje natural ni convertir un texto enviado en una reserva.

TZ-11. Emails y calendario incluyen la misma sesión/versión. Las plantillas se renderizan con idioma/zona del destinatario. Una fecha copiada o exportada conserva su IANA y su instante; abrirla desde otro dispositivo no debe reinterpretarla como hora local del nuevo dispositivo.

### 5.3 Cambios de horario de verano y recurrencias

TZ-12. Una hora local inexistente por adelanto de reloj se rechaza con explicación y alternativas válidas. No mover `02:30` a `03:30` silenciosamente.

TZ-13. Una hora local que ocurre dos veces por atraso exige seleccionar una de las dos instancias, mostrando desplazamiento e instante correspondiente. La decisión viaja al servidor y se guarda.

TZ-14. El MVP programa sesiones individuales, aunque varias pertenezcan a un paquete. Un paquete de 4 clases **no** implica cuatro semanas ni una serie automática.

TZ-15. Si se añade en el futuro «repetir semanalmente», la serie debe anclarse a una zona IANA y hora de pared elegidas: «jueves 09:00 en Nueva York», no `UTC + 7×24 h`. Previsualizar todas las fechas y cambios de hora para el otro participante. No crear una recurrencia de proveedor sin implementar las excepciones de la agenda interna.

TZ-16. Plazos de 24 horas, tolerancias y recordatorios se comparan por duración real entre instantes UTC. «90 días» en esta versión son 90×24 horas; si el negocio adopta días calendario/meses, crear otra regla explícita con zona y versión, sin reinterpretar compras previas.

TZ-17. Actualizar datos IANA de forma controlada. Si un cambio normativo afecta sesiones futuras, detectar discrepancias y pedir reprogramación cuando corresponda; no modificar silenciosamente compromisos confirmados.

### 5.4 Casos de prueba obligatorios

Ejemplos comprobados con `zoneinfo` de Python al redactar. Mantener fixtures UTC independientes de la zona del sistema donde corran los tests.

| Caso | Entrada | Resultado esperado |
| --- | --- | --- |
| TZ-T01 | 22/10/2026 09:00 `America/New_York` | `2026-10-22T13:00:00Z`; Córdoba 10:00; Londres 14:00. |
| TZ-T02 | 29/10/2026 09:00 Nueva York | `2026-10-29T13:00:00Z`; Córdoba 10:00; Londres 13:00: los países cambian horario en fechas distintas. |
| TZ-T03 | 05/11/2026 09:00 Nueva York | `2026-11-05T14:00:00Z`; Córdoba 11:00; Londres 14:00. |
| TZ-T04 | 14/03/2027 02:30 Nueva York | Hora inexistente; error validado en cliente/servidor, sin normalización automática. |
| TZ-T05 | 01/11/2026 01:30 Nueva York | Dos opciones: `05:30Z` con `-04:00` o `06:30Z` con `-05:00`. |
| TZ-T06 | Sesión cuyo instante es `2026-10-23T02:30:00Z` | Córdoba 22/10 23:30; Londres 23/10 03:30; ambas fechas visibles. |
| TZ-T07 | Usuario cambia preferencia de Nueva York a Londres | Mismo `startsAtUtc`/`endsAtUtc`, cambia presentación; no se dispara reprogramación. |
| TZ-T08 | API recibe local, IANA y offset incompatibles | Rechazo; no se acepta UTC manipulado por el cliente. |
| TZ-T09 | Cancelación exactamente a 24 h / un segundo después | Primera libera saldo; segunda sigue regla tardía. Repetir cruzando cambio DST. |
| TZ-T10 | Backend, DB y navegador configurados con zonas distintas | Mismos instantes y saldo; no depende del proceso/host. |
| TZ-T11 | `Asia/Kolkata` y una zona de offset de 45 minutos | Conversión correcta; no asumir offsets enteros en horas. |

### 5.5 Flujo de agenda y conflictos

AGENDA-01. Estados individuales: `draft → proposed → confirmed → completed`; terminales alternativos `declined/expired/cancelled/student_no_show/teacher_no_show`. Para grupos, `draft → forming → proposed → confirmed → completed`: `forming` reúne participantes/pagos; `proposed` reúne aceptación del horario de todos. Rechazo/expiración de la propuesta no borra compras ni cohorte: resolver por GROUP-04. Confirmación/asistencia/consumo se registran por plaza además del estado global. Una ausencia parcial en grupo no marca toda la sesión como ausente.

AGENDA-02. El docente selecciona alumno o grupo, compra/plazas compatibles, duración, horario en zona explícita y pizarra opcional. La propuesta llega como tarjeta al chat de cada alumno y queda pendiente de aceptación. No consumir saldo al proponer; sí bloquear provisionalmente horario y capacidad hasta caducar.

AGENDA-03. Al confirmar, validar atómicamente propuesta vigente, permisos, paquete activo, duración/modalidad compatibles, saldo, vencimiento, cupo y conflictos del docente/alumno. Reservar crédito por compra/plaza; no permitir doble gasto con confirmaciones concurrentes.

AGENDA-04. Dos clases distintas no se superponen para un mismo docente o alumno. Una misma sesión grupal sí comparte horario entre sus participantes. Usar intervalos semiabiertos `[inicio, fin)` y aplicar el buffer docente configurado; una pantalla libre no sustituye validación transaccional.

AGENDA-05. Una reprogramación mantiene la sesión confirmada original hasta que la nueva propuesta sea aceptada. El nuevo horario se retiene temporalmente; expirar/rechazar conserva el original. Al aceptar, intercambiar horario/reservas y aumentar versión de forma atómica. Cambios unilaterales del docente no equivalen a aceptación del alumno.

AGENDA-06. Las sesiones creadas mientras un paquete está pausado/expirado se rechazan. Se pueden acordar horarios por texto sin crear reservas ficticias. La cancelación conserva historial, razones, saldo y reintentos de sincronización.

AGENDA-07. Al confirmar, encolar Calendar, Zoom y recordatorios. No hacer llamadas externas dentro de una transacción de saldo/agenda. Mostrar `pendiente de sincronización / listo / requiere atención` por proveedor; un fallo de Google no borra una clase confirmada.

AGENDA-08. Procesar recordatorios contra la versión vigente. Cancelar/reprogramar invalida trabajos pendientes antiguos. Reiniciar procesos no pierde notificaciones; trabajadores concurrentes no envían duplicados.

## 6. Chat privado docente–alumno

CHAT-01. Interesados crean una cuenta de alumno para escribir, sin compra obligatoria. Se puede iniciar desde perfil/curso/paquete de un docente disponible para consultas. No exponer su email como sustituto del chat ni aceptar mensajes anónimos.

CHAT-02. Una conversación privada por pareja docente–alumno, con contexto opcional de curso/paquete/sesión. El alumno solo ve las suyas; el docente solo las propias. Permisos admin actuales no conceden lectura automática de mensajes privados: cualquier futura capacidad de soporte debe ser explícita y auditable.

CHAT-03. Bandeja con nombre, contexto, último mensaje, fecha en zona del usuario y no leídos; historial paginado por cursor y orden estable del servidor. Reintentar envío con `clientMessageId` único por remitente/conversación para no duplicar mensajes.

CHAT-04. Tipos: `text`, `offer`, `session_proposal`, `system_event`. La interfaz distingue mensajes humanos de eventos confiables del sistema. Solo backend crea eventos y referencias comerciales. Los mensajes humanos no se traducen ni se ejecutan como instrucciones, HTML o contenido activo.

CHAT-05. MVP: texto y tarjetas estructuradas, enlaces seguros; adjuntos, audios, notas de voz y llamadas dentro del chat son posteriores. Texto plano, máximo inicial 2.000 caracteres; los enlaces no deben abrirse/consultarse automáticamente desde el servidor.

CHAT-06. Actualización incremental con polling acotado y pausado cuando la pestaña no está visible, o transporte existente equivalente. La persistencia no depende de WebSocket. Posterior: realtime si la carga/experiencia lo justifican. Estados mínimos: enviando, enviado y falló/reintentar; no prometer «leído» si solo se entregó al servidor.

CHAT-07. Control de spam configurable: alumno puede abrir 5 conversaciones nuevas por día y enviar 10 mensajes por hora a docentes que todavía no respondieron; una vez respondido, límite de 60 mensajes/hora por conversación. Límite de 120/hora por docente/conversación. Límite agregado por cuenta/IP con almacenamiento que funcione entre réplicas; `429` y fecha de reintento. No bloquear recuperación/acceso a cursos por exceder chat.

CHAT-08. Bloquear/reportar contacto: impide nuevos mensajes humanos, pero preserva historial y eventos necesarios de compras/clases existentes. Si hay obligaciones activas, ofrecer canal de soporte y cancelación/reasignación; el bloqueo no anula una compra.

CHAT-09. Notificación en app inmediata. Email de actividad no leída agrupado con espera inicial de 5 minutos y máximo uno por conversación cada 30 minutos; configurable y sin cuerpo completo de mensajes por defecto. No enviar si ya se leyó o se deshabilitó ese aviso. Avisos operativos/comerciales tienen reglas separadas.

CHAT-10. Persistir cursor de lectura monotónico por participante; abrir dos pestañas no restaura no leídos viejos. Los mensajes enviados no se editan/borran en MVP; moderación puede ocultar con razón conservando auditoría y las referencias de compra. Política de retención/exportación se describe en LEGAL.

## 7. Ofertas, compra y renovación desde el chat

PACK-10. El docente pulsa «Enviar oferta», elige plantilla y cantidad/modalidad configuradas o crea una variante autorizada; ve precio total, duración, plazas, vigencia, reglas y destinatario antes de enviar. El sistema genera una tarjeta y un enlace interno autenticado, no una URL de pago arbitraria pegada a mano.

PACK-11. La oferta enviada es inmutable: docente, comprador, participantes/plazas cubiertas, producto, importe, moneda, duración, condiciones, caducidad y revisión quedan congelados. Corregir requiere cancelar/reemplazar por otra oferta; el historial muestra la anterior como reemplazada. No cambiar una oferta con un pago pendiente sin resolver ese intento.

PACK-12. Un alumno abre su oferta y checkout desde sesión autenticada. Un tercero con el enlace no puede leer detalles ni comprar derechos para otra identidad. El backend obtiene importe, moneda y beneficiarios desde la oferta; nunca confía en valores enviados por el navegador.

PACK-13. Proveedor de cobro: Hotmart (D10), reutilizando el webhook, la verificación existente y un modo falso local. Cada oferta se cobra mediante un producto/oferta de Hotmart cuyo precio coincide con el snapshot de la oferta, y el checkout lleva una referencia que permite conciliar el webhook con esa oferta sin confiar en datos del cliente. Si Hotmart no está configurado, mostrar indisponibilidad; no marcar pagado manualmente en producción. Stripe queda descartado.

PACK-14. Estados de oferta: `draft/sent/checkout_pending/paid/expired/cancelled/replaced`. Separar los intentos de pago (`pending/paid/failed/refunded/partially_refunded`) y el paquete resultante (`active/paused/exhausted/expired/cancelled`). No condensar todo en un único estado.

PACK-15. Doble clic o dos pestañas reutilizan una única sesión de checkout pendiente por oferta. Persistir operación antes de llamar al proveedor, usar idempotencia y reconciliar si hubo timeout. No crear intentos paralelos que puedan cobrar dos veces la misma oferta.

PACK-16. El webhook verificado confirma el pago: crear compra, acreditar derechos/saldo y registrar evento de sistema exactamente una vez en una transacción; email/aviso mediante outbox. El redirect de éxito no acredita nada. Repetición/desorden de eventos no duplica compras ni revierte reembolsos.

PACK-17. Al vencer/cancelar oferta, cerrar checkout pendiente cuando el proveedor lo permita y reconciliar antes de reemplazar. Si llega un pago efectivo tardío, registrarlo y marcar `paid_needs_review`; notificar al responsable para cumplir o reembolsar. Nunca ignorar dinero cobrado ni acreditar dos veces. Mostrar ese caso al comprador con seguimiento.

PACK-18. Renovar crea otra oferta y otra compra con su saldo/vigencia, conservando anteriores. El mensaje puede enlazar la compra anterior para contexto, pero no reabre ni resetea sus créditos. Priorizar el paquete elegible con vencimiento más próximo solo si el alumno/docente lo confirma en la propuesta de clase.

PACK-19. Estado visible: clases compradas, disponibles, reservadas, utilizadas, vencidas y reembolsadas. Usar un ledger auditable con movimientos `grant/reserve/release/consume/expire/refund/adjust` y referencia única de operación. Saldo nunca negativo; reservar y consumir no descuentan dos veces. Las transferencias entre disponible/reservado/consumido son atómicas.

PACK-20. No consumir por entrar a la pizarra/Zoom. El docente marca clase impartida o ausencia conforme a política, con corrección auditada posible. No cobrar ausencias cuando la sesión/proveedor falló por responsabilidad docente.

PACK-21. Una reprogramación tardía pedida por el alumno consume la sesión original según política y la nueva requiere otro crédito, salvo dispensa docente registrada. Mostrar el efecto antes de aceptar el cambio; no descontar por enviar una consulta o una propuesta rechazada.

### 7.1 Grupos: reglas que no deben quedar implícitas

GROUP-01. La sesión contiene participantes y estados por plaza. Confirmar capacidad y quién paga es independiente de quién asiste. No crear chats compartidos con otros alumnos ni revelar conversaciones privadas.

GROUP-02. Grupo de 2: el comprador paga el total USD 30 y cubre dos plazas de una sesión. Identificar al segundo alumno por invitación aceptada con cuenta propia antes de habilitar el checkout; no crear una cuenta de otro usuario sin consentimiento. La compra guarda comprador y beneficiarios autorizados; la invitación no expone historial ni datos de pago del comprador. Reservar/consumir una sola unidad grupal vinculada a la sesión, no una unidad por cada aceptación. La segunda aceptación completa la confirmación sin otro descuento. Si la propuesta expira, liberar esa reserva una sola vez.

GROUP-03. Grupo de 3: cada participante recibe oferta de USD 15 para su plaza en una cohorte/sesión identificada. El docente forma el grupo; no construir matching público. La sesión solo queda confirmada cuando las 3 plazas están pagadas/identificadas y todos aceptan horario. Mantener estado `forming` hasta entonces y no presentarla como garantizada.

GROUP-04. Para evitar compras sin posibilidad de clase, antes de enviar ofertas grupales el docente debe tener participantes y franja tentativamente acordada. Cada cohorte tiene un único `formingDeadlineAt` visible: valor inicial, el menor entre 7 días desde creación y 2 horas antes del inicio tentativo. Ofertas/checkouts no pueden vencer después; solo enviar ofertas si aún hay plazo suficiente para pagar/confirmar. Si no se completa el grupo en ese plazo, ofrecer nueva fecha con aceptación o reembolso íntegro a afectados sin descuento por cancelación; la vigencia individual del paquete no es motivo para retener una compra que el grupo no pudo prestar.

GROUP-05. Reprogramar grupo requiere aceptar a cada participante; si uno rechaza/expira, mantener la sesión original y resolver por chat. No mover la hora para todos por la aceptación de una sola persona.

GROUP-06. Grupo de 2: cancelar el grupo en plazo libera su crédito; ausencia de un integrante no cancela automáticamente si el otro asiste. El comprador no puede confirmar por otro adulto una reprogramación sin su aceptación; la confirmación del horario requiere ambos participantes.

GROUP-07. Grupo de 3: cancelación en plazo de un integrante libera su plaza. El docente puede reponerla o aceptar impartir con menos personas al mismo precio ya pactado; si decide cancelar, los demás recuperan saldo/reembolso. Nunca cargar automáticamente la diferencia a quienes quedan.

GROUP-08. Una dispensa o baja de participante después de comprar conserva la instantánea comercial original y crea ajuste auditable, no una edición de sus beneficiarios históricos. Un reemplazo requiere invitación/aceptación nueva y validación del docente. Cualquier reembolso del grupo de 2 vuelve al comprador original, nunca automáticamente a la segunda persona; en grupo de 3, a cada comprador afectado.

## 8. Google Calendar

CAL-01. OAuth por docente, calendario destino seleccionable y capacidades separadas de Classroom/Drive. Solicitar solo permisos necesarios para crear/editar eventos propios y consultar ocupación en calendarios elegidos. El alumno no necesita conectar Google para recibir una invitación.

CAL-02. MVP de sincronización: **SpanishNow gobierna el horario de sus clases** y crea/actualiza/cancela un evento por sesión confirmada en el calendario del docente. Leer `free/busy` de calendarios seleccionados para advertir y bloquear conflictos nuevos. No importar todos los eventos privados ni mostrar títulos/participantes de eventos ajenos al alumno.

CAL-03. Antes de confirmar, comprobar ocupación externa reciente además de conflictos internos. Un fallo de lectura no permite confirmar a ciegas: devolver estado recuperable para reintentar o revisión docente explícita. No se promete atomicidad entre Google y MySQL; reconciliar cambios externos posteriores y avisar de conflictos sin mover clases automáticamente.

CAL-04. Persistir `sessionId`, versión, `calendarId`, `eventId`, revisión/etag y estado de sync. Escrituras idempotentes/reconciliables: un timeout no crea duplicados al reintentar. El evento incluye horario inequívoco, zona, enlace a sesión interna y Zoom de participante cuando esté listo; nunca el enlace de anfitrión.

CAL-05. Invitar participantes de esa sesión con privacidad apropiada: ocultar lista de invitados cuando el proveedor lo permita, impedir invitar terceros/modificar evento desde el calendario y no incluir mensajes privados en descripción. El alumno recibe su fecha/hora y puede usar enlace o archivo ICS sin conectar cuenta. Para ICS usar UID estable, fechas inequívocas y `SEQUENCE` por versión; avisar que importar archivos manualmente no garantiza futuras actualizaciones automáticas.

CAL-06. Cambiar o borrar desde Google un evento gestionado por SpanishNow no confirma una reprogramación. Detectar divergencia, mostrar aviso al docente y pedir resolver desde la aplicación. Una respuesta de RSVP de Google tampoco sustituye la aceptación contractual de horario en la app.

CAL-07. Notificaciones de Google disparan sincronización, no contienen por sí mismas la verdad del cambio. Validar canal/token/resource esperado, renovar canales antes de vencimiento y recuperar mediante sync incremental. Ante token inválido/`410`, resincronizar sin borrar sesiones internas ni duplicar eventos; job periódico reconcilia notificaciones perdidas.

CAL-08. Tokens cifrados solo en servidor, refresh serializado entre réplicas y revocación manejada. Desconectar Calendar deja historial y sesiones intactos y señala que no habrá nuevas actualizaciones. No revocar accidentalmente Drive/Classroom si comparten autorización; documentar el alcance real del proveedor antes de reutilizar un grant.

## 9. Zoom

ZOOM-01. OAuth por docente para sus reuniones; no usar un único secreto/cuenta global ni flujo server-to-server para cuentas externas independientes. El alumno entra con el enlace de participante y no necesita conectar una cuenta Zoom a SpanishNow.

ZOOM-02. Crear una reunión programada por sesión confirmada, con duración y horarios de la agenda interna. MVP abre Zoom externo; no integrar Meeting SDK. Conectar «Reunión» y «Pizarra» como acciones distintas en la pantalla de clase.

ZOOM-03. Guardar referencia de reunión, versión y estado por sesión. Distinguir `join_url` de `start_url`: el enlace de anfitrión es un secreto temporal, solo disponible al docente autorizado, nunca en chat del alumno, emails, Calendar, respuestas públicas o logs. Obtener/renovar cuando corresponda; no asumir vigencia permanente.

ZOOM-04. Crear después de confirmación mediante trabajo durable. Si el proveedor creó reunión pero la respuesta se perdió, reconciliar por referencia de correlación antes de recrear: no asumir idempotencia de un endpoint que no la ofrezca. Reprogramar actualiza la misma reunión cuando sea posible; cancelar elimina/deshabilita y registra resultado sin cancelar internamente por segunda vez.

ZOOM-05. No suponer licencias, duración máxima o concurrencia: comprobar capacidad de la cuenta y mostrar problemas antes de vender/proponer sesiones incompatibles. Un mismo docente no dicta dos clases simultáneas aunque Zoom lo permita.

ZOOM-06. Sala de espera y acceso con enlace/contraseña protegidos según configuración. Deshabilitar grabación automática en MVP. Cualquier grabación futura necesita diseño propio de consentimiento/retención y no se añade como efecto lateral de integrar Zoom.

ZOOM-07. Si Zoom está desconectado o falla, mostrar error accionable y reintento al docente; avisar si una sesión próxima sigue sin reunión. Permitir enlace manual de Zoom como contingencia, visible como tal y validado; nunca inventar una URL ni declarar integración exitosa.

ZOOM-08. Refresh de tokens serializado, guardar rotaciones devueltas, manejar revocación y límites del proveedor con backoff. Verificar callbacks/webhooks; eventos duplicados no completan clases ni consumen saldo automáticamente.

## 10. Idioma EN/ES consistente

I18N-01. Selector global en páginas públicas, autenticación y app; disponible a ambos roles y administración. Preferencia persistida por usuario y, anónimamente, en almacenamiento local. Orden: elección explícita del usuario → preferencia de cuenta → preferencia anónima → idioma del navegador EN/ES → inglés.

I18N-02. Idioma y zona horaria son campos independientes. Cambiar idioma no cambia moneda, precios, zona, horarios ni contenido estudiado. El español de historias/audios se mantiene; se traduce la interfaz y las ayudas que tengan versión disponible.

I18N-03. Catálogos de mensajes con claves estables, pluralización e interpolación; evitar concatenaciones difíciles de traducir. Cubrir formularios, validaciones, errores, vacíos, confirmaciones, notificaciones, accesibilidad, emails, PDF/ICS cuando corresponda, páginas de pago de retorno y textos legales/comerciales propios. Documentar límites de la localización alojada por terceros.

I18N-04. Backend devuelve `code` estable y parámetros estructurados, manteniendo compatibilidad con `{ error }` existente durante migración. El cliente traduce por código; no intenta traducir texto arbitrario de excepciones. Mensajes de sistema del chat se renderizan al idioma de quien lee, no al del autor original.

I18N-05. No traducir automáticamente mensajes privados, nombres propios o contenido docente. Campos comerciales EN/ES son editables; si falta traducción, mostrar fallback explícito y advertir al editor, sin inventar resultados/promesas.

I18N-06. Actualizar atributo `lang`, formatos de fecha/número y etiquetas accesibles. Mantener paquetes monetarios y fechas sin ambigüedad. Probar cambio de idioma sin recarga destructiva ni pérdida de borradores/chat/progreso.

## 11. Expectativas y páginas legales

SALES-01. Añadir campos estructurados EN/ES a páginas de cursos y paquetes: para quién es, nivel/conocimientos previos, objetivo, qué contiene, dedicación orientativa, resultados esperables y acompañamiento incluido/no incluido. La duración de clase es un dato distinto de la dedicación autónoma recomendada.

SALES-02. Para paquetes: cantidad de sesiones, duración, modalidad, participantes/plazas cubiertas, docente, precio total, vigencia, coordinación horaria, pausa/cancelación/ausencia y devolución. No prometer certificación oficial, disponibilidad ilimitada ni fluidez garantizada.

SALES-03. Para cursos: mantener temario/precio existentes, distinguir acceso al contenido de clases en vivo/chat/feedback. El acceso vitalicio al curso no implica derecho indefinido a horas docentes. Una oferta especial indica exactamente qué suma.

SALES-04. Mostrar la misma instantánea en página, oferta y checkout. La edición de un texto de catálogo no cambia lo aceptado por un comprador. Los controles deben expresar tiempo/moneda con datos reales de configuración.

LEGAL-01. Rutas públicas de términos, privacidad y devoluciones EN/ES, enlazadas en footer, registro y compra. Identificar versión, fecha de vigencia y contacto responsable. Configurar razón social/responsable, domicilio y canal de privacidad desde datos reales del negocio; no inventar esos datos.

LEGAL-02. Guardar aceptación de términos/condiciones aplicables con usuario, versión, fecha UTC y contexto de compra. Casillas sin premarcar. Separar aceptación contractual de consentimiento opcional para marketing y preferencias de notificación; privacidad informa tratamiento, no es una autorización genérica para usos nuevos.

LEGAL-03. Describir mensajes privados, datos de compra, calendario/Zoom, finalidades, proveedores, acceso autorizado, retención y cómo solicitar exportación/cierre. No afirmar cifrado de extremo a extremo si el servidor procesa mensajes. Mensajes humanos no se envían a servicios de IA en este alcance.

LEGAL-04. Política inicial de retención propuesta: conservar chat durante relación activa y hasta 24 meses después de última actividad, luego anonimizar/eliminar contenido salvo disputa/obligación aplicable documentada. Registros comerciales, aceptaciones y comprobantes tienen retención separada determinada por responsable y jurisdicción; no eliminarlos con una limpieza general de chat. Adjuntos/grabaciones no se recopilan en MVP.

LEGAL-05. Implementar vistas previas y publicación versionada de textos. Borradores pueden usar placeholders identificados; impedir publicar páginas con identidad/contacto obligatorio incompletos. El texto jurídico definitivo debe reflejar negocio, países y proveedores reales; no generar una jurisdicción o excepciones de derechos como decisión de un agente.

## 12. Audio: controles completos de escucha

AUDIO-01. Reproductor compartido con reproducir/pausar, tiempo actual/duración, barra de avance accesible, retroceso/avance de 10 segundos, selección lento/normal y repetición de fragmento. Mantener un único audio activo en el reproductor de lección.

AUDIO-02. Estados: cargando metadata, listo, reproduciendo, pausado, finalizado, buffering y error recuperable. No mostrar duración `NaN/Infinity`, habilitar seek sin metadata o avanzar fuera de rango. Cerrar lección detiene audio y libera recursos/listeners.

AUDIO-03. Para repetir fragmento, admitir límites A/B válidos (`0 ≤ A < B ≤ duración`); control de activación y salida explícitos. Si el recurso no permite buscar, deshabilitar ese control con explicación. Reintentar carga no marca narrativa completada.

AUDIO-04. Lento/normal son grabaciones distintas existentes: al cambiar, indicar si se reinicia el fragmento. Valor inicial propuesto: reiniciar el bloque/segmento actual, sin simular alineación exacta entre archivos. No saltar a un segundo equivalente como si las grabaciones estuvieran sincronizadas.

AUDIO-05. Controles por teclado, lector de pantalla, foco visible y táctil; arrastrar seek no debe ser el único método. Conservar texto/ilustraciones/tooltips. Resaltado palabra por palabra/subtítulos sincronizados quedan para después, requieren datos de alineación que hoy no existen.

AUDIO-06. Verificar CORS/range y formatos de medios reales, navegación y reproducción en móvil; recuperación de interrupciones/autoplay bloqueado. No prometer reproducción en segundo plano u offline por añadir controles.

## 13. Contratos compartidos y diseño de datos

Esta sección fija responsabilidades y semántica. El responsable de contratos debe convertirla en un contrato técnico versionado antes de que otros agentes modifiquen esquema/rutas compartidas. Los nombres son propuestos; si cambia alguno, actualizar guía y consumidores en el mismo PR de contrato.

| Entidad | Información mínima e invariantes |
| --- | --- |
| Preferencias de usuario | `locale`, `timeZone` IANA confirmada; conservar permisos/suspensión actuales. |
| Conversación / participante / mensaje | Pareja docente–alumno única; participantes autorizados; cursor lectura; mensaje con tipo, secuencia servidor, `clientMessageId` e historial de moderación. |
| Plantilla de paquete / versión de política | Configuración comercial del docente, modalidad, cantidades, duración, plazas y cobro por grupo/plaza; traducciones y estados. |
| Oferta | Remitente, destinatario, participantes/cohorte, snapshot inmutable y vencimiento UTC; una oferta no es un pago. |
| Orden de paquete / intento / evento proveedor | Separada de órdenes de cursos; importe/moneda, identidad, estado conciliable e idempotencia de proveedor. |
| Compra de paquete / beneficiarios / ledger | Condiciones compradas, saldo por unidades/plazas compatibles, vigencia/pausa; operaciones únicas y transaccionales. |
| Sesión / participantes / propuesta de cambio | Docente, compra/plazas, instantes UTC, zona/intención local, estado/versión, confirmaciones por participante y pizarra opcional. |
| Conexión externa / referencia de evento o reunión | Dueño docente, proveedor, capacidades, credenciales cifradas, estado/versión y referencia por sesión. Separar permisos de Google por capacidad. |
| Outbox / tarea de sincronización | Eventos durables por agregado/versión, idempotencia, intentos, próximo reintento y error sanitizado. |
| Aceptación legal / auditoría | Usuario, versión, contexto, fecha UTC y responsable de cambios excepcionales. |

CONTRACT-01. Aplicar unicidad en base, no solo en código: conversación por pareja, mensaje por idempotency key, evento proveedor procesado, checkout pendiente por oferta, movimiento de saldo por operación y referencia de sincronización por sesión/proveedor. Diseñar índices por filtros reales; no añadir índices indiscriminadamente.

CONTRACT-02. La API autentica y autoriza cada recurso por dueño/participante; IDs adivinables no dan acceso. Toda mutación sensible valida versión y clave de idempotencia cuando corresponda. Respuestas tienen `code` estable, parámetros y estado HTTP compatible con el proyecto; `409` para conflicto/versión/saldo, `429` para límites.

CONTRACT-03. Grabar estado interno y outbox en la misma transacción; efectos de pago, Calendar, Zoom o email fuera de locks prolongados. Reintentos no duplican dinero, saldo, reuniones, eventos o mensajes.

CONTRACT-04. No añadir un proceso efímero de `setTimeout` como única garantía de recordatorios/expiración. Usar jobs durables y coordinación entre réplicas, sin imponer una infraestructura nueva hasta justificarla; una tabla/outbox con worker puede bastar.

CONTRACT-05. El modo de prueba/fake debe estar prohibido en producción y no enviar mensajes/cobrar/reunirse con cuentas reales. Ampliar limpieza de cuentas de prueba del módulo admin para nuevas relaciones, preservando usuarios reales y referencias comerciales necesarias.

### 13.1 Superficie de API propuesta

Las rutas se congelan en el primer PR de contrato; tabla de capacidades, no autorización para crear implementaciones vacías.

| Grupo | Capacidades requeridas |
| --- | --- |
| `/api/me/preferences` | Leer/actualizar idioma y zona validada. |
| `/api/conversations` | Iniciar/listar propias, historial por cursor, enviar mensaje, marcar leído, bloquear/reportar. |
| `/api/teacher/class-packages` | CRUD/versionado de plantillas propias y pausa de venta. |
| `/api/conversations/:id/offers` | Crear/enviar oferta; leer/resolver/cancelar/reemplazar solo según rol y estado. |
| `/api/class-offers/:id/checkout` | Iniciar/reutilizar checkout autenticado e idempotente; nunca aceptar precio/beneficiario del cliente. |
| `/api/me/class-packages` | Compras/saldo/reglas, solicitud de pausa/reanudación/cancelación/reembolso. |
| `/api/class-sessions` | Proponer/aceptar/rechazar/reprogramar/cancelar, detalle/listado y asistencia con permisos por participante. |
| `/api/integrations/google-calendar`, `/api/integrations/zoom` | Estado/conexión/desconexión y recuperación/reintentos; credenciales nunca en respuestas. |
| Callbacks de proveedores | OAuth verificado, webhook de pago y notificaciones de sync; firmas/canales y protección contra replay. |
| Páginas legales/comerciales | Lectura pública versionada y edición con permisos correspondientes. |

## 14. Organización del trabajo de múltiples agentes

### 14.1 Reglas de coordinación

1. Un coordinador mantiene esta guía, el contrato de datos/API y un registro de decisiones. Antes de empezar, cada agente informa alcance, archivos que posee, dependencias y criterios que cubrirá.
2. **Los agentes no están solos en el repositorio**: no revertir ediciones ajenas ni editar simultáneamente los mismos archivos compartidos. Ajustar la implementación a cambios aceptados de otros agentes.
3. PR inicial de contratos/migraciones antes de desarrollar consumidores en paralelo. Un único responsable integra `models/index.js`, migraciones, `app.routes.ts`, menús, `.env.example`, permisos y otras superficies compartidas; los demás entregan cambios coordinados.
4. No copiar servicios de pago/OAuth en cada feature. Usar adaptadores y módulos comunes con dueño definido. No reemplazar autorización por «si es teacher» cuando necesita pertenencia al recurso.
5. No redefinir reglas comerciales o de zonas horarias desde un componente. Toda variación se añade al registro de decisiones y a pruebas compartidas.
6. Entregar PR pequeños por capacidad utilizable. No marcar completo un frontend con mocks si la API/permiso/saldo real correspondiente no está integrado.
7. Agentes validadores verifican contra requisitos de esta guía; informan fallos y no cambian silenciosamente el alcance. El coordinador resuelve integración y conserva evidencia.

### 14.2 Paquetes de trabajo y dependencias

| Trabajo | Dueño sugerido / archivos | Dependencias | Entrega verificable |
| --- | --- | --- | --- |
| W00 Contratos y persistencia | Coordinador + especialista de datos; contratos, migraciones, modelos, permisos y rutas compartidas. | Ninguna | Diagrama, estados, invariantes, formatos monetarios/temporales y contratos API acordados. |
| W01 I18N | Frontend + backend de preferencias; catálogos, servicio de idioma, errores y emails. | W00 | Selector global y preferencia persistente, base bilingüe reutilizable. |
| W02 Expectativas y legal | Frontend comercial + backend de configuración; páginas/editores/aceptaciones. | W00; integrar W01 | Campos/configuración y snapshots coherentes, rutas legales bilingües. |
| W03 Audio | Frontend reproductor; servicio/componentes y tests de medios. | Contrato I18N de W01; puede avanzar con W00 | Controles reales accesibles sin alterar progreso ni narrativa. |
| W04 Chat | Backend/Frontend de conversaciones; historial, límites, no leídos, eventos y bandeja. | W00, W01 | Interesado contacta al docente; permisos, reintento y privacidad verificados. |
| W05 Catálogo/ofertas/saldo | Backend comercial/datos + UI de oferta; órdenes nuevas y ledger. | W00, W02, W04 | Oferta comprable, pago idempotente, saldo visible, renovación manual y grupos. |
| W06 Agenda y TZ | Backend agenda + frontend confirmación; utilidades de zona, sesiones y participantes. | W00, W01, W04, contrato de saldo W05 | Propuesta/confirmación/reprogramación con pruebas TZ-T01–TZ-T11 y concurrencia. |
| W07 Google Calendar | Backend adaptador + UI conexión; capacidades OAuth, sync y reconciliación. | W06; contratos outbox W00 | Evento coherente, ocupación, cambios/cancelación y recuperación tras desconexión. |
| W08 Zoom | Backend adaptador + UI reunión; OAuth y referencias por sesión. | W06; outbox W00 | Crear/actualizar/cancelar reunión propia, enlaces separados y recuperación. |
| W09 Integración/validación | Validador + coordinador; E2E, escenarios de grupos y recuperación. | Incremental; cierre después W01–W08 | Recorrido de compra/clase/renovación completo en EN/ES y varias zonas. |

Paralelismo útil: W02/W03/W04 una vez fijados contratos base; W07/W08 una vez estable el ciclo de sesión. W05/W06 comparten reservas de saldo: coordinar su contrato antes de dividirlos. Las etiquetas de rol son orientación para el equipo futuro; este documento no dispara agentes ni tareas por sí mismo.

### 14.3 Formato obligatorio de entrega de cada agente

- Requisitos cubiertos por ID; decisiones nuevas y justificación.
- Archivos/migraciones/capacidades modificadas y compatibilidad con `main`.
- Contratos nuevos o cambiados, consumidores afectados y configuración requerida.
- Pruebas ejecutadas, resultados y limitaciones concretas.
- Manejo de errores/reintentos, idempotencia, autorización y observabilidad pertinente.
- Pasos de prueba manual con cuentas ficticias y forma de revertir/desactivar la función.

## 15. Criterios de aceptación de integración

| ID | Escenario obligatorio |
| --- | --- |
| AC01 | Interesado sin compra se registra, elige EN/ES y zona, abre chat, recibe respuesta; otro alumno no puede leerlo. |
| AC02 | Docente envía oferta individual de 4×50 por USD 90; comprador ve condiciones/versiones, paga en fake/test y obtiene exactamente 4 unidades. |
| AC03 | Doble clic, dos pestañas y webhook repetido/desordenado producen una sola compra/acreditación y ninguna inscripción ficticia a un curso. |
| AC04 | Con 1 unidad restante y dos confirmaciones concurrentes solo una reserva queda aceptada; sin saldo negativo. |
| AC05 | Docente propone horario en Nueva York; alumno en Córdoba ve su fecha/hora y acepta; Google/Zoom reflejan el mismo instante. |
| AC06 | Se cumplen TZ-T01–TZ-T11, incluyendo DST, cambio de fecha, horas inexistentes/ambiguas y zona de servidor distinta. |
| AC07 | Reprogramación no aceptada mantiene original; al aceptar cambia una sola vez, actualiza proveedores y anula avisos viejos. |
| AC08 | Cancelación en plazo libera reserva; tardía sigue política con posibilidad de dispensa auditada; ausencia docente no consume. |
| AC09 | Pausa/reanudación conserva saldo, extiende vigencia correctamente y no desplaza sesiones confirmadas de forma oculta. |
| AC10 | Grupo de 2: un pago cubre dos plazas identificadas; ambos aceptan; una sesión grupal consume una unidad de esa compra. |
| AC11 | Grupo de 3: tres compras de USD 15, tres confirmaciones; no confirmar con grupo incompleto ni duplicar reuniones por participante. |
| AC12 | Grupo incompleto/reprogramación rechazada/cancelación de participante resuelve saldo y avisos conforme GROUP-04–GROUP-07. |
| AC13 | Compra pausada/expirada y oferta reemplazada no permiten nuevos cobros/reservas; un pago tardío queda conciliado, visible y atendible. |
| AC14 | Renovación desde el chat crea compra nueva; nadie recibe débito automático ni se resetea saldo histórico. |
| AC15 | Error/revocación de Calendar o Zoom deja estado accionable; reintento/reinicio no duplica evento/reunión, no pierde clase ni saldo. |
| AC16 | Alumno y Calendar reciben solo enlace de participante Zoom. Docente ajeno/admin sin capacidad no obtiene anfitrión ni mensajes privados. |
| AC17 | Cambiar idioma conserva borradores, zona, instantes, precios y progreso; mensajes humanos permanecen originales. |
| AC18 | Audio con teclado/táctil funciona con seek/repetición/velocidad, metadata ausente, fin, error y cambio de lección; no completa narrativa por reproducir. |
| AC19 | Página, tarjeta, checkout e historial coinciden en precio/condiciones/versiones; cambios de catálogo no alteran compra anterior. |
| AC20 | Suspensión y limpieza de cuentas ficticias respetan módulos nuevos; ningún test toca producción ni manda correos reales. |
| AC21 | Docente pausa ventas: no hay ofertas nuevas comprables, pero se conserva chat y se pueden resolver compromisos existentes. |
| AC22 | Reembolso parcial con redondeo, pago tardío, revocación y outbox repetido preservan totales y auditoría; no se marca devuelto antes del proveedor. |

Aplicar pruebas unitarias de reglas/tiempo, integración con MySQL para locks/saldo y E2E para recorridos críticos. Simular proveedores por adaptadores; un sandbox real autorizado verifica configuración, no sustituye las pruebas deterministas.

## 16. Despliegue progresivo y operación

- Flags separados para chat, paquetes, agenda, Calendar y Zoom; desactivar venta no elimina derechos adquiridos. Mantener clases inicialmente pausadas como publica el sitio hasta que un responsable active docentes/productos.
- Migraciones compatibles con datos existentes y validación previa de UTC del entorno. No reinterpretar fechas históricas o cambiar expiraciones en bloque sin migración/diseño específico.
- Métricas: fallos y antigüedad de sync, reuniones/eventos pendientes, mensajes fallidos/no leídos, ofertas/compras conciliables, saldo y discrepancias, reservas concurrentes rechazadas, avisos duplicados y reclamos por horario. Logs con identificadores de correlación, sin tokens, enlaces de anfitrión ni contenido privado.
- Herramientas mínimas de recuperación para el dueño autorizado: reintentar sync, reenviar invitación vigente, ver estado del proveedor, corregir asistencia/saldo con motivo y tramitar reembolso; no exigir SQL manual para incidentes rutinarios.
- Prueba manual antes de activar: dos cuentas en zonas distintas, clase individual y cada modalidad grupal, cambio DST simulado, una renovación, cancelación, pausa, desconexión y recuperación de proveedores.

## 17. Fuentes y registro de decisiones

### Fuentes externas

- [Paquetes SpanishNow](https://spanishnow.ar/packages/): catálogo/precios/duraciones y pausa de oferta vigente al consultar; lectura mediante navegador el 22/10/2026. D07 precisa quién paga grupos.
- [Google Calendar: calendarios, eventos y zonas](https://developers.google.com/workspace/calendar/api/concepts/events-calendars): IANA, instancias y zona de recurrencia.
- [Google Calendar: sincronización incremental](https://developers.google.com/workspace/calendar/api/guides/sync): cursores, resincronización y cambios.
- [Google Calendar: notificaciones](https://developers.google.com/workspace/calendar/api/guides/push): canales y recepción de avisos de cambios.
- [Zoom: OAuth](https://developers.zoom.us/docs/integrations/oauth/): autorización de cuentas y ciclo de tokens.
- [Zoom: ejemplo oficial de ciclo de reunión](https://github.com/zoom/skills/blob/main/skills/rest-api/examples/meeting-lifecycle.md): creación/actualización y distinción entre enlaces.

Las referencias explican capacidades de proveedores; las reglas de producto de esta guía son decisiones de SpanishNow. Verificar documentación/scopes/límites vigentes al implementar; no copiar números o permisos de ejemplos sin validar su aplicación.

Fuentes P01 verificadas el 22/10/2026: [alta de producto y garantía](https://suportehotmart.zendesk.com/hc/es-es/articles/215828518--C%C3%B3mo-registrar-mi-producto-en-Hotmart) (opciones 7/15/21/30 días), [Términos de Compra §3.2](https://hotmart.com/es/legal/plazo-de-compra) (puede haber rechazo por uso, no aprobación incondicional) y [webhook de compras](https://developers.hotmart.com/docs/en/2.0.0/webhook/purchase-webhook/) (`PARTIALLY_REFUNDED` existe; no acredita que nuestra cuenta pueda iniciar un parcial).

### Registro inicial

| Decisión | Estado | Origen |
| --- | --- | --- |
| D01–D09 y cobro de grupos | Confirmado | Respuestas del usuario en este chat. |
| Catálogo de seis variantes | Verificado al redactar | Página pública de paquetes; importación inicial configurable. |
| Reglas de sección 4, límites de chat y retención propuesta | Definido como valor inicial configurable | Criterio delegado por el usuario; explícitamente separado de datos del sitio. |
| Fuente de verdad de agenda en SpanishNow | Diseño inicial propuesto | Evita mover horarios sin aceptación. |
| P01: garantía inicial 15 días, voluntario total sin consumo; demás casos a revisión individual | Resuelta por delegación expresa de Andrés, 22/10/2026 | Configuración/snapshots nuevos; plazo más favorable, incumplimiento y grupo incompleto conservan derechos; sin rechazo automático por uso, prorrateo inicial ni deuda/recobro. Verificación de formato/cuenta/garantía y capacidad de trámite real pendiente antes de habilitar. PACK-08, §4, W05. |
| D10: Hotmart cobra los paquetes; Stripe descartado | Confirmado el 22/10/2026 | Andrés: Stripe no es viable desde Argentina. Afecta PACK-13, W00 y W05. |
| Paquetes primero, suscripción automática fuera de alcance | Confirmado | D01; no construir renovación automática. |

Al cambiar una decisión, añadir fecha, responsable, motivo, requisitos afectados y compatibilidad con compras/sesiones existentes. No reemplazar decisiones confirmadas por inferencias de un agente.
