# Referencias de interacción para la pizarra

Esta nota separa las funciones descritas por sus proveedores de las decisiones de diseño de SpanishNow. Se consultó la documentación pública de Explain Everything y Classroomscreen; no se inspeccionó ni copió su código.

## Explain Everything

La documentación de Explain Everything describe la importación de documentos con selección de páginas y varios diseños para distribuirlas en una diapositiva, incluido **Grid**. Los documentos insertados se pueden mover, rotar, escalar y anotar. Sus cuadros de texto se editan dentro del lienzo y admiten tamaño, fuente, color y alineación; las notas adhesivas comparten ese formato y se redimensionan con controles de objeto. Las notas también ofrecen colores predefinidos.

Fuentes:

- [Import documents, spreadsheets, and presentations](https://help.explaineverything.com/hc/en-us/articles/360019804873-Import-documents-spreadsheets-and-presentations)
- [Insert text](https://help.explaineverything.com/hc/en-us/articles/360013167134-Insert-text)
- [Add Sticky Notes](https://help.explaineverything.com/hc/en-us/articles/360021338800-Add-Sticky-Notes)

## Classroomscreen

La documentación pública presenta las pantallas como espacios personalizables con widgets, plantillas y fondos. El widget de texto ofrece estilos, opciones de formato y colores en una barra contextual. Esto sugiere mantener controles de texto cerca del contenido y permitir reutilizar el espacio visual para actividades de clase.

Fuentes:

- [Text widget](https://help.classroomscreen.com/article/26-text)
- [Personalizing your screen](https://preview.classroomscreen.com/helpcenter/personalizing-your-screen)
- [Classroomscreen](https://classroomscreen.com/)

## Decisiones aplicadas en SpanishNow

- Importar las páginas seleccionadas de un PDF como objetos de imagen distribuidos en cuadrícula, conservando la posibilidad de anotar encima.
- Escribir directamente dentro de los objetos de texto y notas; mostrar controles de edición y formato junto al elemento seleccionado.
- Usar las mismas operaciones de selección, movimiento y redimensionamiento para los objetos de la pizarra, sin reproducir iconos, código ni recursos visuales de los productos de referencia.
- Mantener formatos y fondos como propiedades de cada página para que el modo cuaderno siga siendo parte de una única pizarra colaborativa.

Estas decisiones son una síntesis del requerimiento de W10 y de las funciones descritas en las fuentes. No implican que se haya inspeccionado el funcionamiento interno de Explain Everything o Classroomscreen.

## Límite de ingeniería inversa

En esta entrega no había una copia local autorizada de Explain Everything disponible para analizar con REA. Por ello no se hizo ingeniería inversa ni se atribuyen observaciones de runtime al producto. Las notas anteriores provienen únicamente de la documentación pública enlazada; el comportamiento interno y las diferencias por plataforma quedan sin verificar.
