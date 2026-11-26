# Curso de prueba TPRS

Curso gratis en el que se inscribe automáticamente todo alumno que se registra. En unos 30 minutos muestra la plataforma y deja la base de TPRS: alguien que no sabe español entiende tres historias completas y, al final, el curso explica por qué funcionó.

## Decisiones (Andrés, 26/11/2026)

| # | Tema | Decisión |
|---|---|---|
| 1 | Título | *Free trial: Learn Spanish through stories* |
| 2 | Tratamiento | tú (neutro) |
| 3 | Personajes | Sofía, su gato Tito y su perro Pancho |
| 4 | Audio | voz sintética (macOS `say`, voz es_MX «Paulina») por keyframe y por expresión |
| 5 | Imágenes | ilustraciones de un mismo estilo, encargadas a Codex (una por keyframe) |
| 6 | Video de bienvenida | provisorio, hasta que Solange grabe uno |
| 7 | Curso siguiente | sin cupón por ahora |
| 8 | Alumnos existentes | no hay: alcanza con inscribir al registrarse |
| — | Idioma de explicaciones y glosas | inglés; historias en español |
| — | Extensión | 1 unidad, 3 historias, cuestionario final y certificado |
| — | Docente | configurable por variable (en local `admin@gmail.com`) |

## Curso y unidad

- **Curso:** *Free trial: Learn Spanish through stories*, nivel A1, gratis y publicado, con *slug* `free-trial-spanish-stories`.
  - Descripción: *Understand your first three Spanish stories in 30 minutes — no grammar drills. A taste of TPRS, the method behind every SpanishNow course.*
- **Unidad:** *Your first Spanish stories*.
  - Descripción: *Each story introduces just three new structures. You see them first, then hear and read the story in short scenes, answering easy questions along the way. Those questions are the method: many meaningful repetitions, so the words stick without memorizing.*

## Vocabulario

| Estructura | Glosa | Ejemplo | Rol |
|---|---|---|---|
| hay | there is / there are | Hay un perro. | objetivo, historia 1 |
| quiere | wants | Sofía quiere un perro. | objetivo, historia 1 |
| tiene | has | Sofía tiene un gato. | objetivo, historia 1 |
| va a | goes to | Sofía va a un café. | objetivo, historia 2 |
| le gusta | likes (it pleases him/her) | A Pancho le gusta la pizza. | objetivo, historia 2 |
| no le gusta | doesn't like | No le gusta el café. | objetivo, historia 2 |
| busca | looks for | Sofía busca a Pancho. | objetivo, historia 3 |
| está en | is in / is at | Pancho está en el café. | objetivo, historia 3 |
| encuentra | finds | Sofía encuentra a Pancho. | objetivo, historia 3 |

Las palabras transparentes o de apoyo (perro, gato, tienda, dinero, pizza, mesa, escuela…) se glosan con *tooltips* sobre el keyframe, no como estructuras.

## Historia 1: Sofía quiere un perro

**Antes:** hay · quiere · tiene

**Durante:**

1. Hay una chica. La chica se llama Sofía. Sofía tiene un gato. El gato se llama Tito. Sofía no tiene un perro.
   - ¿Sofía tiene un gato? → Sí
   - ¿El gato se llama Tito o Toby? → Tito
2. Sofía quiere un perro. Quiere un perro grande. Sofía dice: «Mamá, quiero un perro». Mamá dice: «No. Tienes un gato».
   - ¿Sofía quiere un perro o un gato? → Un perro
   - ¿Mamá dice que sí? → No
3. Sofía camina a una tienda de animales. En la tienda hay muchos perros. Hay perros grandes y hay perros pequeños.
   - ¿En la tienda hay muchos perros? → Sí
4. Un perro grande cuesta cien dólares. Sofía tiene diez dólares. Sofía no tiene cien dólares. ¡Qué problema!
   - ¿Sofía tiene cien dólares? → No
5. Hay un perro pequeño. No tiene casa. ¡Es gratis! Sofía dice: «¡Quiero este perro!». Ahora Sofía tiene un gato y un perro. El perro se llama Pancho.

**Después:** historia completa · ¿El perro se llama Pancho o Tito? → Pancho · tarjetas · escuchar y repetir

**Reapariciones:** *quiere* en la historia 2; *tiene* y *hay* en la historia 3.

**Glosas:** chica (girl) · se llama (is called) · grande (big) · dice (says) · camina (walks) · tienda de animales (pet shop) · pequeños (small) · cuesta (costs) · gratis (free) · ahora (now)

## Historia 2: Pancho va a un café

**Antes:** va a · le gusta · no le gusta · *quiere* (reaparición)

**Durante:**

1. Pancho es el perro de Sofía. A Pancho le gusta comer. Le gusta mucho la pizza. No le gusta la comida de perro.
   - ¿A Pancho le gusta la pizza? → Sí
   - ¿A Pancho le gusta la comida de perro? → No
2. Un día, Sofía va a un café. Pancho va también. En el café hay pizza, café y pan.
   - ¿Sofía va a un café o a una escuela? → A un café
3. Sofía quiere un café. A Sofía le gusta el café. A Pancho no le gusta el café. Pancho quiere pizza.
   - ¿A Pancho le gusta el café? → No
4. Un señor tiene una pizza grande. Pancho va a la mesa del señor. ¡Pancho come la pizza del señor!
   - ¿Pancho come la pizza o el pan? → La pizza
5. El señor no está furioso. El señor dice: «¿Te gusta la pizza? ¡A mí me gusta tu perro!». Sofía y el señor son amigos ahora.

**Después:** historia completa · ¿El señor está furioso? → No · emparejar · escuchar y repetir

**Reapariciones:** *le gusta* y *va a* en la historia 3.

**Glosas:** comer (to eat) · comida (food) · un día (one day) · también (too) · pan (bread) · señor (man / sir) · mesa (table) · come (eats) · furioso (angry) · amigos (friends)

## Historia 3: ¿Dónde está Pancho?

**Antes:** busca · está en · encuentra · *tiene*, *hay*, *le gusta*, *va a* (reapariciones)

**Durante:**

1. Un día, Pancho no está en la casa. Sofía busca a Pancho. Busca en la cocina. Busca en el jardín. Pancho no está.
   - ¿Sofía busca a Pancho o a Tito? → A Pancho
2. Sofía va a la escuela. Busca a Pancho en la escuela. Hay muchos niños, pero Pancho no está en la escuela.
   - ¿Pancho está en la escuela? → No
3. Tito, el gato, tiene una idea. Tito dice: «A Pancho le gusta la pizza». ¡Claro! Sofía va al café.
   - ¿Tito tiene una idea? → Sí
4. Sofía encuentra a Pancho en el café. Pancho está en una mesa con el señor. ¡Pancho come pizza otra vez!
   - ¿Sofía encuentra a Pancho en el café o en el parque? → En el café
5. Sofía dice: «Pancho, ¿te gusta más la pizza o tu casa?». Pancho no responde. Pancho quiere más pizza.

**Después:** historia completa · ¿Pancho quiere más pizza? → Sí · tarjetas · emparejar · escuchar y repetir

**Glosas:** casa (house / home) · cocina (kitchen) · jardín (garden) · escuela (school) · niños (children) · idea (idea) · ¡claro! (of course!) · otra vez (again) · más (more) · responde (answers)

## Cuestionario final: *What just happened?*

Aprobación con 70. Cada explicación enseña un principio de TPRS.

1. **¿Qué quiere Sofía en la primera historia?** Un perro · Un gato · Una pizza · Un café → *Un perro*.
   - *You understood a whole story with just three new structures: hay, quiere, tiene. TPRS limits new language on purpose, so everything you hear stays comprehensible.*
2. **¿A Pancho le gusta el café?** Sí · No → *No*.
   - *We asked yes/no and either/or questions about the same sentences again and again. That is "circling": many meaningful repetitions without boring drills.*
3. **¿Dónde encuentra Sofía a Pancho?** En el café · En la escuela · En la cocina · En el parque → *En el café*.
   - *Words from stories 1 and 2 came back in story 3. Meeting them again in a new context is what moves them into long-term memory.*
4. **Why are the stories a little absurd (a cat with ideas, a dog that steals pizza)?** To be funny for children · Because surprising stories are easier to remember · Because Spanish speakers talk like that → *Because surprising stories are easier to remember*.
   - *Emotion and surprise make language memorable. In live classes, students even help create the story.*
5. **What did you NOT need to do in this course?** Read · Listen · Memorize grammar rules · Answer questions → *Memorize grammar rules*.
   - *You acquire a language by understanding messages, not by studying rules. Grammar comes naturally once you have heard it many times.*

## Material y cierre

- **PDF (una página):** *How TPRS works — and how to get the most from SpanishNow.* Incluye las tres etapas (estructuras, historia, lectura), qué es *circling*, por qué repetir en voz alta y el consejo de escuchar cada historia dos veces.
- **Video de bienvenida:** provisorio. Guion para la grabación definitiva: presentación de Solange, qué va a vivir el alumno (tres historias, sin gramática), y la promesa *you'll understand more than you think*.
- **Certificado:** el de la plataforma, al terminar las tres historias y aprobar el cuestionario.
- **Curso siguiente:** el curso pago que indique la variable del curso siguiente, sin cupón.

## Ilustraciones (encargo a Codex)

- **Cantidad:** una por keyframe, 15 en total.
- **Formato:** PNG o WebP horizontal 4:3 (1600×1200), sin texto dentro de la imagen.
- **Estilo:** una paleta cálida y coherente con la marca, trazo simple y expresivo, mismo estilo en las 15.
- **Personajes fijos:**
  - **Sofía:** chica de unos 12 años, pelo castaño con coleta, buzo amarillo.
  - **Tito:** gato gris atigrado, gordito y con cara de sabio.
  - **Pancho:** perro pequeño marrón, una oreja caída.
  - **El señor:** mayor, con bigote blanco y boina.
  - **Mamá:** aparece solo en el keyframe 1.2.
- **Contenido:** cada imagen muestra exactamente lo que dice su keyframe, para que la imagen haga comprensible el texto. Esa es su función en TPRS.
- **Nombres de archivo:** `h<historia>-k<keyframe>.png`, por ejemplo `h2-k4.png`.
- **Ubicación:** `backend/seeds/content-trial/images/`.
