# W09 · Mejora visual de administración, clases y mensajes

Seguimiento #76. Agente: Codex. Rama: `w09-mejoras-visuales`, desde `origin/main` actualizado. Entrega de presentación y usabilidad; sin cambios de backend, migraciones o dependencias.

## Resultado

- **Clases en vivo:** filtros segmentados con selección sólida y texto contrastado. El aviso de configuración de Google se muestra cuando no está conectado y no está configurado; antes también aparecía junto a «Cuenta conectada».
- **Agenda:** selector compartido de zonas por ciudad/IANA, resultados con desfase UTC actual, búsqueda sin distinguir acentos y manejo de teclado mediante NgbTypeahead. Fechas en un bloque propio, límites UTC/exclusión del final explícitos y limpieza del rango. El mismo selector se usa para proponer clases.
- **Ventas:** ancho máximo de barra de 48 unidades SVG, centrada en su intervalo; se conservan alturas, datos, meses y separación entre monedas.
- **Cupones/afiliados:** acciones con iconos, nombres accesibles y tooltips. Contenedor de acciones dentro de la celda, sin convertir `td` en flex. El selector de curso del enlace de cupón vive junto al curso.
- **Usuarios:** directorio con identidad, rol, estado, resumen de permisos y actividad; edición individual en panel lateral con foco contenido, cierre por Escape y restauración del foco. Permisos con sus descripciones y herramientas de pruebas plegadas. Vista móvil con rol junto a la identidad y columnas secundarias ocultas; el panel conserva el acceso a todos los permisos. Al solicitar suspensión/borrado, se cierra el panel para abrir la confirmación existente. Se limpia al abandonar la pantalla.
- **Configuración:** preferencias reorganizadas en idioma (guardado automático) y zona (confirmación explícita), reutilizando los servicios existentes, con estado de error/reintento visible.
- **Mensajes:** cabecera con agenda/oferta y menú secundario, compositor fijo dentro del contenedor, mensajes propios diferenciados y eventos con contraste. Canceladas/rechazadas conservan el texto oscuro y usan borde y fondo identificables, sin opacidad.

## Requisitos y compatibilidad

Se preservan TZ-02–04 y TZ-06–09, I18N-01–06 y las reglas de CHAT-03–06. Cobertura de presentación/regresión de AC06–08 y AC17; esta entrega no pretende volver a certificar el recorrido completo de esos AC. No se adoptan decisiones nuevas D01–D10 ni cambios en dinero, autorizaciones o programación.

El selector guarda **identificadores IANA**, nunca el desfase mostrado. El desfase indicado es el de hoy; los horarios de cada sesión siguen usando su fecha efectiva y las utilidades temporales existentes. La zona del dispositivo sigue siendo una sugerencia. No hay cambio de contratos HTTP o configuración requerida.

Superficies compartidas: adición del bundle `visual.*` a los catálogos base EN/ES, un icono `power` y reglas globales acotadas a los popups de zona/panel de usuarios. Sin cambios de rutas o navegación.

## Validación

- `cd frontend && npm test -- --watch=false`: **80 archivos, 574 pruebas aprobadas**.
- Tras el último ajuste del panel y responsive: **36 pruebas relevantes aprobadas** (usuarios, agenda, preferencias y selector).
- `cd frontend && npm run build`: build de producción aprobado. Advertencias de Sass/Bootstrap, presupuestos de estilos y `jsbi` documentadas en el log; sin errores de compilación. No se amplían presupuestos.
- `cd e2e && npx playwright test --config visual.playwright.config.ts`: **10 pruebas aprobadas**, escritorio 1440 px y móvil 390 px, API enteramente interceptada con datos ficticios. Capturas en `e2e/test-results/` (ignoradas por Git).
- `git diff --check`: aprobado.

Las pruebas de navegador comprueban selección con teclado, confirmación de zona, conservación de zona y borrador al cambiar idioma, límites UTC, panel/rol/foco, barras, acciones alineadas, contraste de canceladas y ausencia de desborde horizontal de la página. Las tablas comerciales pueden desplazarse dentro de su contenedor. No se contactan Google, Calendar, Zoom o servicios de cobro.

La suite heredada de pizarra requería tres ajustes de fixture ya desfasados con `main`: `change` → `boardChange`, selector de tamaño de fuente en lugar del antiguo botón «− Tamaño», y stub de `hasPointerCapture` de SVG en jsdom. Solo se ajustan pruebas; no se modifica la implementación de pizarra.

## Revisión manual y reversión

1. Con cuenta ficticia de docente, recorrer `/live`, `/schedule`, `/teacher/sales`, `/teacher/coupons`, `/teacher/affiliates`, `/admin/users`, `/settings` y `/messages` en escritorio/móvil.
2. Buscar «Córdoba» y «New York» por teclado. Elegir no guarda: confirmar zona realiza el guardado. Cambiar idioma conserva zona y borradores. Escribir una ciudad inexistente impide guardar.
3. En Usuarios, abrir una cuenta desde su nombre, revisar rol y permisos, cerrar por Escape. Cuentas ficticias sin permisos adicionales, administrador fijo y protección del propio `users.manage` se conservan. Suspender/borrar requiere la confirmación existente.
4. Revisar conversación con clase cancelada, mensajes de ambos participantes y eventos; cabecera y compositor deben permanecer visibles mientras se desplaza el historial.
5. Para repetir automáticamente: instalar dependencias de frontend/e2e y Chromium de Playwright; el config visual levanta únicamente el frontend en `127.0.0.1:4400`. Todas las respuestas API se simulan.

Los errores/reintentos e idempotencia usan los servicios existentes. No hay guardado nuevo al abrir paneles ni al elegir zona. Para revertir, revertir el commit de esta entrega; no hay cambios de datos que deshacer. Sin merge ni despliegue en esta tarea.

## Referencias de diseño consultadas

- [W3C WAI-ARIA: Combobox Pattern](https://www.w3.org/WAI/ARIA/apg/patterns/combobox/): selección y navegación por teclado; implementación con el componente existente de ng-bootstrap.
- [Nielsen Norman Group: Does Your Form Really Need a Dropdown List?](https://www.nngroup.com/articles/dropdown-list/): búsqueda para listas largas y proximidad entre controles relacionados.
