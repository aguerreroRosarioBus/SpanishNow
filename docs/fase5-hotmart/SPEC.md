# Fase 5: cobrar con Hotmart y dar acceso en SpanishNow

Objetivo: Stripe no acepta vendedores en Argentina. Hotmart sigue cobrando (checkout, impuestos, cuotas, garantía, pago a Solange) y SpanishNow funciona como "área de miembros externa" del producto: Hotmart avisa cada compra por webhook y SpanishNow crea la cuenta, inscribe y manda el email de acceso, igual que con Stripe.

## Decisiones

- **Por curso, no global.** Un curso con `hotmartCheckoutUrl` se cobra en Hotmart; uno sin él sigue el camino actual (Stripe o el modo de prueba). El código de Stripe queda, pero no se usa en producción.
- **"Buy now" lleva al checkout de Hotmart.** `POST /checkout` devuelve la URL de Hotmart (con `email` y `name` prellenados si el alumno está logueado) en lugar de crear una sesión de Stripe. No se crea orden en ese momento: la orden nace cuando llega el webhook.
- **Webhook** `POST /api/payments/hotmart/webhook` (versión 2.0.0 de Hotmart). Se verifica comparando el header `X-HOTMART-HOTTOK` (o el campo `hottok` del cuerpo, versiones viejas) con `HOTMART_HOTTOK` en tiempo constante. Sin `HOTMART_HOTTOK` configurado: 503.
- **Qué curso es:** `data.product.id` (o `data.product.ucode`) se compara con `courses.hotmartProductId`. Un producto desconocido responde 200 `{ ignored: true }`: Hotmart desactiva el webhook si recibe errores, y ese producto puede no estar en SpanishNow.
- **Eventos:**
  - `PURCHASE_APPROVED`, `PURCHASE_COMPLETE` → crea (si no existe) la orden `provider: 'hotmart'` con `providerSessionId = hotmart_<transaction>` y llama a `fulfillOrder` (crea cuenta, inscribe, email). Idempotente por la transacción.
  - `PURCHASE_REFUNDED`, `PURCHASE_CHARGEBACK` → `registerRefund` total con quita de acceso. Si llega antes que la aprobación, se guarda la orden ya como `refunded` para que una aprobación atrasada no dé acceso.
  - Cualquier otro (`PURCHASE_CANCELED`, `PURCHASE_PROTEST`, `PURCHASE_DELAYED`, suscripciones, etc.) → 200 `{ ignored: true }`.
- **Monto y moneda** se toman de `data.purchase.price.value` y `currency_value` (lo que pagó el alumno; Hotmart puede cobrar en la moneda local del comprador). Se guardan en centavos. Sin precio en el aviso, se usa el del curso.
- **Cupones y afiliados de SpanishNow no aplican** a cursos de Hotmart (Hotmart tiene los suyos). Excepción: un cupón del 100 % sigue dando acceso gratis sin pasar por Hotmart (sirve para regalar). Un cupón parcial responde 400 `coupon_not_applicable` con el mensaje "Discounts for this course are applied at the Hotmart checkout".
- **Reembolsos** se hacen en Hotmart; SpanishNow se entera por webhook. "Marcar como reembolsada" a mano en una orden de Hotmart responde 409 `refund_in_hotmart` salvo `{ manual: true }`, igual que Stripe.
- **Página de gracias:** `/checkout/thanks` (inglés, sin datos): "Payment received. We've emailed you how to access your course (check spam). Already have an account? Log in." Se configura en Hotmart como página de agradecimiento del producto.

## Modelo de datos (migración idempotente)

- `courses.hotmartProductId` STRING(40) nullable, único. `courses.hotmartCheckoutUrl` STRING(500) nullable.
- `orders.provider` suma `'hotmart'`.

## API

- `PUT /courses/:id` acepta `hotmartProductId` (dígitos o código alfanumérico, máx. 40; `''`/null lo quita; 409 si otro curso ya lo usa) y `hotmartCheckoutUrl` (https en `pay.hotmart.com` o `go.hotmart.com`; `''`/null lo quita). Si hay link también tiene que haber producto (400 si no), para que el webhook encuentre el curso.
- `GET /public/courses/:slug` suma `checkoutProvider: 'hotmart' | 'site'` (nunca el ID del producto).
- `POST /checkout` para un curso de Hotmart → `{ url }` del checkout de Hotmart (con `email`/`name` del alumno logueado).
- `POST /checkout/quote` para un curso de Hotmart: solo cupones del 100 %.
- `GET /teacher/hotmart` → `{ webhookUrl, configured: boolean }` (si `HOTMART_HOTTOK` está puesto), para mostrarle al docente qué pegar en Hotmart.

## Frontend

Docente (español):
- Modal de curso, sección "Venta": "Cobrar con Hotmart" con dos campos: "ID del producto en Hotmart" y "Link de pago de Hotmart (pay.hotmart.com/…)". Debajo, la URL del webhook para copiar y si el token está configurado en el servidor, con los pasos: en Hotmart, Herramientas → Webhook → agregar esta URL con eventos de compra aprobada, completa, reembolsada y contracargo; en el producto, Área de miembros → externa → URL de SpanishNow; página de agradecimiento → `/checkout/thanks`.
- Órdenes y CSV: proveedor "Hotmart". "Marcar como reembolsada" explica que se hace desde Hotmart.

Comprador (inglés):
- Página de venta de un curso de Hotmart: sin campo de cupón visible por defecto (sigue funcionando `?coupon=` del 100 %), sin pedir email; "Buy now" va a la URL que devuelve `POST /checkout`. Texto pequeño: "Secure checkout by Hotmart".
- `/checkout/thanks`.

## Configuración en producción

- `HOTMART_HOTTOK`: el token de Hotmart (Herramientas → Webhook). Nunca en el repo.
- En cada producto de Hotmart: área de miembros externa con la URL de SpanishNow, webhook con la URL de `/api/payments/hotmart/webhook`, página de agradecimiento `/checkout/thanks`.
- Antes de pasar a área externa un producto que ya tiene alumnos, preguntar al soporte de Hotmart si afecta el acceso de los actuales; los alumnos actuales se pasan con la importación de CSV.

## Pruebas

Backend (jest): hottok inválido/ausente (401) y sin configurar (503); compra aprobada crea cuenta, inscripción, orden `hotmart` con monto y moneda del aviso y email; reenvío idempotente; `PURCHASE_COMPLETE` después de `APPROVED` no duplica; producto desconocido y evento ignorado → 200 ignored; reembolso y contracargo quitan acceso; reembolso antes de la aprobación deja la orden reembolsada y sin acceso; `/checkout` devuelve el link de Hotmart con email; cupón parcial rechazado y 100 % funciona; validación de los campos del curso (dominio, producto duplicado, link sin producto); reembolso manual 409 sin `manual`.
Frontend: build sin errores y tests de la página de venta en modo Hotmart.
