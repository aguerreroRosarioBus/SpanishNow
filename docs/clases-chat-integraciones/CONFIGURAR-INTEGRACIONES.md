# Configurar y probar Google Calendar y Zoom con cuentas reales de prueba

Guía para Andrés. Sirve para probar W07 (Google Calendar, #20) y W08 (Zoom, #21) **después de mergearlos** en la copia fija `~/Repos/SpanishNow-run`. No hace falta saber programar: son pasos para copiar, pegar y mirar la pantalla.

- Todo es **solo de prueba**: cuentas nuevas, sin cobros, sin alumnos reales. No hay producción.
- Las credenciales las cargás vos. Ninguna sesión de Claude las escribe ni las ve.
- Las sesiones no tocan `~/Repos/SpanishNow-run`. Editás `backend/.env` de esa copia vos mismo.
- Los detalles marcados «(lo define W07)» o «(lo define W08)» todavía no existen en el código: confirmalos contra el PR de cada paquete antes de seguir. Los nombres de pantalla de Google y Zoom cambian de tanto en tanto; los enlaces oficiales de cada paso son la fuente.

Fecha de verificación contra la documentación de cada proveedor: 23/10/2026.

---

## 0. Qué se puede probar y con qué

| Qué | Sin túnel | Con túnel HTTPS |
|---|---|---|
| Conectar Google Calendar, elegir calendario, ver ocupado/libre | Sí | Sí |
| Crear, mover y cancelar el evento de una sesión | Sí | Sí |
| Detectar que borraste o moviste el evento desde Google | Sí, **por sondeo** (tarda lo que tarde el job periódico; lo define W07) | Inmediato, por canal *push* |
| Revocar el acceso desde Google y ver el aviso | Sí (se nota al siguiente intento de sincronizar) | Sí |
| Conectar Zoom (OAuth) | **Probablemente no**: Zoom exige HTTPS en la URL de redirección y desaconseja `localhost` (ver §4.2) | Sí |
| Crear, mover y borrar la reunión de Zoom | Solo si pudiste conectar | Sí |
| Cambios hechos desde Zoom (webhook) | No | Sí |

Conclusión: **Google se puede probar entero sin túnel. Para Zoom conviene un túnel desde el principio**, porque además lo necesita el webhook. Un túnel es un programa que da una dirección pública `https://…` temporal que apunta a tu Mac.

---

## 1. Preparación (una sola vez)

### 1.1 Cuentas de prueba

Creá **cuentas nuevas**, no uses tus cuentas personales ni las de Solange:

| Cuenta | Para qué | Notas |
|---|---|---|
| Google del docente, p. ej. `spanishnow.docente.prueba@gmail.com` | Conecta Calendar | Un Gmail común alcanza. Tiene que estar en la lista de *test users* (§2.3). |
| Google del alumno, p. ej. `spanishnow.alumno.prueba@gmail.com` | Recibe la invitación y se ve el evento | No conecta nada en SpanishNow (CAL-01). |
| Zoom del docente | Conecta Zoom | Cuenta gratuita (Basic). Se crea en zoom.us con el correo del docente de prueba. |
| Zoom del alumno | **No hace falta** | El alumno entra con el enlace (ZOOM-01). Podés abrirlo sin sesión. |

Si ya tenés el proyecto de Google Cloud de las clases en vivo, la cuenta dueña del proyecto es la que ya usás; la cuenta docente de prueba es **otra** y entra como *test user*.

En SpanishNow (`https://localhost:4200`) necesitás además un **usuario docente** y un **usuario alumno** de prueba, con paquete de clases y una agenda lista para proponer una sesión (como en la verificación de W06). Si no los tenés, el seed curado (`npm run db:seed:curated` en la copia fija) crea cuentas de prueba; la contraseña la define `SEED_TEST_PASSWORD` en `backend/.env`.

> El correo del docente en SpanishNow no tiene que coincidir con el Gmail de prueba. Lo que se conecta es la cuenta de Google que elijas en la pantalla de Google.

### 1.2 Abrir siempre la app como `https://localhost:4200`

Google rechaza direcciones IP en las URLs de redirección y la copia fija sirve también por la IP de la red local. **Para esta prueba usá `https://localhost:4200` en el navegador de la Mac**, no la IP ni el celular. El certificado `mkcert` ya incluye `localhost` (DEVELOPMENT.md, «Copia fija de main»).

### 1.3 Generar los secretos

Solo si todavía no existen en `backend/.env`. Para `GOOGLE_TOKEN_ENCRYPTION_KEY` **ya hay una**: no la cambies, o los docentes ya conectados con Classroom/Drive tendrán que reconectar.

Si necesitás una nueva (32 bytes en base64), en Terminal:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

Copiá la línea que imprime. El `ZOOM_WEBHOOK_SECRET_TOKEN` **no se genera**: lo entrega Zoom (§4.4) y lo pegás en `.env`.

### 1.4 Instalar el túnel (recomendado)

Opción A, `cloudflared` (sin cuenta, gratis): instalación y límites en la [documentación de Quick Tunnels](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/do-more-with-tunnels/trycloudflare/).

```bash
brew install cloudflared
```

Para encenderlo apuntando al backend de la copia fija (puerto 3001, el de su `backend/.env`):

```bash
cloudflared tunnel --url http://localhost:3001
```

Imprime una dirección tipo `https://algo-aleatorio.trycloudflare.com`. **Esa dirección cambia cada vez que lo reiniciás** y deja de funcionar al cerrarlo. Dejá esa terminal abierta durante toda la prueba. Si cambia la dirección tenés que actualizar tres lugares: `.env`, la app de Zoom y (si usás push) la variable de Google (§2.5).

Opción B, ngrok (necesita cuenta gratuita): [ngrok.com](https://ngrok.com). Sirve igual; verificá en su sitio si la cuenta gratuita te da un dominio fijo, así no hay que reconfigurar cada vez.

En esta guía, `TUNEL` significa esa dirección HTTPS, sin barra final.

---

## 2. Google Calendar

### 2.1 Habilitar la Calendar API en el proyecto existente

Fuente: [Habilitar APIs](https://developers.google.com/workspace/guides/enable-apis).

1. Entrá a <https://console.cloud.google.com> con la cuenta dueña del proyecto de las clases en vivo.
2. Arriba a la izquierda, elegí el **mismo proyecto** donde ya habilitaste Classroom y Drive.
3. Menú ☰ → **APIs y servicios** → **Biblioteca**.
4. Buscá «Google Calendar API», entrá y tocá **Habilitar**. Se ve el botón azul «Habilitar» y después el panel de la API con gráficos vacíos.

### 2.2 Cliente OAuth: agregar la URL de redirección

Fuente: [OAuth 2.0 para aplicaciones de servidor web](https://developers.google.com/identity/protocols/oauth2/web-server) (reglas de URI: HTTPS salvo `localhost`, sin IP, sin comodines, coincidencia exacta incluida la barra final).

1. Consola → **Google Auth Platform** → **Clientes** (en consolas más viejas: APIs y servicios → Credenciales).
2. Abrí el cliente «Aplicación web» que ya usan las clases en vivo (el de `GOOGLE_OAUTH_CLIENT_ID`).
3. En **URI de redireccionamiento autorizados** tocá **Agregar URI** y pegá (sin espacios):

   ```
   http://localhost:3001/api/integrations/google-calendar/callback
   ```

   Google acepta `http` solo con `localhost`. El puerto `3001` es el del backend de la copia fija. Si el callback de W07 es otro (la ruta está fijada en CONTRATO §Rutas; el puerto lo da tu `backend/.env`), usá ese **exacto**. Un cambio de una letra da el error `redirect_uri_mismatch`.
4. **Guardar**. Puede tardar unos minutos en aplicarse.
5. El *client ID* y el *client secret* son los mismos que ya tenés; no hace falta crear otro cliente.

Con túnel y canales push **no** se agrega nada en esta pantalla: la URL del túnel para notificaciones se pasa por API, no se autoriza aquí.

### 2.3 Pantalla de consentimiento en modo Testing con *test users*

Fuente: [Configurar el consentimiento OAuth](https://developers.google.com/workspace/guides/configure-oauth-consent).

1. Consola → **Google Auth Platform** → **Público** (Audience).
2. Comprobá que el tipo de usuario sea **Externo** y el estado de publicación **Prueba** (Testing). No lo publiques.
3. En **Usuarios de prueba** → **Agregar usuarios** → escribí el Gmail del docente de prueba → **Guardar**. Solo estas cuentas pueden autorizar mientras esté en Testing.
4. **Acceso a los datos** → **Agregar o quitar permisos** → agregá los permisos de Calendar del paso siguiente → **Actualizar** → **Guardar**.

Permisos (*scopes*) de Calendar según la [documentación oficial de scopes](https://developers.google.com/workspace/calendar/api/auth):

| Scope (después de `https://www.googleapis.com/auth/`) | Qué permite | ¿Hace falta? |
|---|---|---|
| `calendar.events.owned` | Leer, crear, modificar y borrar eventos **solo en calendarios que el usuario posee** | **Sí** (el más acotado que alcanza para crear/editar eventos propios de SpanishNow) |
| `calendar.freebusy` | Ver solo disponibilidad (ocupado/libre) | **Sí** (CAL-02: free/busy sin leer eventos ajenos) |
| `calendar.calendarlist.readonly` | Listar los calendarios del usuario para elegir el destino | **Sí** (para el selector del paso 3.2) |
| `calendar.events` | Ver y editar eventos en **todos** los calendarios | **No usar**: es más amplio |
| `calendar` (acceso total) | Todo | **No usar** |
| `calendar.app.created` | Crear calendarios secundarios y manejar sus eventos | Alternativa solo si W07 decide crear un calendario propio «SpanishNow» en vez de usar uno existente |

Los tres «Sí» y los que W07 use finalmente están **(lo define W07)**: la lista exacta es la constante de scopes del servicio; esta tabla es lo mínimo que la SPEC (CAL-01, CAL-02) permite. Si W07 pidiera un scope más amplio que `calendar.events.owned`, anotarlo en el PR. Además del correo (`userinfo.email`) que ya usa Classroom.

Hay que agregar los scopes a la pantalla de consentimiento para que aparezcan como permisos que Google muestra; si falta uno, la autorización falla o el permiso no se otorga.

### 2.4 Límites del modo Testing (importante)

Fuente: [Vencimiento de tokens de actualización](https://developers.google.com/identity/protocols/oauth2#expiration).

- Con la app en **Testing**, Google emite *refresh tokens* que **vencen a los 7 días** (salvo que los permisos sean solo nombre/correo/perfil). Después de una semana la conexión del docente cae en estado «requiere atención» y hay que **reconectar**. No es un error de SpanishNow: es el comportamiento esperado y es una buena ocasión para probar el paso de reconexión.
- Máximo **100 *refresh tokens* por cuenta y por cliente**: si conectás y desconectás muchas veces, los más viejos dejan de servir.
- Un token también deja de servir si la persona revoca el acceso o pasan 6 meses sin usarlo.
- Mientras sea modo Testing, la primera autorización muestra «Google no ha verificado esta app». Es normal para *test users*: **Avanzar** → **Continuar**.

### 2.5 Variables en `~/Repos/SpanishNow-run/backend/.env`

Abrí el archivo con tu editor (no lo pegues en chats ni commits). Ya tenés las de Classroom/Drive; agregá o completá:

```
# Ya existentes (no cambiar)
GOOGLE_OAUTH_CLIENT_ID=...
GOOGLE_OAUTH_CLIENT_SECRET=...
GOOGLE_TOKEN_ENCRYPTION_KEY=...

# Nuevas para Calendar (nombres fijados por el orquestador; el .env.example lo agrega W07)
GOOGLE_CALENDAR_REDIRECT_URI=http://localhost:3001/api/integrations/google-calendar/callback
# Solo si usás túnel; sin esto la sincronización es por sondeo:
GOOGLE_CALENDAR_NOTIFICATIONS_URL=https://TUNEL/api/integrations/google-calendar/notifications

FEATURE_GOOGLE_CALENDAR=1
FEATURE_CLASS_SCHEDULING=1
# INTEGRATIONS_FAKE debe estar ausente o comentado. Con =1 se usan adaptadores falsos y NO hablás con Google.
```

Notas:
- `GOOGLE_CALENDAR_REDIRECT_URI` tiene que ser **idéntica** a la que cargaste en la consola (§2.2).
- `GOOGLE_CALENDAR_NOTIFICATIONS_URL` tiene que ser HTTPS con certificado válido; los autofirmados o `mkcert` **no sirven** para Google ([guía de notificaciones push](https://developers.google.com/workspace/calendar/api/guides/push)).
- El nombre exacto de la ruta de notificaciones sale del CONTRATO (`POST /api/integrations/google-calendar/notifications`).
- Después de editar `.env`: `spanishnow off` y `spanishnow on`.
- Si el PR de W07 cambia el nombre de alguna variable, vale lo que diga su `.env.example`.

---

## 3. Recorrido de verificación de Google Calendar

Marcá cada ítem. Nombres de botones y textos de SpanishNow: **(lo define W07)**.

### 3.1 Conectar
1. Encendé la copia fija: `spanishnow on`. Abrí `https://localhost:4200` en Chrome.
2. Ingresá como **docente** de prueba. Andá a la sección de integraciones/agenda **(lo define W07)**.
3. Tocá **Conectar Google Calendar**. El navegador va a Google. Elegí el Gmail del docente de prueba.
4. Google puede decir «Google no ha verificado esta app» → **Avanzar** → **Continuar**. Después muestra los permisos de Calendar → **Continuar/Permitir**.
5. Volvés a SpanishNow. Se ve el estado «Conectado» y el correo de la cuenta.
- [ ] Conectado, con el correo correcto.
- [ ] Las clases en vivo (Classroom/Drive) del mismo docente siguen funcionando: Calendar es independiente (CAL-08).

### 3.2 Elegir calendario
- [ ] Aparece la lista de calendarios del Gmail de prueba.
- [ ] Elegí un **calendario destino** (para los eventos de SpanishNow) y marcá uno o más para **ver ocupación**. Guardá.
- [ ] En Google Calendar (calendar.google.com, docente) creá un evento propio, p. ej. mañana 10:00–11:00 «Cita médica».

### 3.3 Proponer y confirmar
1. Ingresá como **alumno** (otra ventana de incógnito).
2. Con paquete de clases, proponé una sesión para mañana **a las 10:30**, que choca con «Cita médica».
- [ ] El docente ve un **aviso de conflicto** (solo «ocupado», sin título del evento ajeno, CAL-02/CAL-03).
3. Proponé otro horario libre y confirmalo como docente.
- [ ] En el calendario destino aparece **un evento** de la sesión, con hora y zona correctas (CAL-04).
- [ ] El Gmail del alumno de prueba recibe la invitación, sin lista de otros invitados, sin poder invitar a terceros ni editar (CAL-05).
- [ ] La descripción no contiene mensajes privados ni enlace de anfitrión.

### 3.4 Reprogramar
- [ ] Proponé y aceptá un cambio de horario. El **mismo** evento se mueve (no se crea un duplicado).

### 3.5 Cambios hechos desde Google
- [ ] En Google Calendar, mové o borrá el evento de SpanishNow. SpanishNow **no** reprograma sola: muestra un aviso de divergencia al docente (CAL-06). Sin túnel puede tardar hasta el próximo sondeo; con túnel y push es casi inmediato.

### 3.6 Cancelar
- [ ] Cancelá la sesión en SpanishNow: el evento desaparece o queda cancelado en Google; el alumno recibe la cancelación.

### 3.7 Revocar acceso desde Google y reconectar
1. Con la cuenta docente en Google: <https://myaccount.google.com/permissions> → la app → **Dejar de permitir el acceso**.
2. Volvé a SpanishNow y provocá una sincronización (confirmá o movés una sesión).
- [ ] Aparece el aviso «requiere atención/reconectar» **(lo define W07)**. No se pierden sesiones ni historial.
- [ ] Tocá **Reconectar**, repetí 3.1 y comprobá que la sincronización vuelve.
- [ ] Classroom/Drive no se rompió por revocar solo Calendar. (Si comparten autorización en Google, revocar el acceso puede cortar todo: anotarlo en CAL-08.)

---

## 4. Zoom

### 4.1 Crear la app (General app, OAuth, administrada por el usuario)

Fuente: [Crear una app](https://developers.zoom.us/docs/integrations/create/).

1. Entrá a <https://marketplace.zoom.us> con la cuenta Zoom del **docente de prueba** (tiene que ser la dueña de la cuenta).
2. Arriba a la derecha: **Develop** → **Build App**.
3. Elegí **General App** → **Create**.
4. Nombre: «SpanishNow Pruebas».
5. **Select how the app is managed**: **User-managed**. Así el docente autoriza solo su cuenta (ZOOM-01).
6. En **App Credentials** se muestran el *Client ID* y el *Client Secret* de **desarrollo** (Development). Copialos cuando estén visibles; el secret puede mostrarse una vez.
7. No publiques la app. Para probar con tu propia cuenta no hace falta pasar por revisión de Zoom; la página **Local Test** permite agregar la app a tu cuenta (puede ser necesario tocar **Add App Now** más adelante).

### 4.2 URL de redirección y allow list

Fuente: [OAuth de Zoom](https://developers.zoom.us/docs/integrations/oauth/).

- Las apps que no usan PKCE público **deben usar redirecciones HTTPS**; si no, Zoom devuelve «Invalid redirect».
- Zoom pide no usar `localhost` en la redirección (acepta el literal `127.0.0.1` solo para clientes PKCE públicos o nativos) y hay reportes de foros de que `localhost` dejó de funcionar en la app de desarrollo desde septiembre de 2025 ([hilo en el foro de Zoom](https://devforum.zoom.us/t/403-error-in-oauth-redirect-url-occurs-in-development-environment-when-url-includes-localhost/137433)). Por eso este paso usa el túnel.

En la app, sección **Basic Information** → **OAuth Information**:

1. **OAuth Redirect URL for Production**/«Redirect URL»: pegá
   ```
   https://TUNEL/api/integrations/zoom/callback
   ```
2. **OAuth Allow List**: agregá la **misma URL** completa (o el dominio base del túnel).
3. Dejá **Strict Mode** apagado al empezar (si lo activás, la URL debe coincidir exacta).
4. Guardar.

Si no querés usar túnel para el flujo OAuth, probá `https://localhost:4200/api/integrations/zoom/callback` (la app Angular de la copia fija reenvía `/api` al backend, y el certificado `mkcert` es de confianza para tu navegador). Puede funcionar o dar error 403/«Invalid redirect»; si falla, usá el túnel. Anotalo en §«Ajustes».

### 4.3 Scopes mínimos

Fuente: [Scopes granulares de Zoom](https://developers.zoom.us/docs/integrations/oauth-scopes-granular/). En **Scopes** → **Add Scopes** → **Meeting**:

| Scope | Para qué (ZOOM-xx) |
|---|---|
| `meeting:write:meeting` | Crear la reunión de una sesión confirmada (ZOOM-02/04) |
| `meeting:update:meeting` | Reprogramar la misma reunión (ZOOM-04) |
| `meeting:delete:meeting` | Borrar al cancelar (ZOOM-04) |
| `meeting:read:meeting` | Leer una reunión para reconciliar (ZOOM-04/07) |
| `user:read:settings` (o el equivalente de lectura de configuración del usuario) | Leer la configuración y capacidades de la cuenta (ZOOM-05, ZOOM-06) **(lo define W08)** |

No pidas scopes de grabación, chat ni admin: Zoom revisa que cada scope sea necesario. **Verificá el nombre exacto de los scopes de configuración de usuario en la pantalla de Zoom**: la página oficial consultada no lista `user:read:settings`, por lo que W08 debe confirmar cuál es el correcto y anotarlo aquí. Para correo/cuenta del usuario Zoom puede exigir además un scope de lectura de usuario **(lo define W08)**.

### 4.4 Event Subscriptions y Secret Token

Fuente: [Webhooks de Zoom](https://developers.zoom.us/docs/api/webhooks/).

1. En la app → **Features** → **Access**: copiá el **Secret Token** (botón de copiar; hay una opción para regenerarlo). Ese valor va en `ZOOM_WEBHOOK_SECRET_TOKEN`.
2. Activá **Event Subscriptions** → **Add new event subscription**: nombre «SpanishNow Pruebas».
3. **Event notification endpoint URL**:
   ```
   https://TUNEL/api/integrations/zoom/webhook
   ```
4. Eventos a suscribir (Zoom agrega solos los scopes necesarios) **(lo define W08)**: los de reunión actualizada/borrada y el de **desautorización de la app**.
5. **Validate**. Para que funcione, el backend ya tiene que estar encendido con `ZOOM_WEBHOOK_SECRET_TOKEN` cargado y con el túnel abierto. Zoom manda un evento `endpoint.url_validation` y espera en menos de 3 segundos la respuesta firmada con HMAC-SHA-256. Se ve un tilde verde «Validated». Zoom revalida el endpoint cada 72 horas.
6. **Save**.

El endpoint debe ser HTTPS público con certificado de una autoridad reconocida y nombre de dominio completo. Un `mkcert` o una IP no sirven. Los reintentos de Zoom ante errores 5xx son a los 5, 20 y 60 minutos.

### 4.5 Variables en `backend/.env`

```
ZOOM_CLIENT_ID=...
ZOOM_CLIENT_SECRET=...
ZOOM_REDIRECT_URI=https://TUNEL/api/integrations/zoom/callback
ZOOM_WEBHOOK_SECRET_TOKEN=...
FEATURE_ZOOM=1
FEATURE_CLASS_SCHEDULING=1
```

(`INTEGRATIONS_FAKE` ausente.) Después: `spanishnow off` y `spanishnow on`. Cada vez que cambie la dirección del túnel hay que actualizar `ZOOM_REDIRECT_URI`, la redirección y el allow list en Zoom, y la URL del endpoint de eventos.

### 4.6 Qué permite una cuenta gratuita

Fuente: [Zoom: límites del plan Basic](https://support.zoom.com/hc/en/article?id=zm_kb&sysparm_article=KB0063110).

- Cada reunión del anfitrión con plan gratuito dura como máximo **40 minutos**, incluso entre dos personas, y hasta 100 participantes.
- Para ZOOM-05 (no suponer licencias ni duración máxima): programá una sesión de **60 minutos** con la cuenta gratuita y comprobá que SpanishNow **avisa antes de confirmar** que la cuenta no soporta esa duración (o que lo marca como problema accionable) **(lo define W08)**. Una sesión de 30 minutos debe confirmarse sin aviso.
- Los límites de reuniones simultáneas no se prueban con una sola cuenta; la regla de SpanishNow ya impide que un docente dicte dos clases a la vez.

---

## 5. Recorrido de verificación de Zoom

Textos y botones **(lo define W08)**.

### 5.1 Conectar
1. Docente de prueba → integraciones → **Conectar Zoom**. Va a zoom.us → iniciá con la cuenta Zoom del docente de prueba.
2. Zoom muestra la lista de permisos solicitados → **Allow**. Si la app aún no está agregada a la cuenta, puede pedirte primero «Add App» desde **Local Test**.
3. Volvés a SpanishNow con «Zoom conectado» y la cuenta.
- [ ] Conectado.

### 5.2 Proponer y confirmar
- [ ] Alumno propone una sesión de 30 min; el docente confirma. Aparece la **reunión de Zoom** (enlace de participante) en la pantalla de clase y en el evento de Calendar si ambas están conectadas.
- [ ] El alumno ve **solo** el enlace de participante. El enlace de anfitrión (`start_url`) lo ve solo el docente. Revisá que no esté en el chat, en el correo ni en el evento de Calendar (ZOOM-03).
- [ ] En <https://zoom.us/meeting> (docente) aparece la reunión programada con la fecha y hora correctas.
- [ ] Sala de espera activa y sin grabación automática (ZOOM-06).

### 5.3 Límite gratuito
- [ ] Probá el caso de 60 minutos (§4.6).

### 5.4 Reprogramar y cancelar
- [ ] Reprogramá: la misma reunión cambia de hora en zoom.us.
- [ ] Cancelá la sesión: la reunión se borra de zoom.us y SpanishNow no cancela dos veces.

### 5.5 Webhook
- [ ] Borrá o editá la reunión desde zoom.us. SpanishNow lo detecta y avisa; un evento repetido no completa la clase ni descuenta saldo (ZOOM-08). En el panel de Zoom (**Event Subscriptions**) se puede ver si las entregas llegaron.

### 5.6 Revocar y reconectar
1. En zoom.us: **Account/Profile** → **Apps** (o <https://marketplace.zoom.us/user/installed>) → quitá la app.
2. En SpanishNow provocá una acción de Zoom.
- [ ] Aviso de reconexión; las sesiones siguen intactas.
- [ ] Reconectar y que vuelva a funcionar.
- [ ] Contingencia: pegá un enlace de Zoom manual y verificá que se ve «manual» y que se valida (ZOOM-07).

Los *refresh tokens* de Zoom duran 90 días y rotan cada vez que se usan (se guarda el nuevo): no deberías ver vencimientos durante la prueba.

---

## 6. Errores comunes

| Mensaje / síntoma | Causa y arreglo |
|---|---|
| Google: `redirect_uri_mismatch` | La URL de la consola no es **exactamente** la de `GOOGLE_CALENDAR_REDIRECT_URI` (puerto, `http`/`https`, barra final). Corregir una de las dos y esperar unos minutos. |
| Google: «Acceso bloqueado: esta app no ha completado la verificación» / `access_denied` | El Gmail no está en *Usuarios de prueba* (§2.3). |
| Google: «Esta app no está verificada» | Normal en Testing. **Avanzar** → **Continuar**. |
| Google: «Debes autorizar…» o faltan permisos | No marcaste todas las casillas en la pantalla de permisos, o falta un scope en *Acceso a los datos*. Revocar en <https://myaccount.google.com/permissions> y reconectar. |
| Conexión de Google que cae a la semana | *Refresh token* de 7 días en modo Testing (§2.4). Reconectar. |
| Google: 403 «API has not been used / disabled» | Falta habilitar Calendar API en el **mismo proyecto** (§2.1). |
| El canal push no llega | Sin `GOOGLE_CALENDAR_NOTIFICATIONS_URL`, túnel apagado, o la dirección cambió al reiniciar el túnel. Reiniciar `spanishnow` para que se registre otro canal. Sin push, el sondeo igual sincroniza. |
| Zoom: «Invalid redirect» (4700) o 403 en la redirección | Falta la URL en *Redirect URL* **y** en *OAuth Allow List*, no es HTTPS, o se usó `localhost`. Usar la dirección del túnel. |
| Zoom: «Validation failed» al guardar el endpoint | Backend apagado, túnel apagado, `ZOOM_WEBHOOK_SECRET_TOKEN` distinto al del panel, o respuesta tardó más de 3 s. |
| Zoom: el túnel se reinició y todo falla | La dirección cambió. Actualizar las tres cosas de §4.5. |
| «La integración … todavía no está configurada» (503) | Faltan variables en `.env` o no reiniciaste `spanishnow`. |
| 404 `feature_disabled` | Flag apagado (`FEATURE_GOOGLE_CALENDAR`, `FEATURE_ZOOM`, `FEATURE_CLASS_SCHEDULING`). |
| Se ve «modo fake» / no aparece nada en Google ni Zoom | `INTEGRATIONS_FAKE=1` está activo. Sacarlo. |
| Falla al conectar desde el celular o por IP | Google no acepta IP en la redirección. Usá `https://localhost:4200` en la Mac. |

---

## 7. Desconectar y borrar todo al terminar

1. En SpanishNow, docente: **Desconectar** Google Calendar y Zoom **(lo define W07/W08)**. Esto no borra sesiones ni historial.
2. Borrá a mano los eventos de prueba en Google Calendar y las reuniones en zoom.us (desconectar no los borra).
3. Revocá los accesos: <https://myaccount.google.com/permissions> (Google) y *Installed Apps* en Zoom.
4. Zoom: en el Marketplace borrá la app «SpanishNow Pruebas» (**Manage** → la app → **Delete**), o al menos regenerá el *Client Secret* y el *Secret Token*.
5. Google: sacá el Gmail de prueba de *Usuarios de prueba* y quitá la URI de redirección de Calendar si no la vas a usar más. Si la clave del cliente OAuth se filtró, **Restablecer secreto** en la consola (los docentes de Classroom/Drive tendrán que reconectar).
6. En `~/Repos/SpanishNow-run/backend/.env` quitá o comentá: `FEATURE_GOOGLE_CALENDAR`, `FEATURE_ZOOM`, `GOOGLE_CALENDAR_REDIRECT_URI`, `GOOGLE_CALENDAR_NOTIFICATIONS_URL`, `ZOOM_*`. Reiniciá con `spanishnow off` y `spanishnow on`.
7. Cerrá la terminal del túnel (`Ctrl+C`): la dirección pública deja de existir.
8. Si querés sacar todo de la base de prueba, que lo haga una sesión de Claude sobre `spanishnow_main` bajo tu pedido; no lo borres a mano.

---

## Ajustes para W07/W08

Hallazgos que pueden requerir cambios en los nombres fijados o en el CONTRATO. Los comentarios van en #20 (W07) y #21 (W08).

**W07 (Google Calendar)**
1. **Redirección con `localhost`**: Google acepta `http://localhost:<puerto>` en clientes web, pero no IPs. La copia fija debe probarse en `https://localhost:4200`. `GOOGLE_CALENDAR_REDIRECT_URI` queda como `http://localhost:3001/api/integrations/google-calendar/callback`. Ojo: el servicio de Classroom (`liveGoogleService.js`) solo admite `http` si el host es `localhost`/`127.0.0.1` y `NODE_ENV` no es producción; W07 debería aplicar la misma validación y no depender de cookies de terceros (hoy usa una cookie `spanishnow_google_state` y una navegación de primera parte `…/start`).
2. **Scope mínimo**: `calendar.events.owned` + `calendar.freebusy` + `calendar.calendarlist.readonly` alcanza para CAL-01/02; evitar `calendar.events` y `calendar`. Documentar en el PR si hace falta otro. Dado el grant de Classroom/Drive: usar `include_granted_scopes` con cuidado (CAL-08, no mezclar grants).
3. **Free/busy no es *push***: el recurso FreeBusy no se puede observar con canales, solo Events, CalendarList, Acl y Settings. Los canales deben ser sobre *events* de cada calendario relevante, y la ocupación se consulta por API antes de confirmar (CAL-03).
4. **Canales push**: exigen HTTPS con certificado válido (mkcert no sirve), vencen y no se renuevan solos. Con túnel `trycloudflare` cada reinicio cambia la URL: W07 debe tolerar `GOOGLE_CALENDAR_NOTIFICATIONS_URL` cambiante (detener canales viejos con `channels.stop`, registrar nuevos) y caer a sondeo cuando falta.
5. **Testing**: *refresh tokens* de 7 días; W07 debe pasar a «requiere atención» en `invalid_grant`, no a error genérico (CAL-08).
6. **Puerto**: la copia fija usa backend 3001, el `.env.example` de Classroom sugiere 3000. El ejemplo de `GOOGLE_CALENDAR_REDIRECT_URI` en `.env.example` debería aclararlo.

**W08 (Zoom)**
1. **`http://localhost` no sirve como redirección de Zoom**: las apps OAuth sin PKCE público exigen HTTPS, y Zoom recomienda no usar `localhost`. Para la prueba real hace falta un túnel HTTPS; `ZOOM_REDIRECT_URI` apunta al túnel. Hay un riesgo de que `https://localhost:4200/api/...` (mkcert) falle con 403; si W08 lo verifica y funciona, se puede simplificar la guía.
2. **Webhook**: solo con URL pública HTTPS con CA reconocida; hay que responder `endpoint.url_validation` en menos de 3 s con HMAC-SHA-256 del `plainToken` y el Secret Token, verificar `x-zm-signature` (`v0:{timestamp}:{cuerpo crudo}`) con el cuerpo **sin parsear** y manejar reintentos a 5/20/60 min. Zoom revalida cada 72 h.
3. **Sin túnel no hay eventos de Zoom**: W08 debería tener un sondeo de respaldo (reconciliación periódica por `GET meeting`) o aclarar que no lo tiene.
4. **Scope de configuración de usuario**: la página oficial de scopes granulares no mostró `user:read:settings`; W08 debe fijar el nombre correcto y documentarlo aquí.
5. **Rotación de refresh token**: Zoom entrega un refresh token nuevo en cada refresh y vence a los 90 días: guardar siempre el último (ZOOM-08).
6. **Cuenta gratuita**: 40 minutos por reunión. ZOOM-05 debe resolverse antes de proponer sesiones más largas; hoy la API no garantiza por sí sola ese dato (**lo define W08** si lo lee de la configuración de la cuenta).
7. **Nombres de variables**: no hay conflicto con `ZOOM_CLIENT_ID`, `ZOOM_CLIENT_SECRET`, `ZOOM_REDIRECT_URI`, `ZOOM_WEBHOOK_SECRET_TOKEN`.

---

## Enlaces oficiales usados

- Google Calendar, scopes: <https://developers.google.com/workspace/calendar/api/auth>
- Google Calendar, notificaciones push: <https://developers.google.com/workspace/calendar/api/guides/push>
- Google OAuth web server (URIs de redirección): <https://developers.google.com/identity/protocols/oauth2/web-server>
- Google OAuth, vencimiento de tokens: <https://developers.google.com/identity/protocols/oauth2#expiration>
- Google, pantalla de consentimiento: <https://developers.google.com/workspace/guides/configure-oauth-consent>
- Zoom, crear una app: <https://developers.zoom.us/docs/integrations/create/>
- Zoom, OAuth: <https://developers.zoom.us/docs/integrations/oauth/>
- Zoom, scopes granulares: <https://developers.zoom.us/docs/integrations/oauth-scopes-granular/>
- Zoom, webhooks: <https://developers.zoom.us/docs/api/webhooks/>
- Zoom, plan Basic (40 min): <https://support.zoom.com/hc/en/article?id=zm_kb&sysparm_article=KB0063110>
- Cloudflare Quick Tunnels: <https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/do-more-with-tunnels/trycloudflare/>
