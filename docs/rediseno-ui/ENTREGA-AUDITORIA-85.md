# Entrega de acabado de UI · issue #85

## Problema y resultado

La auditoría con meses de actividad mostró que los datos y estados no organizaban las tareas, y que móvil comprimía controles sobre los nombres y el contenido. Esta entrega recompone los recorridos de alumno, docente y operaciones manteniendo la identidad visual de SpanishNow.

27 hallazgos quedan corregidos y U22 queda parcialmente atendido: se corrigió el recorte de portadas, pero sigue pendiente la curación de las ilustraciones y su uso semántico en los datos del seed. No se considera alcanzado un estándar absoluto de calidad «Apple» por aprobar pruebas; requiere seguir revisando contenido y uso real.

## Matriz de entrega

| ID | Estado | Cambio |
|---|---|---|
| U01 | Corregido | Cabeceras y filas móviles con nombres completos y acciones secundarias. |
| U02 | Corregido | Primitiva de foco, Tab/Shift+Tab, Escape y retorno; unidad, curso, vocabulario y confirmación compartida. |
| U03 | Corregido | Avance real por inscripción, completado, comenzar/continuar/repasar, docente y punto de reanudación. |
| U04 | Corregido | Saldo utilizable y paquetes activos primero; agenda con Próximas/Historial/Todos. |
| U05 | Corregido | Búsqueda, filtros de saldo/estado, tarjetas docentes compactas y detalle de condiciones. |
| U06 | Corregido | Detalle de historias plegable para comparar cursos sin recorrer todas las lecciones. |
| U07 | Corregido | Orientación y nueva consulta desplegables; estado de ventas compacto. |
| U08 | Corregido | Entrada de fecha/hora y zona; resolución compartida de DST, sin offsets manuales; filtros UTC avanzados conservados. |
| U09 | Corregido | Estado de paquetes no elegibles y recuperación diferenciada ante error. |
| U10 | Corregido | Búsqueda, filas de 48 px, seleccionados, contador/capacidad; solo se habilita crear con todas las plazas. |
| U11 | Corregido | Importe monetario normal y exacto; moneda con nombre; días/horas transcurridos; política retenida o vigente; proveedor y traducciones plegables. |
| U12 | Corregido | Inscritos y búsqueda antes de alta e importación desplegables. |
| U13 | Corregido | Un bloque abierto, cabecera y pie compactos; una ayuda con acceso a ambas guías. |
| U14 | Corregido | Índice móvil plegable y transporte de audio en una fila, manteniendo accesibilidad. |
| U15 | Corregido | Docente en biblioteca; participantes y horario en grupos; nombre del curso en pizarras docentes. |
| U16 | Corregido | Gráfico CSS con texto de 12 px independiente del ancho; tabla alternativa conservada. |
| U17 | Corregido | Motivo y confirmación propios de cada operación; contexto de orden/importe/acción y cancelación sin ejecución. |
| U18 | Corregido | Pendiente se muestra en ámbar; no reutiliza el verde de publicado. |
| U19 | Corregido | Catálogo público ordenado y filtrable por nivel. |
| U20 | Corregido | Responder visible; moderación agrupada en menú accesible. |
| U21 | Corregido | Calendar conectado resumido y edición desplegable; acceso a Classroom/Drive. |
| U22 | Parcial | Recorte corregido en portadas. Pendiente curar ilustraciones repetidas y su significado en expresiones del seed existente; no se reescribieron revisiones publicadas. |
| U23 | Corregido | Descripción comercial original identificada como inglés y marcada con lang=en; sin traducir texto libre automáticamente. |
| F01 | Corregido | Ayuda en encabezado, sin globo inicial ni superposición sobre compositores/acciones. |
| F02 | Corregido | Pluralización independiente de las plazas EN/ES. |
| F03 | Corregido | Tabla principal de seis columnas; proveedor/cupón/afiliado/recibo en detalle; código con color de marca. |
| F04 | Corregido | Acciones de invitación con separación y jerarquía consistente. |
| F05 | Corregido | Motivos técnicos traducidos; código original solo en detalle de soporte. |

## Requisitos y compatibilidad

- I18N-01, I18N-02, I18N-04 / AC17: claves EN/ES de presentación; no se traduce contenido humano ni se reinician borradores por idioma.
- AUDIO-01, AUDIO-05 / AC18: controles visibles y nombrados, 44 px; reproducción, seek, límites A/B y estado conservados.
- PACK-01, PACK-03, PACK-08 / AC19: entrada monetaria exacta por decimales ISO; política existente por defecto o vigente por selección explícita; versión y condiciones conservadas por la API.
- TZ-01, TZ-02, TZ-05, TZ-06, TZ-12, TZ-13 / AC06: el nuevo formulario usa el resolvedor compartido existente; rechaza horas inexistentes y exige elegir horas ambiguas. El backend continúa siendo autoridad.
- CHAT-03 y AGENDA-02: presentación y navegación conservan conversaciones y propuestas; no se crean mensajes ni reservas mediante el rediseño.
- Sin nuevas decisiones D01–D10, contratos, rutas, permisos, migraciones, variables de entorno, proveedores ni activación de ventas.

Superficies compartidas: cambios mínimos en el encabezado/layout para mover la ayuda y añadir salto a contenido; dos imports/spreads aditivos en catálogos EN/ES para un catálogo propio `refine.*`. El resto son componentes y utilidades de presentación. No se reorganizan menús ni rutas.

## Validación

- Angular: 603 pruebas verdes en 85 archivos. Doce pruebas adicionales cubren importes, DST, selección completa de grupo, foco y confirmación independiente de cada orden.
- Build de producción verde sin ampliar presupuestos. Persisten avisos de Sass/Bootstrap, tamaño inicial y algunos estilos existentes; el resultado queda por debajo de los umbrales de error.
- 30 combinaciones de vista y rol en 390, 1024 y 1440 px: 90 capturas base; sin desborde horizontal de página. Tablas mantienen scroll interno cuando es necesario.
- Diez escenas dirigidas en los tres anchos: 30 comprobaciones de teclado, campos, estados y geometría. Las esperas se sincronizan con el DOM; se descartaron falsos fallos por evaluar antes del render.
- Pruebas visuales con datos existentes y API de negocio bloqueada para cualquier método distinto de GET; no se guardaron formularios ni se ejecutaron operaciones comerciales.

Evidencia local del chat: carpeta `correcciones-ui`, con `INFORME.md`, `MATRIZ.json`, `VALIDACION-DETALLE.json`, logs y capturas. Las capturas locales no se publican automáticamente en GitHub.

## Prueba manual con cuentas ficticias

1. Docente: abrir curso con nombres largos a 390 px; comprobar títulos, menú de historias y Nueva unidad. Tab/Shift+Tab quedan en el diálogo, Escape cierra y retorna el foco.
2. Alumno parcial/completado: comparar biblioteca y avance; reanudar, repasar y abrir detalle sin perder datos. En móvil abrir/cerrar índice y usar audio con teclado.
3. Paquetes: buscar por alumno/paquete, filtrar saldo; abrir detalle y catálogo. Editar ARS 1.000,00 como `1000.00`, probar coma decimal y cambiar moneda; no guardar durante revisión de solo lectura.
4. Grupos: sin paquete elegible aparece el siguiente paso. Con un paquete activo, buscar alumnos, completar capacidad y previsualizar horario. En Nueva York, 01/11/2026 01:30 exige elegir instancia y 14/03/2027 02:30 se rechaza.
5. Operaciones: abrir una resolución; comprobar pedido, importe y acción. Motivo y confirmación son necesarios. Cancelar o cambiar de orden no ejecuta ni conserva una aprobación anterior.
6. Órdenes: comparar fecha/comprador/curso/importe/estado; abrir Detalles para proveedor, cupón, afiliado, recibo y acciones autorizadas.

## Errores, autorización y límites

Fallos de avance se muestran como no disponible, no como progreso cero. Grupos distinguen carga, error y ausencia de opciones. La resolución de pagos conserva la ventana y el motivo ante error; los handlers existentes mantienen autorización, auditoría, cotizaciones y claves de idempotencia. Las instantáneas, importes e instantes no se recalculan desde etiquetas.

No se verificó Safari/iOS físico, lector de pantalla, zoom 200 %, todos los estados de error de red ni efectos externos. La prueba de un grupo con paquete elegible usa una respuesta GET de fixture en navegador, identificada como tal; los casos temporales y payloads se verifican en unitarios sin escribir en la base.

No hubo cambios de base de datos ni se volvió a ejecutar el seed. Las imágenes pedagógicas existentes no se sustituyen automáticamente por inferencia de la interfaz. U22 permanece abierto para curación de contenido con revisiones adecuadas.

## Despliegue y reversión

Andrés autorizó expresamente merge y reinicio de `spanishnow public` después de las validaciones. El servicio sincroniza main y reinicia; se verificará que la copia fija use el merge y que la URL pública responda.

Reversión: revertir el commit del PR y dejar al servicio sincronizar la nueva main. No hay migraciones ni datos que revertir.

Protección adicional de U02: Escape conserva formularios editados o con archivos seleccionados y muestra un aviso EN/ES dentro de la ventana. El usuario guarda o descarta mediante los botones explícitos; los diálogos sin cambios conservan cierre por Escape y retorno de foco. Una prueba adicional verifica borrador y cambio de idioma.
