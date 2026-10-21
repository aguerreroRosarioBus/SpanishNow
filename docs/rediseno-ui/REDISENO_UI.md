# Rediseño de la interfaz de la plataforma

Documento de referencia para implementar el rediseño visual de la plataforma (app Angular en `frontend/`).
Reúne el diagnóstico de la interfaz actual, el lenguaje de diseño acordado y el plan de implementación.

- **Mockups aprobados (interactivos):** https://claude.ai/artifact/8CarnvdRDkmNzdzYub9qTa (privado, del dueño de la cuenta)
- **Fuente de los mockups:** [`mockups/profesor-gestion-curso.dc.html`](mockups/profesor-gestion-curso.dc.html) y [`mockups/alumno-reproductor.dc.html`](mockups/alumno-reproductor.dc.html). Son HTML con estilos inline: sirven para leer medidas, colores y estructura exactos. No se copian tal cual a Angular.
- **Rama base:** `feat/tprs-lesson-flow`, que ya tiene la paleta naranja/crema, Poppins y Nunito Sans. `main` todavía tiene el tema verde viejo "Duolingo": no partir de ahí.

---

## 1. Diagnóstico: qué está mal hoy

La queja general es que todo se ve **enorme, encimado y con el espacio mal repartido**. La causa de fondo es que **no hay un sistema de diseño aplicado**: cada pantalla define sus propios tamaños, espaciados y botones. Hay tokens en `styles.scss`, pero los valores base son demasiado grandes y los componentes no los respetan.

> Ojo con el viewport: las capturas de referencia se tomaron con la ventana en ~1000px CSS de ancho (pantalla retina al 2x). El diseño tiene que verse bien a **1024px**, no solo a 1440px.

### 1.1 Problemas globales

| # | Problema | Dónde se origina |
|---|----------|------------------|
| G1 | **Todo es grande.** Texto base de 17px, botones de 44–56px de alto, títulos gigantes. Al tener todo el mismo peso, nada se destaca. | `$font-size-base: 1.0625rem`, `.btn` y estilos por componente |
| G2 | **Botones sin jerarquía.** "Volver", "Expandir todas", "Editar" y "Nueva unidad" son todas píldoras grandes con sombra de color. Falta distinguir principal, secundario, discreto y de ícono. | `.btn*` en `styles.scss` y estilos locales |
| G3 | **Emojis como íconos** (✏️ 📚 🗑️ 📖 📊 🔄). Se dibujan distinto en cada sistema, quedan desalineados y a veces casi no se ven (el tacho rojo) o salen rotos (⍰ en la tarjeta de curso). | Templates de `course-manage`, `story-card`, `unit-card`, `student-dashboard`, etc. |
| G4 | **El contenido no tiene ancho máximo.** Las listas se estiran hasta el borde y las pantallas con una sola tarjeta dejan dos tercios vacíos ("Mis Cursos", "Mi Avance"). | `layout.component.scss` y cada página |
| G5 | **El header mezcla la web pública con la app** ("Contacto" y "Acerca de" dentro de la plataforma) y compite con la barra lateral. | `navbar-top.component.html` |
| G6 | **La barra lateral expandida es ancha** para 2–4 links, y en el reproductor suma una tercera columna. | `sidebar-nav.component.scss` (240px) |
| G7 | **Radios y sombras exagerados** (28px, sombras naranjas bajo los botones) que dan un aspecto de juguete y suman ruido. | `--radius-*` y `--shadow-primary` |
| G8 | **Footer de la web pública dentro de la app.** | `layout` |

### 1.2 Problemas por pantalla

**Profesor: gestión de curso (`/teacher/course/:id/manage`)**, la peor de todas.
- El título de la unidad ocupa dos líneas porque 4 botones grandes (Editar, Vocabulario, +Historia, Borrar) le roban el espacio.
- **Borrar es lo más llamativo de la pantalla:** un círculo rojo en cada unidad y en cada historia.
- Se muestran IDs internos (#4, #101, #301) y textos repetidos ("Unidad #1 - Unidad 1: …").
- Hay errores de plural ("1 preguntas").
- "Volver al Dashboard" es un botón grande, aunque la barra lateral ya permite volver.
- "Expandir todas" y "Colapsar todas" son dos botones grandes.
- El lápiz junto al título del curso está en un círculo sobredimensionado.

**Alumno: reproductor (`/student/course/:id/play`)**, la mejor, pero:
- Hay tres columnas a la vez: barra lateral, índice del curso y contenido.
- Hay **tres sistemas de anterior/siguiente** que compiten: flechas de unidad, "Anterior/Siguiente" de historia y "Bloque anterior/Continuar".
- El título se repite: arriba y dentro de la tarjeta.
- Los 10 chips de pasos ocupan dos renglones.
- Se muestran datos internos al alumno ("Lección publicada · revisión 2").
- Hay estados confusos en el índice: una historia aparece "completada" y "bloqueada" a la vez.

**Alumno: Mis Cursos (`/student/dashboard`)**
- Una sola tarjeta en la esquina y el resto de la pantalla vacía.
- Si el curso no tiene imagen, la portada muestra el texto alternativo y un glifo roto en lugar de un placeholder.
- La fecha sale en formato de EE. UU. ("10/21/26, 6:24 AM").
- Dos botones grandes apilados.

**Alumno: Mi Avance (`/student/progress`)**
- La tarjeta del curso es angosta y tiene **scroll interno horizontal y vertical**.
- Los títulos de historia se cortan en varias líneas.
- Los estados se cortan ("Lectura complet…").
- Se muestra "0/0 (0 intentos)" sin sentido.

**Configuración (`/settings`)**
- Las secciones van en tarjetas grandes de radio enorme.
- El aviso "próximamente" es un bloque azul con borde izquierdo (patrón a evitar).
- Las etiquetas "Nombre:" y "Email:" con dos puntos y en negrita le quitan protagonismo al dato.

**Maestros (`/teachers`)**
- El error de carga es una franja gigante sin acción para reintentar.
- El footer público aparece dentro de la app.

**Login (`/auth/login`)**
- El logo se monta sobre el borde de la tarjeta.
- Hay una franja beige suelta arriba.
- El botón deshabilitado se ve lavado.

### 1.3 Bugs detectados (no son de diseño; se arreglan aparte)

1. **El header muestra al usuario logueado ("lucas") en la pantalla de login.** Hay un estado de sesión viejo en el navbar.
2. **La portada de un curso sin imagen** muestra el título de la página y un glifo roto. Tiene que mostrar un placeholder diseñado (iniciales o nivel sobre fondo de marca).
3. **`/teachers` falla al cargar** ("Error al cargar los profesores").
4. **El índice del reproductor marca una historia como completada y bloqueada a la vez** ("María en la Fiesta"). Revisar la lógica de `locked`.
5. **Mi Avance muestra "0/0 (0 intentos)"** en historias sin preguntas.

---

## 2. Lenguaje de diseño

### 2.1 Principios

1. **Cálido y sereno, no infantil.** Se mantiene la paleta de marca (naranja, crema, verde), con menos radio, menos sombra y nada de rebotes.
2. **Densidad de herramienta.** Es una app de trabajo y estudio, no una landing. Texto de interfaz a 14–15px y controles de 32–36px. **Lo único grande es el contenido de lectura** (la historia, a 18px).
3. **Jerarquía por peso, color y espacio, no por tamaño.** En cada pantalla hay una sola acción principal.
4. **Lo destructivo nunca va en primer plano.** Borrar vive en un menú "⋯", en rojo y separado del resto.
5. **Mostrar solo lo que le sirve al usuario.** Nada de IDs internos, revisiones ni metadatos técnicos.
6. **Un solo patrón por problema.** Un sistema de navegación anterior/siguiente, un tipo de botón principal, un set de íconos.

### 2.2 Color

Se usan los tokens que **ya existen** en `feat/tprs-lesson-flow:frontend/src/styles.scss`. Los mockups usan valores casi idénticos. Equivalencias:

| Uso | Token existente | Valor mockup |
|-----|-----------------|--------------|
| Acción principal, activo, acento | `--color-primary` `#c94a14` | `#C2410C` |
| Hover de la acción principal | `--color-primary-hover` `#a53c0f` | `#9A3412` |
| Fondo de ítem activo y chips de acento | `--color-primary-soft` `#fff1e8` / `--color-primary-light` | `#FDEEE4` |
| Fondo de página (crema) | `--color-bg-light` `#fbf3ea` | `#FBF5EF` |
| Superficies (tarjetas, header, barra lateral) | `--color-bg` `#ffffff` | `#FFFFFF` |
| Hover neutro, chips neutros | `--color-bg-dark` `#f3e7da` | `#F3EAE1` |
| Bordes | `--color-border` `#e6d8c8` | `#EDE3D9` |
| Texto | `--color-text` `#2b2b2b` | `#2A211C` |
| Texto secundario | `--color-text-light` `#5a514a` | `#6E6259` |
| Éxito, completado, publicado | `--color-success` `#2f7d4f` + `--color-success-soft` | `#1F7A4D` / `#E6F4EC` |
| Peligro (solo en menús y confirmaciones) | `--color-danger` `#b3372f` | `#B42318` |

**Tokens nuevos a agregar:**
- `--color-section-tint: #fdf1e7`: fondo de la cabecera de unidad (profesor) y del bloque de unidad en el índice (alumno).
- `--color-section-border: #f3dcc9`: línea bajo esa cabecera.
- `--color-divider: #f1e8df`: separador entre filas de una lista.

**Reglas:**
- Todo texto tiene que cumplir un contraste de 4.5:1. No usar gris más claro que `--color-text-light` para texto.
- Hay que **eliminar** `--shadow-primary`, `--shadow-success` y demás sombras de color bajo los botones.
- No usar degradados ni tarjetas con borde izquierdo de color.

### 2.3 Tipografía

Familias (ya cargadas en `index.html`): **Poppins** 500/600 para títulos y **Nunito Sans** 400/600/700 para el texto.

| Rol | Tamaño / peso / interlineado | Fuente |
|-----|------------------------------|--------|
| Título de página (h1) | 26px / 600 / 1.2, `letter-spacing: -0.015em` | Poppins |
| Título de lección (h1 del reproductor) | 24px / 600 / 1.25 | Poppins |
| Título de bloque de contenido | 20px / 600 / 1.3 | Poppins |
| Título de unidad | 19px / 600 / 1.3 | Poppins |
| Título de sección (h2 chico) | 15px / 600 | Poppins |
| Título de tarjeta o panel | 16px / 600 | Poppins |
| Texto de interfaz | 14px / 400–600 | Nunito Sans |
| Texto secundario, meta | 13px / 400–600 | Nunito Sans |
| Etiqueta en mayúsculas | 11–12px / 700, mayúsculas, `letter-spacing: .06–.08em` | Nunito Sans |
| **Contenido de lectura** (historia) | **18px / 400 / 1.7**, `max-width: 62ch` | Nunito Sans |

Cambios en Bootstrap: `$font-size-base` pasa de `1.0625rem` (17px) a **`0.9375rem` (15px)**. Hay que revisar `$h1-font-size`…`$h6-font-size` para que sigan esta escala.

### 2.4 Espaciado, radios, sombras

- **Escala de espaciado** en múltiplos de 4: 4, 8, 12, 16, 20, 24, 32, 48, 64. Los tokens `--spacing-*` existentes se mantienen; agregar `--spacing-2xl: 48px`.
- **Radios:** el valor actual pasa al valor nuevo.

  | Token | Actual | Nuevo | Uso |
  |-------|--------|-------|-----|
  | `--radius-sm` | 10px | 6px | Chips, badges |
  | `--radius-md` | 14px | 8px | Botones, inputs, ítems de menú |
  | `--radius-lg` | 20px | 12px | Tarjetas y paneles |
  | `--radius-xl` | 28px | 16px | Modales |

  `--radius-full` queda solo para avatares, puntos de estado y barras de progreso.
- **Sombras:** las tarjetas usan `0 1px 2px rgba(42,33,28,.04)` o solo borde. Los menús desplegables y popovers usan `0 8px 24px rgba(42,33,28,.12)`. Los botones no llevan sombra.

### 2.5 Íconos

- **Un solo set de línea, estilo Lucide:** trazo de 2px, `stroke-linecap: round`, 16px en botones, 18px en botones de ícono y 20px en la barra lateral plegada.
- Recomendación: el paquete `lucide-angular` (verificar que sea compatible con Angular 21). Si no lo es, usar un componente `<app-icon name="…">` propio con los SVG inline (la barra lateral ya usa SVG inline con trazo de 1.8: unificar a 2).
- **Se eliminan todos los emojis de la interfaz.** El contenido que escribe el profesor no se toca.

### 2.6 Componentes

**Botones**, una sola familia y cuatro variantes:

| Variante | Aspecto | Uso |
|----------|---------|-----|
| `primary` | Fondo `--color-primary`, texto blanco | **Una por pantalla:** "Nueva unidad", "Continuar" |
| `secondary` | Fondo blanco, borde `#E4D8CC`, texto oscuro | Acciones de apoyo: "Editar curso", "Vista de alumno", "Practicar" |
| `ghost` | Sin fondo ni borde, texto secundario; hover con fondo `--color-bg-dark` | Acciones de baja prioridad: "Expandir todo", "Vocabulario", "Anterior", "Agregar historia" |
| `icon` | 32×32 (36×36 en el reproductor), sin fondo; hover con fondo | Arrastrar, plegar, editar, "⋯". Siempre con `aria-label` |

- **Tamaños:** `sm` 32px de alto, 13px de texto, padding horizontal de 10px. `md` (por defecto) 36px, 14px, 14px. `lg` 44px, 15px, 20px (solo para la navegación del reproductor).
- Peso 600, radio de 8px, separación de 6px entre ícono y texto.
- **Sin** `translateY` en hover, **sin** sombra y **sin** `text-transform`.
- Un botón deshabilitado va con `opacity: .45`, no con colores lavados distintos.

**Menú "⋯" (overflow):**
- Panel blanco de 210px, radio de 10px y padding de 6px, con la sombra de menú.
- Ítems de 34px de alto, 13px de texto, peso 600.
- La acción destructiva va al final, separada por una línea, en `--color-danger` y con el ícono de tacho.
- Borrar **siempre pide confirmación** con un modal que nombra lo que se borra.

**Badges y estado:**
- Chips de 2px × 8px de padding, radio de 6px, 12px de texto, peso 700.
- Publicado o publicada: fondo `--color-success-soft` y texto verde oscuro. Agregar un punto de 6px cuando el estado acompaña un título.
- Borrador: fondo `--color-bg-dark` y texto secundario.
- Nivel (A1, A2…): fondo `--color-primary-soft` y texto `--color-primary-hover`.

**Tarjetas y paneles:** fondo blanco, borde de 1px `--color-border`, radio de 12px y la sombra mínima. El padding interno es de 16px en paneles y de 24–28px en la tarjeta de lección.

**Filas de lista** (historias):
- 48px de alto, separadas por una línea `--color-divider`, hover con fondo `#FDF9F5`.
- Las acciones de la fila (editar, "⋯") aparecen en hover o foco. En pantallas táctiles quedan siempre visibles.

**Encabezado de página:**
1. Ruta de navegación (breadcrumb) a 13px.
2. h1 con sus badges en la misma línea.
3. Línea de resumen en texto secundario ("3 unidades · 11 historias · 12 estudiantes inscritos").
4. Acciones alineadas a la derecha y abajo, de modo que pasan abajo si no hay espacio.

**Barra de pasos de la lección:**
- N segmentos de 6px de alto y 4px de separación, cada uno clickeable y con `aria-label` "Paso k: Tipo".
- Colores: **completados en verde** `--color-success`, **el actual en naranja** `--color-primary` con un halo `0 0 0 2px --color-primary-soft`, pendientes en `--color-border`.
- Encima, a la izquierda: "Paso 8 de 10 · Historia", con el tipo en naranja. A la derecha: "**70% completado**" en verde.

**Barra de progreso del curso:** 6px de alto, fondo `--color-bg-dark`, relleno `--color-primary`, con la etiqueta "3 de 11 historias" encima.

**Estados del índice del alumno:**
- Completada: círculo verde de 22px con tilde blanca.
- Actual: anillo naranja con un punto, y la fila con fondo `--color-primary-soft`.
- Pendiente: anillo `#D9CBBE`.
- Bloqueada (si aplica): ícono de candado gris. **Nunca** combinar completada con bloqueada.

### 2.7 Estructura general (shell)

- **Header de la app:** 56px de alto, fondo blanco y borde inferior.
  - A la izquierda: logo de 28px y "SpanishNow". En la vista del profesor se suma el chip "Profesor".
  - A la derecha: botón de cuenta (avatar de 26px, nombre y flechita) que abre un menú con Configuración y Cerrar sesión.
  - **Se sacan "Contacto" y "Acerca de"** del header de la app. Van al menú de cuenta o a un enlace de "Ayuda".
  - "Explorar" (el catálogo del alumno) pasa a la barra lateral como "Explorar cursos".
- **Barra lateral:**
  - Expandida mide **220px**, con padding de 16px × 12px. Los ítems miden 36px de alto, tienen ícono de 18px, texto de 14px/600 y radio de 8px. El ítem activo lleva fondo `--color-primary-soft` y texto `--color-primary-hover`.
  - Los títulos de grupo ("ENSEÑANZA", "CUENTA") van a 11px en mayúsculas.
  - Plegada mide **64px**: solo íconos de 40×40 con `aria-label` y `title`.
  - **En el reproductor se pliega automáticamente.**
- **Contenido:** padding de 28px × 32px y ancho máximo de **1040px** en pantallas de gestión y listas, o de **1180px** en el reproductor, centrado.
- **Footer público:** no se muestra dentro de la app autenticada.
- **Responsive:** por debajo de 768px, la barra lateral pasa a un menú desplegable. En el reproductor, el índice queda arriba del contenido. Las acciones del encabezado pasan abajo del título si no hay espacio.

### 2.8 Textos

- Plurales correctos: "1 pregunta", "2 preguntas", "Sin preguntas".
- Fechas en formato local en español: `21 oct 2026`, o relativas ("hace 2 días"). Usar el `DatePipe` con locale `es`.
- Capitalización de oración en botones y títulos: "Nueva unidad", "Expandir todo", "Mis cursos".
- No mostrar IDs, revisiones ni prefijos redundantes ("Unidad #1 - Unidad 1:"). El número de la unidad sale de su orden.

---

## 3. Especificación de pantallas

### 3.1 Profesor: gestión de curso

Mockup: `mockups/profesor-gestion-curso.dc.html`. Archivos: `features/teacher/course-manage/` (`course-manage.html/.scss`, `_manage-theme.scss`, `components/unit-list`, `unit-card`, `story-card`).

1. **Ruta de navegación:** "Mis cursos › Español A1 – Completo". **Reemplaza** el botón "Volver al Dashboard".
2. **Encabezado:**
   - h1 con el nombre del curso, el badge de nivel y el badge de estado del curso.
   - Línea de resumen: unidades · historias · inscritos.
   - Acciones: `secondary` "Vista de alumno" (nueva: abre el reproductor en modo vista previa), `secondary` "Editar curso" (reemplaza el lápiz en círculo) y `primary` "Nueva unidad".
3. **Barra de la lista:** separador, h2 "Contenido del curso" y, a la derecha, `ghost sm` "Expandir todo" y "Colapsar todo".
4. **Tarjeta de unidad:**
   - La cabecera tiene fondo `--color-section-tint`, radio de 11px arriba (o completo si está plegada) y, cuando está abierta, una línea inferior `--color-section-border`.
   - En la cabecera, en orden:
     - **Manija de arrastre** (`icon`).
     - **Flechita para plegar o desplegar** (`icon`): gira 90° cuando está abierta.
     - **Bloque de texto:** la etiqueta "UNIDAD 1" (12px/700 en `--color-primary-hover`), y debajo el título de la unidad (19px/600, en una sola línea con elipsis) y el meta "4 historias · 3 publicadas" (13px).
     - **Acciones:** `ghost sm` "Vocabulario" y `icon` "⋯" con Editar unidad, Duplicar y Eliminar unidad.
   - **No hay** un botón "+ Historia" en la cabecera.
   - **No hay** un número grande en un recuadro de color: se probó y se descartó por excesivo.
   - Al abrirse se ve:
     - La descripción de la unidad (13px, secundaria), alineada con el título.
     - Las filas de historia, con sangría de 56px a la izquierda.
     - Al final, `ghost sm` "Agregar historia" en `--color-primary-hover`: **es el único botón para agregar historias**.
5. **Fila de historia:**
   - En orden:
     - Manija de arrastre.
     - Número de orden en un cuadrito de 24px (fondo `#F6EEE6`).
     - Título (enlace, 14px/600, con elipsis).
     - Cantidad de preguntas (13px, 96px de ancho fijo).
     - Badge Publicada o Borrador (74px de ancho).
     - Acciones de la fila: `icon` editar y `icon` "⋯".
   - El menú "⋯" de la historia tiene: Editar historia, Editar preguntas, Duplicar, Mover a otra unidad…, una línea separadora y **Eliminar historia** en rojo.
6. Se mantienen las funciones actuales: arrastrar para reordenar, todos los modales (unidad, historia, preguntas, vocabulario) y los enlaces al compositor de lecciones. Los modales siguen el mismo lenguaje (radio de 16px, botones nuevos).

### 3.2 Alumno: reproductor

Mockup: `mockups/alumno-reproductor.dc.html`. Archivos: `features/student/story-player/` (`story-player.component.*`, `components/player-sidebar.*`, `lesson-view.*`, `lesson-block.*`, `full-story-block.*`, `reinforcements.*`, `navigation.service.ts`).

1. **Barra lateral global plegada** a 64px mientras dure el reproductor.
2. **Índice del curso** (panel izquierdo de 260–300px):
   - Arriba: el enlace "‹ Mis cursos" (13px), el nombre del curso (16px/600) y la barra de progreso del curso ("3 de 11 historias").
   - Bloque de unidad con fondo `--color-section-tint`: "UNIDAD 1 DE 3" (11px, naranja), el título de la unidad (14px/600) y las flechas `icon` para ir a la unidad anterior o siguiente (deshabilitadas en los extremos).
   - Lista ordenada (`<ol>`) de historias con los estados de la sección 2.6. La actual lleva `aria-current="page"`.
   - **Se elimina** "← Volver al Dashboard" debajo del panel.
3. **Tarjeta de lección:**
   - Arriba: "Historia 3 de 4 · Unidad 1" (13px, secundario) y h1 con el título (24px). **Se elimina** el encabezado duplicado con "← Anterior / Título / Siguiente →" y la línea "Lección publicada · revisión 2". El badge "Lectura completada" se reemplaza por el estado en el índice.
   - Barra de pasos (sección 2.6). Reemplaza los 10 chips.
   - Contenido del paso: etiqueta de fase ("ANTES", "DURANTE", "DESPUÉS"), título del bloque (20px) y el contenido a 18px/1.7.
   - Pie: `ghost lg` "‹ Anterior" (deshabilitado en el paso 1) y `primary lg` "Continuar ›". En el último paso dice "Siguiente historia ›". **Es el único sistema de anterior/siguiente** dentro de la lección. Para cambiar de historia o de unidad se usa el índice.
4. **Practicar vocabulario** (antes "Refuerzos opcionales"):
   - h2 de 15px y, al lado, "Opcional · de la unidad 1".
   - Grilla de tarjetas compactas (`auto-fit, minmax(220px, 1fr)`): ícono de 36px sobre `--color-section-tint`, nombre, una línea de descripción y `secondary sm` "Practicar".

### 3.3 Resto de pantallas (aplicar el mismo sistema, sin mockup)

- **Mis Cursos (alumno):**
  - Grilla de tarjetas (`auto-fill, minmax(280px, 1fr)`) dentro del contenedor de 1040px.
  - Portada con placeholder diseñado cuando no hay imagen.
  - Una sola acción `primary` "Continuar" y, dentro de un "⋯", "Reiniciar progreso" con confirmación.
  - La fecha de inscripción en formato local.
  - Debajo o en un lateral, "Explorar cursos" para el catálogo.
- **Mi Avance:**
  - Una tarjeta por curso a todo el ancho del contenedor, con la barra de progreso.
  - Una **tabla o lista de filas** (no una tarjeta con scroll interno) con columnas Historia, Unidad, Estado, Respuestas y Refuerzos.
  - Si no hay datos, mostrar "—" en lugar de "0/0 (0 intentos)".
- **Configuración:**
  - Ancho máximo de 720px.
  - Secciones con h2 y una lista de definiciones (etiqueta en texto secundario de 13px, valor a 14px, sin dos puntos).
  - El aviso "próximamente" va como texto secundario, no como alerta azul.
- **Maestros:**
  - Estado de error compacto con un botón "Reintentar".
  - Estado vacío.
  - Grilla de tarjetas de maestro.
- **Dashboard del profesor:** igual que "Mis Cursos": grilla de tarjetas y acción `primary` "Nuevo curso".
- **Login y registro:**
  - El logo va dentro de la tarjeta, no montado sobre el borde.
  - Tarjeta de 400px, inputs de 40px y botón `primary` de ancho completo con 44px de alto.
  - Sin franja de fondo suelta.
  - Header público sin datos de usuario.
- **Compositor de lecciones** (`features/teacher/lesson-composer/`): adoptar botones, íconos, radios y tamaños de texto. No rediseñar su flujo en esta etapa.

---

## 4. Plan de implementación

Trabajar sobre una rama nueva creada desde `feat/tprs-lesson-flow`. Ir en fases, en commits separados, y verificar visualmente al final de cada fase.

**Fase 1: base (tokens y estilos globales)** en `frontend/src/styles.scss`
- Variables de Bootstrap: `$font-size-base` a 15px, escala de títulos, `$border-radius*` alineados a la sección 2.4 y `$btn-*` (alturas, padding, peso).
- Tokens: radios nuevos, sombras sin color, tokens nuevos de la sección 2.2 y `--spacing-2xl`.
- Reescribir `.btn`, `.btn-primary`, `.btn-secondary`/`.btn-outline-*` y `.btn-sm`/`.btn-lg`, y agregar `.btn-ghost` y `.btn-icon`.
- Estilos de `.badge` de estado, `.card`, `.dropdown-menu`/`.dropdown-item` y `.progress` según la sección 2.6.
- Componente o paquete de íconos (sección 2.5).

**Fase 2: estructura general** en `shared/components/layout`, `navbar-top` y `sidebar-nav`
- Header de 56px, menú de cuenta, sin links públicos y chip de rol.
- Barra lateral de 220px / 64px, con "Explorar cursos" para el alumno y plegado automático en la ruta del reproductor.
- Contenedor con ancho máximo y sin footer público en las rutas autenticadas.
- Arreglar el bug 1 (sesión vieja en el header del login).

**Fase 3: gestión de curso del profesor** (sección 3.1)
- Reemplazar los emojis, los botones y el layout de `unit-card` y `story-card`.
- Crear el menú "⋯" (con `ngbDropdown`, ya disponible) y la confirmación de borrado.
- Agregar la ruta de navegación.
- Crear un pipe o helper de plurales.

**Fase 4: reproductor del alumno** (sección 3.2)
- `player-sidebar` con estados, barra de pasos en `lesson-view` y navegación única.
- Eliminar la navegación duplicada y los metadatos internos.
- Arreglar el bug 4 (completada y bloqueada a la vez).

**Fase 5: resto de pantallas** (sección 3.3), incluidos los bugs 2, 3 y 5.

### Criterios de aceptación

- No queda ningún emoji en los templates de la interfaz (buscar en `features/` y `shared/`).
- No hay sombras de color en los botones, y cada pantalla tiene **una sola** acción `primary` visible.
- En `/teacher/course/:id/manage`, los títulos de unidad entran en una línea a 1024px y borrar solo es accesible desde un "⋯".
- En `/student/course/:id/play` hay un único par Anterior/Continuar, la barra lateral global está plegada y la barra de pasos marca los completados en verde.
- Sin scroll horizontal a 390px, 1024px y 1440px de ancho.
- Contraste AA en todo el texto.
- Los tests y el build pasan: `npm run build`, la suite de tests existente y los E2E de Playwright de `feat/tprs-lesson-flow`.

### Verificación visual

Levantar la app con el backend de pruebas (ver `DEVELOPMENT.md`) y capturar cada pantalla a 1024px, 1440px y 390px, como profesor y como alumno. Comparar contra los mockups.
