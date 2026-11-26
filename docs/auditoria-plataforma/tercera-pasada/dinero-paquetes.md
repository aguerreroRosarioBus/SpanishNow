# Auditoría QA/UX, tercera pasada · Dinero y paquetes de clases

Fecha: 25/11/2026 · Paquete W19 (#118) · Rama `w19-auditoria-dinero` · Solo revisión: no se cambió código de la aplicación.

> Cada hallazgo se reprodujo en la interfaz de una base desechable propia. Lo que no se pudo comprobar figura en el apartado (d). Los textos entre comillas están copiados de la pantalla.

## (a) Entorno usado

- **Base desechable propia:** MySQL local, base `spanishnow_master_audit3a_test`, construida con `npm run db:rebuild` y luego `db:seed:master` (docente `admin@gmail.com`, alumnos `lucas@gmail.com` y `jane.smith@example.test`, más los alumnos ficticios `master.*@example.test`). No se tocaron `spanishnow_main`, la copia fija que sigue main ni los puertos 3001, 4200 y 4301.
- **Procesos:** backend en el puerto 3103 (`node src/server.js`) y `ng serve --configuration lan --ssl=false` en el 4302, con un proxy local no versionado (`frontend/proxy.audit3.json`, excluido con `.git/info/exclude`) hacia el backend de prueba para `/api` y `/uploads-dev`. Navegador integrado sobre `http://localhost:4302`.
- **`.env` propio** del worktree (ignorado por git): credenciales de MySQL local tomadas del `.env` de desarrollo (no se imprimieron), `DB_NAME` propio, `PORT=3103`, `FRONTEND_URL=http://localhost:4302`, `PAYMENTS_FAKE=1`, `INTEGRATIONS_FAKE=1`, `MAIL_TRANSPORT=log`, `MEDIA_FAKE_UPLOADS=1`, `OUTBOX_WORKER=1` y los `FEATURE_*` de chat, paquetes, agenda, Calendar y Zoom. Hotmart, Zoom, Google, SMTP y Cloudinary quedaron sin definir. Los correos salieron solo a `backend/tmp/mail/`.
- **Preparación hecha desde la interfaz:** permisos de `admin@gmail.com` desde `/admin/users`; «Habilitar» al docente en `/admin/class-commerce`; en `/teacher/class-packages` nueva versión del paquete «4 × 30 min» con datos de pago de prueba (producto `900001`, oferta `audit3a`), activarlo y «Reanudar nuevas ventas»; ofertas 33, 34 y 35 enviadas desde `/teacher/class-offers/new`.
- **Preparación hecha directamente en la base desechable (no hay otra forma de adelantar el reloj):**
  1. Sesiones 24 y 2 movidas al 20/11/2026 para poder registrar asistencia desde la agenda y que el consumo de crédito lo hiciera la aplicación.
  2. Compra 4: `expiresAt` adelantado al 25/11/2026 00:00 UTC; el vencimiento lo liquidó la aplicación al abrir `/class-packages`.
  3. Órdenes semilla 2, 4, 7 y 25: `providerTransactionId` cambiado a `FAKE-PACKAGE-<id>` y borrados sus eventos en `payment_provider_events`, porque las órdenes de la semilla traen una transacción `master-…` que el reembolso simulado no reconoce (ver «Efectos de la semilla»).
  4. Sesión 4 de la compra vencida cerrada a mano (una propuesta pendiente más allá del vencimiento es un estado que mi preparación hizo imposible de otro modo).
  5. Oferta 35 con vencimiento adelantado; la pasó a `expired` el trabajador de la cola.
- **Cuentas:** contraseña de prueba local de `backend/seeds/local-test-accounts.json` (no se repite aquí).
- **Tamaños e idiomas:** escritorio y teléfono 390x844 (tamaño personalizado; se restauró el preset `desktop`). ES en el docente y en lucas/jane; EN en las cuentas `master.*` que la semilla deja con idioma inglés (Oliver, Liam, Mia, Amelia).

### Efectos de la semilla o del modo simulado (no cuentan como hallazgos)
- Las órdenes sembradas tienen `providerTransactionId = master-…` y la oferta sin producto Hotmart: «Simular confirmación de reembolso del proveedor» sobre ellas no reembolsa. El evento queda como `needs_review`, aparece una tarea «Requiere resolución manual» y la orden sigue `paid`. Con una compra hecha por el flujo simulado (compra 31) el reembolso se completa bien.
- El texto «Qué incluye» de las ofertas («Tres unidades, nueve historias…» y «Las clases individuales se contratan por separado») viene de `backend/seeds/master/content.js` y describe un curso, no un paquete de clases.
- `lucas`, `jane` y el docente tienen `locale` y `timeZone` en NULL; por eso el correo salió en inglés y en UTC (D3-DIN-19).
- Los avisos «proveedor simulado», «Modo de prueba local. No se cobra dinero.» y el botón «Simular …» pertenecen al modo `PAYMENTS_FAKE`.

## (b) Cobertura

| # | Punto | Estado | Detalle y motivo |
|---|---|---|---|
| 1 | Reembolso de un paquete comprado | **recorrido** | Solicitud del alumno → aprobación del admin → confirmación simulada del proveedor, completa sobre una compra hecha por el flujo simulado (compra 31, USD 50). Estado de la compra, de la orden, saldo, ledger y chat comprobados en la base y en ambos paneles. Reembolsar dos veces: la interfaz oculta el formulario y deshabilita «Aprobar»; por API `refund_already_confirmed` (409). Con crédito consumido (compra 2, 1 de 4), con paquete pausado (compra 7) y con paquete vencido (compra 4): recorridos tras la preparación indicada. Correo: no se genera ninguno por reembolso (solo el de confirmación de compra); el aviso es un mensaje del sistema en el chat. |
| 2 | Ajuste de créditos auditado | **recorrido** | Alta, baja y restauración; cantidad 0, negativa, decimal, 99.999.999.999 y 2.147.483.647; motivo vacío y de solo espacios; saldo cero con reserva; compras reembolsada, cancelada, pausada y agotada. «Registro de auditoría visible»: solo lo ve el alumno (historial de saldo); el admin no tiene historial en la pantalla. |
| 3 | Pausar y reanudar | **parcial** | Pausa y reanudación reales sobre la compra 25 (vencimiento, contador, límite y textos de ambos lados) y bloqueo por propuesta pendiente. No alcanzado: pausar con una clase confirmada y crédito reservado (solo se vio el bloqueo por propuesta pendiente), reanudación automática a los 30 días y su aviso, y pausa vista desde el panel del docente (la compra pausada de la semilla se reembolsó antes). |
| 4 | Compra con el flujo simulado | **recorrido** | Oferta 33 (4 × 30 min, USD 50) → «Continuar al pago» → «Simular pago confirmado». Saldo 4/4, vencimiento 24/02/2027 00:34:29 UTC (= `paidAt` + 2160 h) y «Vence el 23 feb 2027 · 21:34 · America/Cordoba» cuadran con la base. **El dashboard del alumno (`/student/dashboard`) no tiene tarjetas de paquetes**; las tarjetas que existen son las de `/class-packages`, que son las que se comprobaron. |
| 5 | Estados de la compra | **parcial** | Vistos en ambos paneles: `checkout_pending`, pago en revisión, pagada, activa, pausada, agotada, vencida, cancelada, reembolsada (compra y orden), oferta cancelada y oferta vencida. Moneda e importes: USD, JPY, ARS y EUR en ES en el editor; USD en EN para el alumno. No alcanzado: pago fallido, el panel del docente en EN, EN en `/admin/class-commerce`, pago real en ARS/EUR/JPY y los paquetes de grupo. |
| 6 | 390 px | **parcial** | Medido el desbordamiento y mirada la pantalla en: `/admin/class-commerce`, `/teacher/class-purchases`, `/teacher/class-packages`, `/teacher/orders`, `/class-offers/33`, `/class-packages`, `/class-packages/31`, `/messages/25` y `/student/purchases`. No se revisaron a 390 px los diálogos de ajuste y de aprobación ni los formularios de oferta. |

## (c) Hallazgos

Conteo: **21 hallazgos · alta 0, media 10, baja 11.** Por rol principal: administración 8 (5 media, 3 baja), alumno 10 (5 media, 5 baja), docente 2 (2 baja), común 1 (baja).

| ID | Sev. | Rol | Pantalla | Título |
|---|---|---|---|---|
| D3-DIN-01 | media | Admin | `/admin/class-commerce` · ajuste | El ajuste no tiene tope: acepta 2.147.483.647 créditos y la segunda alta falla con un error genérico |
| D3-DIN-02 | media | Admin/Alumno | `/admin/class-commerce`, `/class-packages` | «Aprobar trámite de reembolso» cancela la compra al instante y no hay camino de vuelta |
| D3-DIN-03 | media | Admin | `/admin/class-commerce` · ajuste | Se pueden sumar créditos a una compra cancelada (con reembolso aprobado) o pausada |
| D3-DIN-04 | media | Alumno/Docente | `/class-packages`, `/teacher/class-purchases` | «Cancelado» sirve para cuatro situaciones distintas y no existe «Reembolsado» |
| D3-DIN-05 | media | Admin | `/admin/class-commerce` · solicitudes | Con créditos consumidos solo se ofrece reembolso «total» de USD 90,00 |
| D3-DIN-06 | media | Admin | `/admin/class-commerce` · trámites | La bandeja dice «orden #31» cuando es la compra #31, no nombra a las personas y muestra nombres de tareas |
| D3-DIN-07 | media | Alumno | `/class-packages/:id` | El motivo interno del revisor se muestra al comprador |
| D3-DIN-08 | media | Alumno | `/student/purchases` | «Mis compras» no incluye los paquetes de clases ni sus reembolsos |
| D3-DIN-09 | media | Alumno/Admin | `/class-packages/:id` | Tras un ajuste el saldo muestra «4 disponibles de 5» o «1 de 1» y el historial no dice si sumó o restó |
| D3-DIN-10 | media | Admin | `/admin/class-commerce` · ajuste | Pide escribir una fecha en formato ISO (`2026-11-30T14:00:00Z`) |
| D3-DIN-11 | baja | Admin | ajuste | Cantidad decimal o enorme: error «Revisa nombres, importes enteros, moneda…» |
| D3-DIN-12 | baja | Admin | ajuste | «Restaurar» sin créditos consumidos dice «No hay suficientes créditos de clase disponibles» |
| D3-DIN-13 | baja | Admin | ajuste | Formulario: compra por número, botón mudo con 0 o negativo, «1.5» pasa y se muestra sin formato |
| D3-DIN-14 | baja | Alumno | `/class-packages` | «Pausar paquete» se ejecuta de un clic, gasta la única pausa y los textos no explican nada |
| D3-DIN-15 | baja | Alumno | `/class-packages` | Pausa bloqueada: mensaje genérico, lejos del botón y sin listar las sesiones |
| D3-DIN-16 | baja | Docente/Alumno | `/class-offers/:id` | Oferta cancelada o vencida: «La oferta vence…» en presente y el estado de checkout muestra «Enviada» |
| D3-DIN-17 | baja | Alumno | `/class-packages/:id`, chat | Tras reembolsar siguen los textos de «a revisar»; ids de solicitud y de oferta que no coinciden con nada visible |
| D3-DIN-18 | baja | Alumno/Docente | `/class-packages`, `/teacher/class-purchases` | Un paquete vencido reembolsado pasa a «Cancelado» y conserva «Vencidas 4 · Reembolsadas 0» |
| D3-DIN-19 | baja | Alumno | correo | Correo de compra en inglés y con el vencimiento en UTC; ningún correo por reembolso ni por vencimiento |
| D3-DIN-20 | baja | Común | 390 px | Un botón de la pantalla comercial sobresale 7 px y en `/teacher/orders` el estado queda fuera de vista |
| D3-DIN-21 | baja | Docente | `/class-offers/:id` | Cancelar una oferta con un pago en revisión responde «Esta oferta no admite pagos en su estado actual.» |

### D3-DIN-01 · Ajuste sin tope: 2.147.483.647 créditos y la siguiente alta falla
- **Severidad:** media (riesgo de saldo incorrecto). **Rol:** administración con `class_credits.adjust`. **Ruta:** `/admin/class-commerce` → «Ajuste de créditos auditado» (escritorio, ES).
- **Pasos:** cargar la compra 13 (4 disponibles) → «Agregar créditos disponibles» · cantidad `2147483647` · motivo · confirmar. Repetir con la misma cantidad.
- **Esperado:** un límite razonable (decenas de clases) o una confirmación específica del impacto, y un mensaje claro si el valor no cabe.
- **Obtenido:** la primera alta se acepta: «#13 · Disponibles: 2147483651 · reservados: 0 · consumidos: 0». La segunda falla con «Ocurrió un error. Por favor intenta de nuevo.» (la columna `unitsGranted` es `int unsigned` y se desborda). Con `99999999999` responde 400 (ver D3-DIN-11). Un error de tecleo (1000 en lugar de 10) deja un saldo de 1000 clases pagadas sin ninguna advertencia.
- **Evidencia:** `SELECT unitsGranted, unitsAvailable FROM class_package_purchases WHERE id=13` → 2147483651 en ambas.
- **Archivo probable:** `backend/src/services/classPurchases.js` (`positive`, `adjust`) y `frontend/src/app/features/packages/commerce-admin.component.ts` (`adjust`, campo `units`).

### D3-DIN-02 · «Aprobar trámite de reembolso» cancela la compra al instante y no hay vuelta atrás
- **Severidad:** media. **Rol:** administración y alumno. **Rutas:** `/admin/class-commerce` y `/class-packages` (compra 25, lucas).
- **Pasos:** alumno pide reembolso (solicitud #4) → admin «Aprobar trámite de reembolso total» con motivo → no confirmar el proveedor.
- **Esperado:** mientras el proveedor no confirma, la compra sigue utilizable o el alumno ve un estado «Reembolso en trámite» que explique que no puede reservar; y el admin puede revertir si el proveedor lo rechaza o no responde.
- **Obtenido:** la compra pasa a `cancelled` (`version` 4 → 5) con `unitsAvailable` 4 y la orden `paid`. El alumno ve «Cancelado · 4 disponibles de 4 · Vence el 23 feb 2027» (contradictorio, ver D3-DIN-04). No se envía mensaje de chat ni correo por la aprobación. Los botones que quedan son «Solicitar información», «Registrar seguimiento manual» y «Registrar resolución y cerrar aviso»; ninguno restablece la compra (`unfreeze` solo acepta órdenes congeladas con `frozenFromStatus`). Si el reembolso nunca llega, el alumno pierde acceso a 4 clases pagadas.
- **Causa (código):** `classRefunds.review` cancela la compra al aprobar (el comentario lo declara intencional: «Impedir nuevas reservas durante el trámite»); falta el camino inverso.
- **Archivo probable:** `backend/src/services/classRefunds.js` (`review`), `classPaymentReview.js` (`unfreeze`).

### D3-DIN-03 · Se pueden sumar créditos a una compra cancelada o pausada
- **Severidad:** media. **Rol:** administración. **Ruta:** `/admin/class-commerce` → ajuste.
- **Pasos:** compra 25 (cancelada por la aprobación de D3-DIN-02, orden aún `paid`) → «Agregar créditos disponibles» 1 → confirmar. Lo mismo con la compra 7 (pausada).
- **Esperado:** rechazar ajustes de alta sobre compras canceladas o sin acceso, como ya se hace con las reembolsadas.
- **Obtenido:** «#25 · Disponibles: 5» (de 4) y «#7 · Disponibles: 5». Cuando el proveedor confirmó el reembolso de la compra 7 se devolvieron 5 créditos, incluido el sumado a mano (`unitsRefunded` = 5 para una compra de 4). Sobre la compra reembolsada (31) sí responde «El paquete no admite esta acción. Actualiza su estado.».
- **Archivo probable:** `backend/src/services/classCredits.js` (`apply`, regla `refundedOrder` solo para órdenes ya reembolsadas).

### D3-DIN-04 · «Cancelado» sirve para cuatro situaciones y no existe «Reembolsado»
- **Severidad:** media. **Rol:** alumno y docente. **Rutas:** `/class-packages`, `/teacher/class-purchases` (ES).
- **Obtenido:** la misma etiqueta «Cancelado» aparece para (1) cancelación del alumno, (2) reembolso aprobado sin confirmar («Cancelado · 4 disponibles de 4»), (3) reembolsado («Cancelado · 0 disponibles de 4 · Reembolsadas 4») y (4) vencido y luego reembolsado (D3-DIN-18). Todas siguen mostrando «Vence el 23 feb 2027 · 21:34 · America/Cordoba» como si pudieran usarse (solo «Vencido» cambia a «Venció el»). El docente ve «Cancelado» y el botón «Enviar nueva oferta», sin saber que hay un reembolso aprobado ni que el dinero ya volvió. SPEC PACK-06 pide mostrar por separado estado del paquete, saldo y estado del reembolso.
- **Esperado:** estado de reembolso visible en la tarjeta («Reembolso solicitado», «aprobado, pendiente del proveedor», «Reembolsado USD 50,00»), sin fecha de vencimiento en compras ya cerradas y con «disponibles» a cero o deshabilitado cuando el estado no permite reservar.
- **Archivo probable:** `frontend/src/app/features/packages/purchases.component.ts` (`tone`, `expiry`, `others`), `packages.i18n.ts` (`packages.purchase.status.*`).

### D3-DIN-05 · Con créditos consumidos solo se ofrece reembolso «total» de USD 90,00
- **Severidad:** media (importe). **Rol:** administración. **Ruta:** `/admin/class-commerce` → solicitud #23 (compra 2, 1 de 4 consumida).
- **Obtenido:** la tarjeta dice «Requiere revisión individual. No supone aprobación ni rechazo automáticos», muestra «Disponibles: 3 · reservados: 0 · consumidos: 1» y los únicos botones son «Aprobar trámite de reembolso total», «Solicitar información» y «Registrar seguimiento manual». El diálogo dice «Compra #2 · Aprobar trámite de reembolso total · USD 90,00». Al confirmar el proveedor simulado, la orden pasó a `refunded` con `refundedAmount` 9000 (USD 90 completos) y el ledger devolvió 3 créditos; la clase ya dada quedó sin descuento.
- **Esperado:** por SPEC P01 «con uso previo: revisión individual» y AC22 (reembolso parcial); el revisor necesita una opción de importe distinto (o al menos un aviso de que el total devuelve también la clase consumida). Hoy el importe parcial solo existe para órdenes congeladas.
- **Archivo probable:** `commerce-admin.component.ts` (`reviewRefund`), `classRefunds.js` (`review`: no recibe importe).

### D3-DIN-06 · La bandeja de trámites usa un número equivocado, no nombra a nadie y muestra nombres de tareas
- **Severidad:** media (puede llevar a actuar sobre la orden equivocada). **Rol:** administración. **Ruta:** `/admin/class-commerce` → «Trámites del proveedor y recuperación» y «Solicitudes de reembolso».
- **Obtenido:** para la solicitud #9 de la **compra 31** (cuya orden es la **33**) la bandeja muestra «Trámite del proveedor para la orden #31 · Requiere resolución manual · Tarea #13 · review.package_refund · intentos 0». La «orden #31» existe y es otra: una orden sembrada «Para revisar» de USD 25,00. La causa es que la tarea `review.package_refund` guarda el id de la compra y la pantalla lo etiqueta como orden. Además: las solicitudes se titulan «#4 · Compra #25» sin nombre de comprador ni de docente; se ven nombres técnicos de tarea («review.package_refund», «payment.refund», «review.class_payment») y «intentos 0»; una tarea nueva sin falla aparece como «Requiere resolución manual».
- **Esperado:** etiquetar «Compra #31», mostrar el nombre del alumno y un texto humano de la tarea.
- **Archivo probable:** `commerce-admin.component.ts` (bloque de `jobs`), `backend/src/routes/classPayments.routes.js` (`/admin/class-payment-jobs`).

### D3-DIN-07 · El motivo interno del revisor se muestra al comprador
- **Severidad:** media (privacidad). **Rol:** alumno. **Ruta:** `/class-packages/25`, sección «Solicitudes de reembolso».
- **Pasos:** admin aprueba con el motivo «Auditoría W19: trámite de prueba».
- **Obtenido:** el alumno ve «25 nov 2026 21:30 · America/Cordoba · UTC-03:00 · Aprobado internamente — pendiente de confirmación del proveedor simulado · Auditoría W19: trámite de prueba». Un motivo pensado como nota interna (por ejemplo «sospecha de abuso») llegaría al comprador.
- **Esperado:** separar «motivo auditado» (interno) de «mensaje al comprador».
- **Archivo probable:** `refund-request.component.ts` (`r.updates`, `u.reason`), `classRefunds.js` (`requests`).

### D3-DIN-08 · «Mis compras» no incluye los paquetes de clases
- **Severidad:** media. **Rol:** alumno. **Ruta:** `/student/purchases` (ES, 1440 y 390 px).
- **Obtenido:** «Mis compras · Historial de tus compras y recibos» lista solo los tres cursos de lucas (USD 71,20, 69,00 y 49,00, «Pagada», recibo «—»). El paquete de USD 90,00 (compra 25) y el de USD 50,00 (compra 31, ya reembolsado) no aparecen, de modo que el importe pagado y devuelto de un paquete solo se ve dentro de «Solicitudes de reembolso» de cada compra.
- **Esperado:** una sola lista del dinero movido, o un enlace claro a «Mis paquetes» desde esta pantalla.
- **Archivo probable:** `frontend/src/app/features/student/purchases/`.

### D3-DIN-09 · El saldo cambia «de N» y el historial no dice si sumó o restó
- **Severidad:** media. **Rol:** alumno (jane) y administración. **Ruta:** `/class-packages/26`.
- **Pasos:** ajuste +1 y luego −4 sobre la compra 26 (4 × 50 min).
- **Obtenido:** tras +1: «4 disponibles de 5 · Reservadas 1» (el paquete son «4 clases»). Tras −4 el contador pasa a «de 1». Historial: «Ajuste auditado: 1 · 25 nov 2026 21:38 — W19: alta de 1 crédito de prueba»; la baja también es «Ajuste auditado: 4» sin signo ni dirección. El alumno no recibe aviso en el chat ni por correo. En el panel de administración no hay lista de ajustes: solo «#26 · Disponibles: 4 · reservados: 1 · consumidos: 0» y no figura nombre del alumno, estado ni vencimiento.
- **Esperado:** «Ajuste: +1» / «Ajuste: −4» en el historial, comprados vs. ajustados por separado, aviso al alumno y lista de ajustes visible para quien ajusta.
- **Archivo probable:** `purchases.component.ts` (`packages.ledger.*`, `availableOf`), `classPurchases.js` (`present`), `commerce-admin.component.ts` (`purchase`).

### D3-DIN-10 · El panel pide una fecha en formato ISO
- **Severidad:** media (afecta el plazo de garantía). **Rol:** administración. **Ruta:** `/admin/class-commerce` → «Ajuste de créditos auditado» tras «Cargar y revisar saldo».
- **Aviso del usuario:** las fechas ISO no deben verse; el usuario no sabe qué es ISO.
- **Obtenido:** el campo se llama «Vencimiento más favorable verificado (fecha ISO con desplazamiento UTC); documenta la evidencia en el motivo», con el ejemplo `2026-11-30T14:00:00Z`. Hay que escribir la fecha a mano y la hora se indica en UTC, no en la zona de quien la carga (no se probó qué pasa con un formato incorrecto). Además queda dentro del bloque de ajuste de créditos, que no tiene relación.
- **Mismo patrón fuera de esta área:** en grupos, `packages.group.instantInput`: «Inicio tentativo acordado, con desplazamiento UTC (fecha/hora ISO)».
- **Esperado:** selector de fecha y hora con la zona del admin visible, y fuera del bloque de ajuste.
- **Archivo probable:** `commerce-admin.component.ts` (campo `verifiedDeadline`), `packages.i18n.ts` (`packages.admin.verifiedDeadline`, `packages.group.instantInput`).

### D3-DIN-11 · Cantidad decimal o enorme: mensaje del catálogo
- **Severidad:** baja. **Rol:** administración. **Ruta:** ajuste.
- **Pasos:** cantidad `1.5` (el botón se habilita: solo se bloquea `< 1`) o `99999999999`.
- **Obtenido:** el diálogo muestra «Revisa nombres, importes enteros, moneda, modalidad y condiciones en ambos idiomas.», un texto del formulario de paquetes que no tiene que ver con créditos.
- **Archivo probable:** `commerce-admin.component.ts` (`units<1`) y el mapeo de `validation_failed` en `packages.service.ts`.

### D3-DIN-12 · «Restaurar» sin consumidos: mensaje equivocado
- **Severidad:** baja. **Rol:** administración. **Ruta:** ajuste.
- **Obtenido:** «Restaurar» 1 en la compra 26 sin consumidos y «Quitar» 1 con 0 disponibles dan el mismo texto: «No hay suficientes créditos de clase disponibles.» (para restaurar debería hablar de créditos consumidos). Con 1 consumido «Restaurar» funciona: pasa de «Agotado» a «Activo».
- **Archivo probable:** `classCredits.js` (`insufficient_credit`, `bucket`), `packages.i18n.ts`.

### D3-DIN-13 · Formulario de ajuste poco guiado
- **Severidad:** baja. **Rol:** administración. **Ruta:** ajuste.
- **Obtenido:** «Compra» es un número sin buscador por alumno; tras cargarla solo se ve «#26 · Disponibles: 3 · reservados: 1 · consumidos: 0». Con cantidad 0 o −3 el botón queda deshabilitado sin ningún mensaje. El diálogo escribe la cantidad cruda: «Compra #26 · Agregar créditos disponibles · 1.5». Motivo vacío o de solo espacios: el envío queda deshabilitado (correcto).
- **Archivo probable:** `commerce-admin.component.ts` (`adjust`, plantilla del bloque de ajuste).

### D3-DIN-14 · Pausar: un clic gasta la única pausa
- **Severidad:** baja. **Rol:** alumno. **Ruta:** `/class-packages` → «Condiciones y acciones» → «Pausar paquete» (compra 25).
- **Obtenido:** sin confirmación ni explicación la compra pasa a «Pausado». La tarjeta sigue diciendo «Vence el 23 feb 2027» (el vencimiento cambiará al reanudar) y no dice que se reanuda sola. Chat: «Paquete #25 pausado.». Una pausa de 40 s gastó 1 de las 720 horas permitidas (`pausedHoursUsed` = 1, redondeo hacia arriba). Tras reanudar el vencimiento pasó de 00:23:49 a 00:24:29 UTC (+40 s, correcto), `pauseCount` 1 de 1 y el botón «Pausar paquete» desaparece sin ninguna explicación.
- **Esperado:** confirmación con las reglas («una pausa, hasta 30 días, se reanuda sola el …, el vencimiento se corre») y, después, un texto «Ya usaste tu pausa».
- **Archivo probable:** `purchases.component.ts` (`change`, condición `pauseCount<maxPauses`), `classPurchases.js` (`resumeLocked`).

### D3-DIN-15 · Pausa bloqueada: mensaje genérico
- **Severidad:** baja. **Rol:** alumno. **Ruta:** `/class-packages` (compra 25, con una propuesta pendiente).
- **Obtenido:** «Pausar paquete» muestra arriba de la pantalla «Resuelve las sesiones futuras o los créditos reservados antes de pausar o cancelar.» con «Reintentar», lejos del botón, sin listar qué sesión lo impide ni enlazar a la agenda. SPEC PACK-07 pide que el formulario enumere las sesiones y permita resolverlas. Tras rechazar la propuesta desde la agenda (función correcta, y mensaje «Se rechazó la propuesta de horario.» en el chat) la pausa se pudo hacer.
- **Archivo probable:** `purchases.component.ts` (`error()`), `classPurchases.js` (`unresolved`).

### D3-DIN-16 · Ofertas canceladas o vencidas con textos de oferta vigente
- **Severidad:** baja. **Rol:** docente y alumno. **Ruta:** `/class-offers/34` (cancelada) y `/class-offers/35` (vencida).
- **Obtenido:** «Cancelada» y «Vencida» siguen diciendo «La oferta vence: 2 de dic de 2026, 09:48 p. m. ART» y «La oferta vence: 24 de nov de 2026, 09:00 p. m. ART» (fecha ya pasada, en presente) y mantienen el botón «Actualizar estado». Además, tras «Continuar al pago» (oferta 33 en `checkout_pending`) el alumno vio la etiqueta «Enviada — pendiente de pago» mientras el docente ve «Pago pendiente» para ese mismo estado.
- **Archivo probable:** `offer-detail.component.html` / `offer-detail.component.ts`.

### D3-DIN-17 · Textos viejos y numeraciones que no coinciden tras un reembolso
- **Severidad:** baja. **Rol:** alumno. **Ruta:** `/class-packages/31` y `/messages/25`.
- **Obtenido:** con el reembolso ya confirmado («Reembolso confirmado por el proveedor. USD 50,00») la sección sigue diciendo «Importe total de compra a revisar: USD 50,00», «Corresponde trámite estándar de reembolso total sin uso…» y «Una solicitud o aprobación interna no significa dinero devuelto». El desglose dice «Disponibles: 0 · reservados: 0 · consumidos: 0» sin las 4 reembolsadas. Las solicitudes se llaman «#4», «#9» y «#23» (son ids del registro de auditoría: no son consecutivas). El chat dice «Reembolso confirmado para la oferta #33» mientras los demás avisos hablan de «Paquete #31».
- **Archivo probable:** `refund-request.component.ts`, `packages.i18n.ts` (`packages.event.*`), `classPayments.js` (`package_payment_refunded`).

### D3-DIN-18 · Vencido y reembolsado pasa a «Cancelado»
- **Severidad:** baja. **Rol:** alumno y docente. **Ruta:** compra 4 (Liam).
- **Pasos:** paquete vencido (`expired`, «Vencidas 4») → solicitud, aprobación y confirmación del reembolso.
- **Obtenido:** la orden queda `refunded` por 9000 (USD 90), la compra pasa de `expired` a `cancelled` y el saldo conserva «Vencidas 4» con «Reembolsadas 0». El docente lee «Cancelado · 0 disponibles de 4 · Vencidas 4» sin rastro del reembolso. La aprobación del admin sobre una compra vencida también sobrescribe el estado.
- **Archivo probable:** `classRefunds.js` (`review`: `p.update({status:'cancelled'…})`).

### D3-DIN-19 · Correo de compra en inglés y con hora UTC
- **Severidad:** baja (parte efecto de la semilla). **Rol:** alumno. **Ruta:** `backend/tmp/mail/`.
- **Obtenido:** el correo a `lucas@gmail.com` («Your class package is confirmed») dice «Paid: USD 50.00. Valid until February 24, 2027 at 12:34 AM GMT (UTC)», mientras la aplicación muestra «Vence el 23 feb 2027 · 21:34 · America/Cordoba». En inglés y con otra fecha de calendario. La causa es que la cuenta de la semilla no tiene idioma ni zona guardados; hay que confirmar que las cuentas reales los guarden al registrarse. Además no se genera ningún correo por reembolso confirmado, vencimiento ni pausa (solo `email.purchase_confirmed` y avisos de chat sin leer).
- **Archivo probable:** plantilla de `email.purchase_confirmed` en `backend/src/services` y su uso de idioma y zona del usuario.

### D3-DIN-20 · 390 px
- **Severidad:** baja. **Rol:** administración y docente. **Rutas:** `/admin/class-commerce`, `/teacher/orders`.
- **Obtenido:** el botón «Simular confirmación de reembolso del proveedor» (solo modo simulado) mide `left=50 right=397` en una ventana de 390 px y sobresale de su tarjeta; la página no tiene desplazamiento horizontal (`scrollWidth` = 390). En `/teacher/orders` la tabla muestra solo «Fecha» y «Comprador» al abrir; «Monto» y «Estado» quedan tras el desplazamiento horizontal (hay sombra en el borde). El resto de las pantallas listadas en la cobertura: sin desbordamiento y con botones de ancho completo.
- **Archivo probable:** `commerce-admin.component.ts` (estilos de `.item-actions`), `features/teacher/orders/`.

### D3-DIN-21 · Cancelar una oferta con un pago en revisión
- **Severidad:** baja. **Rol:** docente. **Ruta:** `/class-offers/32` («Gestionar oferta»).
- **Pasos:** oferta en `checkout_pending` con una orden «Para revisar»; motivo y «Cancelar esta oferta».
- **Obtenido:** alerta «Esta oferta no admite pagos en su estado actual.» (no habla de cancelar ni de que hay un pago en revisión), con el estado visible «Pago pendiente». El comprador sí ve «Payment received and under review. Do not pay again. The school will resolve it.».
- **Archivo probable:** `offer-detail.component.ts`, `packages.i18n.ts` (`offer_not_payable`).

### Observaciones fuera del área (no cuentan)
- En `/schedule` (docente) una clase ya dictada muestra «Esta propuesta fue reemplazada o resuelta. Revisa la agenda vigente antes de responder.» junto a «Asistencia registrada: Asistió».
- En `/class-offers/33` («Coordinación, cancelación y pausa») dice «Hasta 1 pausa(s), máximo 720 horas transcurridas» mientras la vigencia ya se muestra en días (D2-02 corregido solo para la vigencia). Lo mismo en «Política para ventas futuras»: «Vigencia de la oferta en horas», 168.

### Lo que funciona bien (verificado)
- Compra con el flujo simulado: `grant` único (`grant:order:33`), mensaje «Pago confirmado: se acreditaron 4 clases.», vencimiento = pago + 2160 h, zona del alumno visible.
- Reembolso completo: orden `refunded` 5000, ledger `refund` 4, chat «Reembolso confirmado…», y la UI del alumno pasa a «Reembolsadas 4».
- Doble reembolso y pausa/reanudación sobre una compra reembolsada: 409 por API y formulario oculto en la UI.
- Ajustes: saldo no negativo (`insufficient_credit`), motivo obligatorio con trim, clave de idempotencia por operación, «Restaurar» devuelve un consumido y reabre la compra agotada.
- Importes: USD, JPY (sin decimales), ARS y EUR bien formateados en ES; USD en EN. «Garantía 360 h» y «Vencimiento de referencia 10 dic 2026 21:23» (pago + 15 días) coinciden con los datos.
- Rechazar una propuesta desde la interfaz del alumno (pendiente de la segunda pasada) funciona.

## (d) Qué quedó sin probar

- Reanudación automática de una pausa a los 30 días (`purchase.resume`) y su efecto sobre el vencimiento; pausa con una clase confirmada y crédito reservado; pausa vista desde el panel del docente.
- Reembolso de proveedor real (rama `manual_hotmart`) y la acción «Acreditar tras revisión» de las órdenes «Para revisar»; reembolso parcial con importe distinto («Confirmar reembolso»); tipos «El servicio no puede prestarse» y «Grupo incompleto»; «Solicitar información» y «Registrar seguimiento manual» hasta su resolución.
- Pagos fallidos y compra real en ARS, EUR o JPY (solo se comprobó el formato del importe en el editor); paquetes de grupo (2 y 3 personas).
- Ajustes concurrentes con la misma clave de idempotencia desde la interfaz.
- Panel del docente en inglés y `/admin/class-commerce` en inglés.
- Diálogos y formularios de oferta a 390 px.
- No se verificó que un reembolso real deje el crédito reservado por una clase futura (la compra 2 no tenía reservas al reembolsar).
- Todo lo hecho con la preparación directa en la base desechable (apartado a) queda sin probar en condiciones reales: el reloj, la transacción del proveedor simulado y los estados de sesión se fijaron a mano.
