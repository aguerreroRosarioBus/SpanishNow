# Fase 3: gestión de ventas y crecimiento

Objetivo: que Solange (o Andrés) pueda manejar el negocio sin Hotmart: ver qué se vende, dar descuentos, procesar reembolsos y vender la Parte 2 a quien terminó la Parte 1. El alumno ve sus compras.

Ya existe desde la fase 1: lista de alumnos por curso con progreso, alta manual e importación. Fuera de esta fase (quedan para una fase 4): afiliados, comentarios por lección, liberación de contenido por fechas (drip), app instalable (PWA).

## Decisiones

- **Cupones propios**, no los de Stripe: el backend calcula el precio final y crea la sesión de Stripe con ese monto. Así funcionan igual en modo falso y con Stripe, y un cupón del 100 % da acceso sin pasar por Stripe (sirve para regalar el curso).
- **Reembolsos:** se hacen desde el panel de Stripe (como hoy) y SpanishNow se entera por webhook (`charge.refunded`). Reembolso total: la orden pasa a `refunded` y se quita el acceso de esa compra (como Hotmart). Reembolso parcial: solo se registra el monto devuelto, sin quitar acceso. El docente también puede marcar una orden como reembolsada a mano (para órdenes falsas o reembolsos hechos por fuera), con la misma consecuencia.
- **Montos en varias monedas:** el panel agrupa por moneda; nunca suma USD con EUR.
- **Serie de cursos:** cada curso puede tener un "curso siguiente" (`nextCourseId`) y opcionalmente un cupón para ofrecerlo. Se muestra al terminar el curso (en el reproductor, en Mi avance junto al certificado) y en la página de venta ("Part of a series").
- Idiomas como siempre: comprador y páginas públicas en inglés, docente en español, pantallas del alumno en el idioma actual de la app.

## Modelo de datos (migraciones idempotentes)

- `coupons`: `id`, `teacherId` (FK), `code` STRING(40) único (mayúsculas, `A-Z0-9-`), `percentOff` INTEGER nullable (1–100), `amountOff` INTEGER nullable (centavos), `currency` STRING(3) nullable (obligatoria con `amountOff`), `courseId` FK nullable (null = todos los cursos del docente), `maxRedemptions` INTEGER nullable, `redemptions` INTEGER default 0, `expiresAt` DATE nullable, `active` BOOLEAN default true, timestamps. Exactamente uno de `percentOff`/`amountOff`.
- `orders`, columnas nuevas: `couponId` FK nullable, `originalAmount` INTEGER nullable, `discountAmount` INTEGER default 0, `refundedAmount` INTEGER default 0, `refundedAt` DATE nullable, `receiptUrl` STRING(500) nullable (de Stripe, `charge.receipt_url`). `provider` suma el valor `'coupon'` (órdenes de 100 % de descuento).
- `courses.nextCourseId` FK nullable (a `courses`, del mismo docente), `courses.nextCourseCouponId` FK nullable.
- `redemptions` se incrementa solo cuando la orden se paga (en `fulfillOrder`), dentro de la transacción, respetando `maxRedemptions` (si se agotó entre el checkout y el pago, se honra igual la compra ya pagada).

## API

Público / comprador:
- `POST /checkout` acepta `couponCode` opcional. Errores 400 `{ error, code: 'coupon_invalid' | 'coupon_expired' | 'coupon_exhausted' | 'coupon_not_applicable' }`. Si el precio final es 0: crea la orden con `provider: 'coupon'`, la cumple al instante y devuelve la misma URL de éxito.
- `POST /checkout/quote` `{ courseId, couponCode }` → `{ originalAmount, discountAmount, amount, currency, coupon: { code, percentOff, amountOff } }` para mostrar el precio con descuento antes de pagar. Mismos errores.
- `GET /public/courses/:slug` suma `series: { previous: { slug, title } | null, next: { slug, title } | null }`.
- Webhook: además de `checkout.session.completed`, manejar `charge.refunded` (buscar la orden por `providerPaymentId` = payment intent) e idempotente. Guardar `receiptUrl` al cumplir la orden (si Stripe la da).

Docente (solo sus cursos y cupones):
- `GET /teacher/sales/summary?from&to` → `{ totals: [{ currency, gross, refunds, net, orders, refundsCount }], byMonth: [{ month: 'YYYY-MM', currency, net, orders }], byCourse: [{ courseId, title, currency, net, orders }] }`. Por defecto últimos 12 meses. Solo órdenes `paid` o `refunded` (las `pending`/`failed` no cuentan).
- `GET /teacher/orders?status&courseId&q&page&pageSize` → `{ rows: [{ id, createdAt, paidAt, course: { id, title }, buyer: { id, name, email }, amount, originalAmount, discountAmount, currency, status, refundedAmount, coupon: { code } | null, provider, receiptUrl }], total }`. `q` busca por email o nombre. `pageSize` máx. 100.
- `GET /teacher/orders/export.csv` (mismos filtros) → CSV con encabezados en español.
- `POST /teacher/orders/:id/refund` `{ revokeAccess: boolean = true }` → marca reembolso total manual. Para órdenes de Stripe responde 409 `{ error }` indicando que el reembolso se hace desde Stripe (el webhook lo registra) salvo que venga `{ manual: true }` explícito.
- Cupones: `GET /teacher/coupons`, `POST /teacher/coupons`, `PUT /teacher/coupons/:id` (no se puede cambiar `code` ni el descuento si ya tiene `redemptions > 0`; sí `active`, `expiresAt`, `maxRedemptions`), `DELETE /teacher/coupons/:id` (solo si no tiene usos; si tiene, 409 y se desactiva en su lugar).
- `PUT /courses/:id` acepta `nextCourseId` y `nextCourseCouponId` (validar que sean del mismo docente y que no apunte a sí mismo).

Alumno:
- `GET /me/orders` → sus órdenes `paid`/`refunded`: `[{ id, paidAt, course: { title, slug }, amount, currency, status, refundedAmount, receiptUrl }]`.
- `GET /enrollments/:id/progress` suma `next: { course: { slug, title, price, currency }, couponCode: string | null, alreadyEnrolled: boolean } | null` (solo si el curso tiene `nextCourseId` publicado).

## Frontend

Docente (español), nueva entrada "Ventas" en el menú lateral del docente:
- `/teacher/sales`: tarjetas por moneda (ingresos netos, órdenes, reembolsos), gráfico de barras de ingresos por mes (sin librerías nuevas: SVG o CSS), tabla por curso, selector de período (30 días, 12 meses, todo).
- `/teacher/orders`: tabla paginada con filtros (estado, curso, búsqueda), badge de estado (Pagada / Reembolsada / Reembolso parcial), cupón usado, link al recibo, acción "Marcar como reembolsada" con confirmación (y casilla "Quitar acceso al curso", marcada), botón "Exportar CSV".
- `/teacher/coupons`: lista (código, descuento, curso, usos/máximo, vence, activo) y formulario crear/editar con las validaciones de la API; desactivar; copiar link de venta con el cupón (`/courses/:slug?coupon=CODE`).
- Modal de curso: "Curso siguiente de la serie" (select de sus cursos) y "Cupón para ofrecerlo" (select de sus cupones activos).

Comprador (inglés):
- Página de venta: link "Have a coupon?" que abre un campo; aplica con `/checkout/quote` y muestra precio tachado + precio final; lee `?coupon=CODE` de la URL y lo aplica solo; el cupón se manda en `POST /checkout`. Bloque "Part of a series" con anterior/siguiente.

Alumno:
- `/student/purchases` ("Mis compras", en el menú del alumno): tabla con fecha, curso, monto, estado y link "Recibo".
- Al terminar el curso: en Mi avance (junto al certificado) y al final del reproductor, tarjeta "Seguí con <curso siguiente>" con precio (y "con tu cupón X" si hay) que lleva a la página de venta con `?coupon=`; si ya está inscripto, "Ir al curso".

## Pruebas
Tests jest: cálculo de cupones (porcentaje, monto, mínimo 0, moneda distinta → no aplica, vencido, agotado, de otro docente), orden de 100 % sin Stripe, `redemptions` solo al pagar e idempotente, webhook `charge.refunded` total y parcial e idempotente, reembolso manual quita acceso solo de esa compra, resumen agrupado por moneda y excluye pending/failed, el docente solo ve sus órdenes y cupones, CSV, `me/orders`, `next` en progreso. Frontend: build sin errores y tests unitarios de la lógica de precio con cupón y del gráfico (cálculo de escalas).
