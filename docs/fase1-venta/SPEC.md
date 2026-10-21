# Fase 1: vender cursos y migrar alumnos de Hotmart

Objetivo: que SpanishNow pueda vender un curso (pago único con Stripe), dar acceso solo a quien compró o a quien el docente habilitó, mandar los emails básicos e importar a los compradores de Hotmart.

Referencia de producto: "Learn Spanish with a Short Film (PART 1)" en Hotmart. Público: angloparlantes de EE. UU., Reino Unido, Canadá, Australia y Europa.

## Decisiones

- **Idioma:** lo que ve un comprador (página de venta, checkout, emails, recuperar contraseña) va en **inglés**. Las pantallas internas del docente siguen en español, como el resto de la app.
- **Pagos:** Stripe Checkout (página alojada por Stripe), pago único, moneda por curso (USD por defecto). Sin cuotas ni suscripciones en esta fase.
- **Compra sin cuenta previa:** el comprador puede pagar sin estar logueado. Stripe pide el email. Al confirmarse el pago, se busca o se crea el usuario alumno con ese email y se le manda un link para elegir su contraseña.
- **Modo falso de pagos:** `PAYMENTS_FAKE=1` (igual que `MEDIA_FAKE_UPLOADS`) para probar todo localmente sin cuenta de Stripe: el checkout redirige a una URL local que simula el pago confirmado. El proceso no arranca si `PAYMENTS_FAKE=1` y `NODE_ENV=production`.
- **Emails:** nodemailer. `MAIL_TRANSPORT=log` (por defecto fuera de producción) escribe cada email en consola y en `backend/tmp/mail/*.json` en vez de mandarlo. `MAIL_TRANSPORT=smtp` usa `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM`.
- **Registro público:** solo crea alumnos. Hoy `POST /api/auth/register` acepta `role: 'teacher'`, así que cualquiera podría crearse una cuenta de docente: se elimina esa posibilidad (los docentes se crean por seed o por base de datos).
- **Cursos gratis:** un curso con `price = 0` y publicado se puede seguir inscribiendo libremente como hoy. Uno con precio solo da acceso por compra, por importación o por alta manual del docente.

## Modelo de datos (migraciones nuevas, idempotentes como las existentes)

`courses`, columnas nuevas:
- `slug` STRING(160) único, nullable (se genera desde el título si falta)
- `price` INTEGER NOT NULL DEFAULT 0, en centavos
- `currency` STRING(3) NOT NULL DEFAULT 'usd'
- `isPublished` BOOLEAN NOT NULL DEFAULT false (los cursos existentes quedan en `false`)
- `salesDescription` TEXT nullable (texto largo de la página de venta, en inglés)

`enrollments`, columnas nuevas:
- `source` ENUM('free','purchase','manual','hotmart_import') NOT NULL DEFAULT 'free'
- `orderId` INTEGER nullable, FK a `orders`
- Índice único (`studentId`, `courseId`) si no existe

`orders`, tabla nueva:
- `id`, `courseId` (FK), `userId` (FK nullable hasta que se confirme el pago), `email`
- `amount` INTEGER, `currency` STRING(3)
- `status` ENUM('pending','paid','refunded','failed')
- `provider` ENUM('stripe','fake'), `providerSessionId` STRING único, `providerPaymentId` nullable
- `paidAt` nullable, timestamps

`password_tokens`, tabla nueva (sirve para "olvidé mi contraseña" y para "elegí tu contraseña" de alumnos nuevos):
- `id`, `userId` (FK), `tokenHash` (sha256 del token, nunca el token en claro), `purpose` ENUM('reset','invite')
- `expiresAt` (reset: 1 hora; invite: 14 días), `usedAt` nullable, timestamps

## API

Todas bajo `/api`. Errores con la forma actual `{ error: string }`.

### Público (sin login)
- `GET /public/courses` → cursos publicados: `[{ id, slug, title, description, level, imageUrl, price, currency, teacher: { name } }]`
- `GET /public/courses/:slug` → el curso publicado con `salesDescription` y su índice: `units: [{ id, title, order, stories: [{ id, title, order }] }]`. 404 si no existe o no está publicado.
- `POST /checkout` body `{ courseId }`, login opcional (si viene un token válido de alumno se usa su usuario y su email). Respuesta `{ url }` a la que el frontend redirige.
  - 400 si el curso es gratis, 404 si no está publicado, 409 si el alumno logueado ya está inscripto.
  - Stripe: `success_url = FRONTEND_URL/checkout/success?session_id={CHECKOUT_SESSION_ID}`, `cancel_url = FRONTEND_URL/courses/:slug`.
  - Modo falso: devuelve `FRONTEND_URL/checkout/success?session_id=fake_xxx` y el backend marca la orden pagada en el momento (pasa por la misma función que el webhook).
- `POST /payments/stripe/webhook` → raw body, firma verificada con `STRIPE_WEBHOOK_SECRET`. En `checkout.session.completed` con pago confirmado llama a `fulfillOrder`. Idempotente: el mismo evento dos veces no duplica nada.
- `GET /checkout/session/:sessionId` → `{ status: 'pending'|'paid', course: { title, slug }, email, needsPassword: boolean }` para la pantalla de éxito (que hace polling corto mientras esté `pending`).
- `POST /auth/forgot-password` body `{ email }` → siempre 200 (no revela si el email existe). Si existe, manda el email de reset.
- `POST /auth/reset-password` body `{ token, password }` → valida token (no usado, no vencido), cambia la contraseña, marca el token usado y devuelve `{ user, token }` como el login, para entrar directo.

### `fulfillOrder(order)` (servicio)
1. Si la orden ya está `paid`, no hace nada.
2. Busca el usuario por email; si no existe, crea un alumno con nombre tomado de Stripe (o la parte local del email) y contraseña aleatoria inutilizable.
3. Crea la inscripción con `source = 'purchase'` y `orderId` (si ya existía, no la duplica).
4. Marca la orden `paid` con `paidAt`.
5. Email de confirmación de compra con link al curso. Si el usuario es nuevo, el email incluye el link para elegir contraseña (token `invite`).

### Docente (login de docente, solo sobre sus propios cursos)
- `PUT /courses/:id` acepta además `slug`, `price`, `currency`, `isPublished`, `salesDescription`.
- `GET /courses/:id/students` → `[{ enrollmentId, user: { id, name, email }, source, enrolledAt, progress: { completedStories, totalStories } }]`
- `POST /courses/:id/students` body `{ email, name? }` → alta manual (`source = 'manual'`); crea el alumno si no existe y le manda invitación. Idempotente.
- `DELETE /courses/:id/students/:enrollmentId` → quita el acceso (borra la inscripción y su progreso, igual que hoy el reset).
- `POST /courses/:id/students/import/preview` multipart `file` (CSV exportado de Hotmart) → `{ rows: [{ line, name, email, status: 'new'|'existing_user'|'already_enrolled'|'invalid', reason? }], summary: { total, new, existingUser, alreadyEnrolled, invalid } }`. No escribe nada.
- `POST /courses/:id/students/import` mismo archivo + `sendInvites: boolean` → aplica: crea alumnos e inscripciones `source = 'hotmart_import'`, manda invitaciones si se pidió. Devuelve el mismo resumen con lo hecho.
  - CSV: detectar separador (`,` o `;`) y encabezados en inglés, español o portugués (Hotmart exporta en el idioma de la cuenta): nombre en `Name`, `Nombre`, `Nome`, `Buyer name`, `Nombre del comprador`, `Nome do comprador`; email en `Email`, `E-mail`, `Buyer email`, `Email del comprador`, `Email do comprador`. Emails se normalizan a minúsculas y se deduplican. BOM UTF-8 tolerado. Máximo 5.000 filas y 2 MB.

### Alumno
- `POST /enrollments` (inscripción libre): solo si el curso está publicado y `price = 0`; si tiene precio responde 402 `{ error, checkoutRequired: true, slug }`.
- `GET /courses` (catálogo actual del alumno): solo cursos publicados, con `price`, `currency`, `slug`.

## Emails (inglés, HTML simple + texto plano)
- **Purchase confirmation:** curso comprado, monto, botón "Start learning". Si es usuario nuevo, botón "Set your password" (invite).
- **Invitation (import / alta manual):** "Solange has moved her course to SpanishNow", explicación corta de que su compra en Hotmart sigue valiendo y botón "Set your password". Mismo template con el nombre del curso.
- **Password reset:** botón "Reset password", vence en 1 hora.
- Los links usan `FRONTEND_URL`.

## Frontend

Públicas (sin login, en inglés, con el estilo de la app):
- `/courses`: catálogo público de cursos publicados.
- `/courses/:slug`: página de venta: portada, título, nivel, descripción, `salesDescription`, índice de unidades y lecciones, precio formateado con `Intl.NumberFormat`, botón "Buy now" → `POST /checkout` → redirect. Si el alumno logueado ya lo tiene: "Go to course".
- `/checkout/success`: polling a `/checkout/session/:id` hasta `paid` (máx. ~30 s); luego "You're in!" y, si `needsPassword`, "Check your email to set your password"; si está logueado, botón al curso.
- `/auth/forgot-password` y `/auth/reset-password?token=…` (también usado para invitaciones; con `?invite=1` el título dice "Set your password"). Al terminar, sesión iniciada y redirect al dashboard.
- Link "Forgot your password?" en el login.
- Registro: se quita la opción de registrarse como docente.

Docente:
- Modal de edición de curso: precio (en moneda, se guarda en centavos), moneda, slug, publicado sí/no, texto de venta, y link "Ver página de venta".
- Nueva pestaña o sección "Alumnos" en la gestión del curso: tabla con nombre, email, origen (Compra / Manual / Hotmart / Gratis), fecha y progreso; agregar alumno por email; quitar acceso con confirmación; importar CSV de Hotmart con vista previa (resumen + tabla), casilla "Enviar invitación por email" y botón confirmar.

Alumno:
- En el catálogo del dashboard, un curso con precio muestra el precio y "Ver curso" lleva a `/courses/:slug` en vez de inscribir directo.

## Variables de entorno nuevas (agregar a `backend/.env.example`)
`FRONTEND_URL`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `PAYMENTS_FAKE`, `MAIL_TRANSPORT`, `MAIL_FROM`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`.

## Fuera de esta fase
Reembolsos automáticos (se hacen desde el panel de Stripe), cupones, suscripciones, video, PDFs, certificados, panel de ventas.
