# Búsqueda de imágenes en los cursos

## Estado revisado

Base: `30a15d6`, merge del PR #2, sobre el PR #1 (`9fa709d`). Revisión del repositorio local; no implica verificar un despliegue.

- PR #1: migraciones reproducibles, lecciones TPRS con borrador/publicación, editor por bloques, pizarra e ilustraciones, reproductor y rediseño de pantallas.
- PR #2: venta con Stripe e importación de alumnos, acceso por compra, videos/PDFs, quizzes y certificados, gestión de ventas/cupones/reembolsos/series, afiliados, comentarios, apertura de contenido por fecha y PWA.
- Las imágenes ya existían como archivos en portadas, vocabulario y fragmentos. Se conserva ese modelo de almacenamiento y publicación.

## Uso

En una portada (crear o editar curso), una nueva palabra de vocabulario o la ilustración de un fragmento, elegir **Buscar imágenes**. Escribir una búsqueda, pulsar **Buscar** y seleccionar una miniatura. El enlace debajo de cada miniatura abre su sitio de origen para revisar permisos de uso.

La imagen se descarga a través del backend y se entrega al editor como un archivo. En portadas y vocabulario queda en la vista previa hasta guardar el formulario. En fragmentos se guarda primero cualquier cambio pendiente del borrador y luego se sube la ilustración; el alumno la recibe al publicar la lección, respetando las revisiones existentes.

El proveedor recomendado es **Pixabay**, con fotos, ilustraciones y vectores (importados como imágenes PNG/JPG, sin necesitar acceso a los SVG originales). Los resultados muestran el enlace a Pixabay y el autor.

La imagen elegida se guarda en Cloudinary mediante las rutas actuales; no se enlaza la imagen original como contenido permanente del curso. Cancelar la búsqueda conserva la imagen anterior. Si una descarga o carga falla, el editor muestra un error y permite reintentar.

## Configuración del servidor

1. Iniciar sesión o registrarse en [Pixabay](https://pixabay.com/) y abrir su [documentación de API](https://pixabay.com/api/docs/). La fila `key` muestra la API key de la cuenta.
2. Configurar en el entorno del backend y reiniciar:

```dotenv
PIXABAY_API_KEY=clave_de_pixabay
CLOUDINARY_CLOUD_NAME=nombre
CLOUDINARY_API_KEY=clave
CLOUDINARY_API_SECRET=secreto
# Opcional: ruta de un volumen persistente y escribible para la caché.
# IMAGE_SEARCH_CACHE_DIR=/data/image-search-cache
```

Las claves nunca se envían al navegador. En desarrollo puede usarse `MEDIA_FAKE_UPLOADS=1` para el almacenamiento local existente; el buscador sigue necesitando una API key real.

Pixabay admite por defecto 100 consultas por minuto. Las respuestas se guardan durante **24 horas** en `backend/tmp/image-search-cache` o `IMAGE_SEARCH_CACHE_DIR`, incluida una búsqueda sin resultados. La caché sobrevive a reinicios del backend: en producción debe ubicarse en un volumen persistente. Se comparten los datos del proveedor, pero cada docente recibe tokens de selección nuevos, propios y de 15 minutos. Las consultas idénticas concurrentes se agrupan dentro de cada proceso; para réplicas se debe compartir el almacenamiento de caché y considerar coordinación distribuida.

SafeSearch está activo y las consultas usan español. Se traen 20 resultados por página. Las miniaturas se muestran temporalmente desde Pixabay; al insertar una imagen se descarga al almacenamiento de SpanishNow, sin hotlinking permanente ni descargas masivas.

Se conserva compatibilidad opcional con Google Imágenes mediante `SERPAPI_API_KEY` o, para clientes existentes de Custom Search JSON API, `GOOGLE_CSE_API_KEY` y `GOOGLE_CSE_ID`. **Pixabay tiene prioridad** si está configurado. Google cerró Custom Search a clientes nuevos y anuncia su discontinuación para el 1 de enero de 2027.

- https://pixabay.com/api/docs/
- https://serpapi.com/google-images-api
- https://developers.google.com/custom-search/v1/overview

No se requieren migraciones ni paquetes nuevos.

## API y límites

- `GET /api/images/search?q=...&page=1`: solo docentes; búsqueda de 1–100 caracteres en Pixabay (hasta 200 para los proveedores anteriores), hasta 10 páginas y SafeSearch activo. Devuelve el proveedor (`pixabay` o `google`), miniaturas, sitio de origen y tokens de selección firmados de 15 minutos, ligados al docente.
- `POST /api/images/import` con `{ "token": "..." }`: solo docentes; devuelve los bytes de la imagen seleccionada. No acepta URLs arbitrarias.
- Descargas HTTPS de PNG, JPEG, WebP y GIF, hasta 5 MB, comprobando firma del archivo. Tiempo límite de 15 segundos para la petición y hasta tres redirecciones.
- Se comprueban las direcciones DNS y se fija la dirección validada a la conexión. Se bloquean redes privadas, loopback y metadatos, también en redirecciones.
- 60 solicitudes por minuto por docente y proceso. En despliegues con varias réplicas el límite es independiente en cada réplica.
- Sin configuración, sin cuota o ante fallos remotos, se devuelve un error explícito. No se hace scraping del HTML de los buscadores.

## Validación

Pruebas independientes del backend, con proveedor, almacenamiento y modelos simulados, sin una base de datos. Incluyen caché en disco, expiración a las 24 horas, solicitudes concurrentes, selección por docente y compatibilidad de los proveedores anteriores:

```bash
cd backend
node node_modules/jest/bin/jest.js tests/imageSearch.test.js tests/courseImages.test.js --runInBand --config '{"testEnvironment":"node"}'
```

Frontend:

```bash
cd frontend
npm test -- --watch=false
npm run build -- --configuration development
```

Para validar el proveedor real, configurar sus credenciales, buscar una imagen, insertarla, guardar y verificar su visualización al alumno. Esta comprobación externa queda pendiente cuando no hay claves configuradas o conectividad.
