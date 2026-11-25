# Checklist previo al lanzamiento

Lista viva de lo que debe estar hecho **antes de abrir la plataforma al público**. Reúne puntos que ya estaban documentados por separado; cada uno enlaza su fuente. No contiene datos de infraestructura, credenciales ni el estado de ningún servidor: eso se guarda fuera del repositorio (el repo es público).

Marca cada casilla en el PR que cierre el punto. Las decisiones de producto (D01–D10) no se cambian desde aquí.

## 1. Textos legales (hallazgo C-03 de la auditoría del 25/11/2026)

Hoy la tabla `legal_documents` está vacía en una instalación nueva, así que `/legal/terms`, `/legal/privacy` y `/legal/refunds` (y `package_terms`) responden 404 aunque el pie de página y el registro ya los enlacen. No es un defecto de código: es contenido pendiente. **No hay textos por defecto ni deben inventarse**; los define Andrés o su asesor legal.

- [ ] Redactar y aprobar, en español e inglés, términos y condiciones, política de privacidad y política de devoluciones (y las condiciones de paquetes de clases si se venden).
- [ ] Completar los datos del responsable (razón social/identidad y contacto): la publicación se bloquea con `legal_publication_incomplete` mientras falten o haya placeholders.
- [ ] Decidir y escribir la retención de datos y el tratamiento de mensajes privados, compras y calendario/Zoom (LEGAL-03/04 de [SPEC](clases-chat-integraciones/SPEC.md) §11).
- [ ] Cargar y publicar los borradores desde `/admin/legal`. Requiere una cuenta con el permiso `legal.manage`, que **no** lo trae ningún rol ni el JSON de cuentas de prueba: darlo desde `/admin/users` o con `ADMIN_EMAILS`.
- [ ] Comprobar que `/legal/*` responde 200 en ambos idiomas y que registro y compra piden la aceptación con la versión vigente.

Fuentes: [W02-LEGAL.md](clases-chat-integraciones/W02-LEGAL.md), [SPEC.md §11](clases-chat-integraciones/SPEC.md).

## 2. Cobros con Hotmart

- [ ] `HOTMART_HOTTOK` cargado en el entorno del servidor (nunca en el repo) y webhook de cada producto apuntando a `/api/payments/hotmart/webhook`.
- [ ] En cada producto: área de miembros externa con la URL de SpanishNow y página de agradecimiento `/checkout/thanks`.
- [ ] Antes de pasar a área externa un producto que ya tiene alumnos, preguntar al soporte de Hotmart si afecta el acceso de los actuales; pasar los alumnos actuales con la importación de CSV.
- [ ] Catálogo: cada curso a la venta con su `hotmartCheckoutUrl`, precio y moneda coherentes con el producto de Hotmart.
- [ ] Conciliación manual entre la evidencia de aceptación guardada al iniciar el checkout y las órdenes externas de Hotmart (pendiente explícito de AC19 en W02).
- [ ] No reprocesar compras reales ni simular ventas en producción.

Fuentes: [fase5-hotmart/SPEC.md](fase5-hotmart/SPEC.md), [W02-LEGAL.md](clases-chat-integraciones/W02-LEGAL.md).

## 3. Servidor y servicios

- [ ] El backend corre de forma continua (no depende de una máquina de desarrollo encendida) y con `OUTBOX_WORKER=1`, para que venzan propuestas, se sincronicen Calendar/Zoom y salgan los correos pendientes. Ver «Permisos y worker en una base de pruebas» en [DEVELOPMENT.md](../DEVELOPMENT.md).
- [ ] Variables de producción cargadas fuera del repo según [deploy/.env.api.example](../deploy/.env.api.example): `JWT_SECRET`, `ADMIN_EMAILS`, Cloudinary, correo real (`MAIL_TRANSPORT=smtp`), proveedores de Google/Zoom y la clave que cifra sus tokens (guardada también fuera del servidor).
- [ ] Ningún modo falso activo: `PAYMENTS_FAKE`, `INTEGRATIONS_FAKE` y `MEDIA_FAKE_UPLOADS` están apagados (el proceso se niega a arrancar si no).
- [ ] Respaldos de la base programados y probados con una restauración.
- [ ] Módulos de clases, chat y paquetes (`FEATURE_*`) encendidos solo cuando Andrés lo decida; apagarlos nunca borra lo ya comprado.
- [ ] Sin datos de demostración: no ejecutar `db:seed:master` ni `db:seed:curated` contra la base de producción, y revisar que no existan cuentas de prueba con permisos.

Fuentes: [deploy/README.md](../deploy/README.md), [backend/.env.example](../backend/.env.example), [CONFIGURAR-INTEGRACIONES.md](clases-chat-integraciones/CONFIGURAR-INTEGRACIONES.md).

## 4. Calidad

- [ ] Segunda pasada de la auditoría QA/UX con una base clonada, permisos y worker activos, para confirmar que los hallazgos de semilla y entorno ya no aparecen.
- [ ] Hallazgos abiertos de la auditoría QA/UX del 25/11/2026 (`docs/auditoria-plataforma/HALLAZGOS.md`, PR #108) cerrados o aceptados por escrito; los pendientes son A-06, D-09 y D-11.
