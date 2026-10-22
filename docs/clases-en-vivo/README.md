# Clases en vivo — MVP

Pizarra colaborativa propia de SpanishNow, inspirada en Jamboard. Google retiró Jamboard el 31 de diciembre de 2024; este módulo funciona sin depender de ese producto.

## Uso

1. Entrar como docente a **Clases en vivo** en el menú lateral (`/live`).
2. Crear una clase independiente o asociada a un curso propio. Preparar las páginas en estado **Preparando**.
3. Dibujar con mouse, lápiz o pantalla táctil; agregar formas, texto, notas adhesivas, imágenes subidas o de Google Imágenes. **Seleccionar** permite mover, editar y cambiar el tamaño. El menú de cada elemento permite eliminarlo con confirmación.
4. **Iniciar clase** y **Invitar alumnos**. El enlace requiere una cuenta de alumno de SpanishNow; se conserva al iniciar sesión o registrarse.
5. Los alumnos siguen la página activa del docente. Pueden explorar otra página y activar nuevamente **Seguir al docente**. Cada alumno modifica sus propios elementos; el docente administra todo el contenido.
6. En **Participantes**, el docente puede pausar la edición. **Más acciones → Finalizar clase** deja la pizarra en modo lectura para alumnos. Quienes ya participaron pueden volver por el mismo enlace; alumnos inscritos en un curso asociado también pueden consultarla. El docente puede seguir preparando el contenido o reabrir la sala.

Una sala admite 20 páginas, 500 elementos por página y 1,5 MB de contenido estructurado. Las imágenes se guardan en Cloudinary y se referencian por URL, con límite de 5 MB por subida. La búsqueda de Google usa la [configuración de imágenes](../imagenes-google/README.md).

La interfaz usa el sistema de [REDISENO_UI.md](../rediseno-ui/REDISENO_UI.md): tokens cálidos, Poppins/Nunito Sans, controles compactos, un botón principal, menús para acciones destructivas y confirmaciones.

La sala tiene una distribución de tablero inspirada en Miro: lienzo a todo el ancho disponible, herramientas en una barra vertical flotante, opciones contextuales de dibujo, paneles superpuestos y páginas con miniaturas. Los botones de zoom permiten acercar/alejar entre 10 % y 200 %; **Ajustar a pantalla** centra el marco. La herramienta **Desplazar lienzo** recorre el espacio alrededor de la página sin modificar su contenido. Zoom y desplazamiento son preferencias locales de la vista; no cambian la página ni la escala de los demás participantes.

## Google Classroom y Drive

La integración es **OAuth por docente de la plataforma**. Las conexiones de Google del asistente de desarrollo no configuran las cuentas de los usuarios de SpanishNow.

- **Classroom:** listar clases activas donde la cuenta conectada sea docente, vincular un grupo y publicar explícitamente un anuncio con el enlace de la sala. La API comprueba que sea docente del grupo. Una publicación ya confirmada se reutiliza para evitar duplicarla al pulsar nuevamente.
- **Drive:** guardar todas las páginas como `Título.spanishnow.json`, un archivo editable de SpanishNow. Las siguientes exportaciones actualizan ese archivo. Buscar archivos creados por la aplicación y restaurarlos, con confirmación, cuando la sala no esté en vivo. La restauración valida el formato y no sobrescribe una revisión que cambió mientras se descargaba.
- **Recursos de Drive:** colocar tarjetas con enlaces HTTPS a Drive, Docs o Slides. Los permisos de esos archivos se administran en Google; agregar el enlace no los vuelve públicos.
- **Descargas:** copia JSON de todas las páginas y PNG de la página actual desde el menú de la sala. El PNG requiere que las imágenes permitan descarga CORS.

No se importan listas de alumnos, tareas ni calificaciones de Classroom en este MVP. Los alumnos acceden con cuentas de SpanishNow. No se incorpora audio, videollamada, grabación, cursores remotos ni una API de Jamboard.

### Configuración

1. En Google Cloud, habilitar **Google Classroom API** y **Google Drive API**.
2. Configurar la pantalla de consentimiento OAuth y los usuarios de prueba si el proyecto está en modo de pruebas. Las políticas de Google y del administrador de Workspace pueden requerir verificación o autorización para distribución pública.
3. Crear un cliente OAuth de tipo **Aplicación web**. Registrar la URI de retorno exacta del backend.
4. Configurar en `backend/.env` (secretos solo en servidor):

```dotenv
GOOGLE_OAUTH_CLIENT_ID=...
GOOGLE_OAUTH_CLIENT_SECRET=...
GOOGLE_OAUTH_REDIRECT_URI=http://localhost:3001/api/live-classes/google/callback
GOOGLE_TOKEN_ENCRYPTION_KEY=...
FRONTEND_URL=http://localhost:4200
```

Generar `GOOGLE_TOKEN_ENCRYPTION_KEY` una sola vez con `openssl rand -base64 32`. Guardarla como secreto estable en todos los procesos y despliegues. Si se pierde o cambia, los docentes necesitan volver a conectar Google. En producción, las URLs de frontend y callback deben ser HTTPS.

5. Ejecutar `cd backend && npm run db:migrate`. La migración aditiva `20261105000000-create-live-classes.js` crea `live_classes`, `live_class_members` y `google_connections`. No reconstruir la base. Un rollback con datos exige `CONFIRM_LIVE_CLASS_DATA_LOSS=yes`.
6. En **Clases en vivo**, elegir **Conectar Google** y aceptar todos los permisos. La conexión usa una navegación al backend y luego a Google, sin depender de cookies de terceros.

Scopes solicitados:

- `userinfo.email`: identificar la cuenta conectada.
- `classroom.courses.readonly`: listar clases.
- `classroom.announcements`: publicar la invitación.
- `drive.file`: archivos creados por SpanishNow. No otorga lectura de todo el Drive.

Los tokens de acceso y renovación se cifran con AES-256-GCM en la base. OAuth usa estado aleatorio de un solo uso, caducidad de diez minutos, cookie HttpOnly/SameSite y PKCE. La renovación está serializada en la base. Las respuestas del módulo no devuelven tokens ni secretos. **Desconectar** revoca el permiso de Google y elimina la conexión local.

La sala funciona aunque Google no esté configurado; los controles de conexión explican ese estado. Las pruebas locales no requieren enviar información a Google. La autorización y las operaciones reales de Classroom/Drive deben comprobarse con el proyecto OAuth configurado; las pruebas automatizadas del proveedor usan respuestas simuladas.

## Sincronización y permisos

- Consulta autenticada de cambios aproximadamente cada 1,8 s en primer plano y 10 s con pestaña oculta. Las contribuciones aparecen cuando se termina el trazo o se confirma una edición; no hay streaming punto a punto del lápiz.
- Presencia con heartbeat cada 12 s y ventana de actividad de 45 s. La vista muestra hasta 50 participantes activos; no representa un conteo de asistencia.
- Las operaciones se aplican sobre la última pizarra bajo un bloqueo de fila MySQL. Agregar elementos diferentes combina aportes; modificar un elemento requiere su versión actual. Borrar una página o vaciarla requiere la revisión de sala actual. No se reemplaza la pizarra completa desde el navegador.
- Identificadores de operaciones recientes para reintentos idempotentes, con una ventana de 1000 operaciones por sala. Fuera de esa ventana, una creación repetida entra en conflicto por la versión del objeto, sin duplicarlo.
- El navegador conserva una vista de los cambios pendientes mientras la pantalla siga abierta. Si hay un error, ofrece reintentar, descargar una copia o descartar con confirmación. Salir o cerrar con cambios pendientes muestra una advertencia. No hay edición offline persistente entre reinicios.
- Todas las lecturas, escrituras y subidas comprueban acceso. El código de invitación no permite saltar una inscripción ni editar como docente. Revocar una inscripción elimina acceso a la sala del curso incluso si el alumno había participado.
- El almacenamiento en MySQL permite varios procesos del backend sin una sala en memoria. El polling y el tamaño del documento están pensados para el MVP; antes de clases multitudinarias conviene medir carga y evolucionar a operaciones incrementales por WebSocket/SSE.

## API

Todas las rutas parten de `/api/live-classes`. Salvo `google/start` y `google/callback`, requieren JWT de SpanishNow.

| Ruta | Uso |
| --- | --- |
| `GET /`, `POST /` | Listar salas accesibles / crear como docente |
| `POST /join` | Resolver invitación `{code}` y registrar participación |
| `GET /:id?since=revision` | Estado, participantes y pizarra solo si cambió |
| `POST /:id/presence` | Registrar actividad |
| `PATCH /:id` | Título, estado y permiso de edición (dueño) |
| `POST /:id/operations` | Operaciones versionadas `{operations: [...]}` |
| `POST /:id/images` | Imagen multipart `image` con validación de firma |
| `GET /google/status`, `POST /google/connect`, `DELETE /google/connection` | Conexión por docente |
| `GET /google/courses`, `GET /google/drive-files` | Listas paginadas de Google |
| `POST /:id/classroom` | Vincular `{courseId}` |
| `POST /:id/classroom/announce` | Publicar invitación |
| `POST /:id/drive` | Guardar/actualizar archivo editable |
| `POST /:id/drive/restore` | Restaurar `{fileId, expectedRevision}` |

## Desarrollo y comprobaciones

El checkout local usa `PORT=3001`, `DB_NAME=spanishnow_rebuild_test` y el frontend apunta a `http://localhost:3001/api`. Respetar el puerto de cada entorno en OAuth. Los usuarios de prueba están en el JSON local de cuentas; no publicar contraseñas ni incluir ese archivo en un PR.

```sh
# En backend (desarrollo local, nunca producción)
MEDIA_FAKE_UPLOADS=1 npm run dev
# En frontend
npm start -- --host localhost --port 4200
```

Pruebas relevantes:

```sh
cd backend
npm test
# La suite reconstruye únicamente spanishnow_jest_test, nunca la base de desarrollo.
cd ../frontend
npm test -- --watch=false
npm run build
```

`liveBoard.test.js` prueba validaciones, versiones, idempotencia y páginas; `liveClasses.test.js` prueba API real/MySQL, acceso y escrituras concurrentes; `liveGoogle.test.js` prueba OAuth, cifrado, renovación, scopes, Classroom y Drive con HTTP simulado. Los tests frontend verifican geometría, permisos, confirmaciones, vista optimista, recuperación y respuestas de sincronización fuera de orden.

Fuentes oficiales: [fin de Jamboard](https://support.google.com/jamboard/answer/14084927), [OAuth web](https://developers.google.com/identity/protocols/oauth2/web-server), [scopes de Classroom](https://developers.google.com/workspace/classroom/guides/auth), [anuncios](https://developers.google.com/workspace/classroom/reference/rest/v1/courses.announcements/create), [archivos de Drive](https://developers.google.com/workspace/drive/api/guides/create-file).
