# W01 — Cupones y afiliados del docente (EN/ES)

Completa el avance WIP de Codex (`w01-i18n-cupones-afiliados`, `352d457`; el parche y el generador se aplicaron a mano porque los catálogos base ya habían cambiado).

- Catálogo `teacher-promotions.ts` (`teacherPromotions.*`), 163 claves por idioma, registrado en `catalogs/en.ts` y `es.ts`.
- `teacher-coupons` y `teacher-affiliates`: plantillas y TS con `t`; importes con `formatMoney`; porcentajes con `Intl`; diálogos de confirmación traducidos con parámetros.
- Errores: los de formulario, pago y estado guardan la clave y el error y se traducen por `code` al leer (cambian de idioma sin repetir la petición). Ya no se muestra el texto libre `{ error }` del servidor.
- Fechas: vencimiento de cupón y fecha de pago se eligen como día de calendario (00:00 UTC) y se muestran en UTC para no correrlas de día; las órdenes usan la zona de las preferencias.
- No cambia comisiones, descuentos, monedas, atribución ni reglas de dinero; no convierte ni suma entre monedas.
- Pruebas: `promotions-i18n.spec.ts` (2) y E2E `14-i18n-promotions` (escritorio y móvil, API ficticia sin mutaciones).
