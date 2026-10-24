# W09 · Piloto de diseño: Agenda, Paquetes y Ofertas

Solicitud y seguimiento: #81. Base: `origin/main` actualizado, `5d720fd`. Rama: `w09-piloto-ui`. Agente: Codex. Fecha: 24/10/2026.

## Resultado y requisitos

| ID | Entrega |
| --- | --- |
| UI-01 | Contrato SCSS acotado al piloto: controles y botones de una misma fila de 40 px, etiquetas con altura predecible y adaptación en móvil. Filtros y zona se validan con geometría real en navegador. |
| UI-02 | Catálogo con nombre, importe, prestaciones y estado separados; acciones secundarias en menú. Ofertas con resumen comercial y condiciones, sin campos de expectativas vacíos. |
| UI-03 | Confirmaciones de Agenda en diálogo. Proponer/reprogramar y editar un paquete abren panel lateral, con acciones en el pie, Escape, foco contenido y retorno al activador. Abrir el formulario no desplaza las clases. |
| UI-04 | Una oferta con política/versiones ausentes muestra un aviso en lugar de `undefined` o un render interrumpido. No se inventan condiciones y el frontend bloquea el checkout hasta poder presentarlas completas; el servidor conserva la autorización definitiva. |
| UI-05 | ES/EN, teclado y anchos 1440, 1024 y 390 px. El selector de zona del piloto usa autocompletado de PrimeNG, resultados limitados y selección IANA explícita. Abrirlo prioriza zona actual y sugerencias útiles; no una lista alfabética desde África. |
| UI-06 | Nueva oferta: destinatario, selección, precio y resumen antes de enviar. Elegir una plantilla y cambiar idioma no envían la oferta ni modifican precio/moneda. |

Regresión de presentación de SPEC: TZ-02–09, PACK-02/03, I18N-01–06; AC08, AC17 y AC19. AC20: fixtures y API interceptada. Esta entrega no vuelve a certificar los criterios transaccionales ni los proveedores reales.

## Biblioteca y arquitectura

Se incorpora PrimeNG `21.0.2`, compatible con el Angular 21 instalado, CDK `21.0.5` y temas PrimeUIX `2.0.3`, fijados en el lockfile. Se usa `Dialog` para confirmaciones y paneles laterales, y `AutoComplete` para la zona del piloto. El tema Aura se adapta a la paleta existente; se configura al cargar estos componentes.

Bootstrap y ng-bootstrap siguen aportando grillas, botones, selects nativos y menús. El piloto unifica su apariencia mediante `.pilot-ui`, `.pilot-dialog` y `.pilot-editor`; no cambia globalmente la altura de los controles de las otras pantallas. El selector compartido mantiene su API y el modo anterior como predeterminado; `variant="pilot"` activa el autocompletado nuevo en Agenda.

La zona confirmada se presenta de forma compacta. Cambiarla exige seleccionar y confirmar; cancelar la edición restaura la preferencia guardada. Los identificadores, instantes UTC, límites de fechas UTC y reglas de cancelación se conservan.

Los paneles de Agenda y Catálogo se mantienen dentro del árbol de su pantalla para que los tutoriales encuentren sus controles. Al cerrar una guía que abrió un modal, el foco vuelve al modal y no a un botón detrás de su máscara. Se actualiza el selector del tutorial de catálogo y su recorrido de prueba.

## Archivos y superficies compartidas

- `frontend/src/app/features/schedule/`: presentación de agenda, confirmaciones y propuesta; textos y pruebas.
- `frontend/src/app/features/packages/`: catálogo, creación y detalle de ofertas; estilos, textos y pruebas.
- `frontend/src/app/shared/styles/`: contrato de controles y tema de PrimeNG.
- `frontend/src/app/shared/directives/restore-focus.directive.ts`: retorno de foco después de cerrar overlays.
- Selector compartido de zona: variante optativa; el identificador emitido sigue siendo IANA.
- `frontend/src/styles.scss`: una importación aditiva de estilos acotados en `styles/_pilot.scss`.
- Tutoriales compartidos: selector de catálogo y retorno de foco al modal abierto.
- Dependencias frontend y lockfile; configuración y pruebas E2E del piloto, con salida independiente para no colisionar con otras suites.

Sin cambios de backend, persistencia, migraciones, rutas raíz, menús, permisos ni contratos HTTP. La oferta incompleta se trata como información ausente; no se repara ni reinterpreta una instantánea histórica. No se modifica D01–D10.

## Validación

```sh
cd frontend
npm test -- --watch=false
npm run build
cd ../e2e
npx playwright test --config pilot.playwright.config.ts
npx playwright test --config tutorial.playwright.config.ts --grep 'agenda docente|catálogo y oferta'
git diff --check
```

| Comprobación | Resultado |
| --- | --- |
| Suite frontend completa | 591/591 aprobadas, 81 archivos |
| Piloto Playwright: 6 casos × 2 idiomas × 3 tamaños | 36/36 aprobadas |
| Guías existentes de Agenda, Catálogo y Ofertas: escritorio/móvil | 4/4 aprobadas |
| Build de producción | Aprobado con avisos descritos abajo |
| `git diff --check` | Aprobado |

La suite del piloto intercepta todas las peticiones `/api/**`, usa nombres/cuentas ficticios y no inicia backend ni consulta una base. Cubre geometría de controles, búsqueda de zona, Escape y Tab en diálogos, conservación del motivo, cierre de paneles, retorno de foco, creación de oferta sin envío y datos incompletos. Las pruebas unitarias existentes conservan validación de versiones, saldo, idempotencia, checkout y cambio de idioma.

El build conserva avisos de Sass `@import`, CommonJS `jsbi`, presupuesto de advertencia del bundle inicial y estilos de otras pantallas. No se aumentan los límites de build. Se revisan las capturas de escritorio y móvil del piloto. No se certifican Safari ni dispositivos físicos en esta entrega.

## Prueba manual y entorno de revisión

Por pedido expreso de Andrés, el frontend del worktree se sirve en `http://localhost:4300` con configuración `lan`, HTTP local y proxy `/api` al backend existente `http://localhost:3001`, cuyo proceso corre en `SpanishNow-run/backend`. Esto permite ver los mismos datos de esa copia. No se cambia su checkout, configuración ni base, ni se ejecutan migraciones.

```sh
cd frontend
npm start -- --configuration lan --host localhost --port 4300 --ssl=false
```

1. En `/schedule`, revisar la zona compacta, abrir Cambiar, escribir una ciudad, seleccionar y cancelar. Comprobar alineación de fechas y Aplicar.
2. Abrir Proponer una clase: el panel no mueve el listado y agrupa fecha/duración y zona. Cerrar con Cancelar, X y Escape. Revisar también una reprogramación sin enviarla.
3. Abrir Cancelar clase, revisar la consecuencia, completar un motivo y cerrar sin confirmar.
4. En `/teacher/class-packages`, revisar estados, precios, menú y editor. Cerrar sin guardar. Con cuentas ficticias, verificar los tutoriales.
5. En `/teacher/class-offers/new?conversationId=1`, elegir una plantilla y cambiar idioma: se conserva selección e importe; no pulsar Enviar durante revisión con datos existentes.
6. Revisar `/class-offers/1`: una instantánea incompleta muestra el aviso; una completa muestra versiones y condiciones, con todas las acciones etiquetadas.

Errores y reintentos usan los servicios existentes. No se altera el contrato de idempotencia ni se agregan escrituras al abrir, elegir o cerrar una pantalla. La actualización de idioma sigue guardando únicamente la preferencia por su flujo existente. La validación automatizada de escrituras se realiza solo con API simulada.

## Reversión y relevo

Revertir el commit del piloto y reinstalar dependencias frontend con `npm ci`. No hay migraciones que revertir. Para detener solo la vista del piloto, terminar el `ng serve` del puerto 4300; no detener el backend de `SpanishNow-run`. El merge queda a cargo de Andrés.
