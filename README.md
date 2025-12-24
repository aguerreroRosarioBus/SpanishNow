# SpanishNow

Portal de cursos de español para nativos de inglés basado en el método TPRS (Teaching Proficiency through Reading and Storytelling).

## Tecnologías

### Backend
- Node.js + Express.js
- MySQL + Sequelize ORM
- JWT Authentication
- Cloudinary (almacenamiento de archivos)

### Frontend
- Angular 21
- Bootstrap 5 + ng-bootstrap
- TypeScript
- SCSS

## Estructura del Proyecto

```
SpanishNow/
├── backend/          # API REST Node.js
│   ├── src/
│   │   ├── config/       # Configuración de DB y Cloudinary
│   │   ├── models/       # Modelos Sequelize
│   │   ├── routes/       # Rutas de la API
│   │   ├── middlewares/  # Autenticación y uploads
│   │   ├── utils/        # Utilidades (init DB)
│   │   └── server.js     # Entry point
│   └── uploads/      # Archivos temporales
│
└── frontend/         # Aplicación Angular
    └── src/
        ├── app/
        │   ├── core/          # Servicios, guards, interceptores
        │   ├── features/      # Módulos funcionales
        │   └── shared/        # Componentes compartidos
        └── environments/  # Configuración de entornos
```

## Instalación

### Requisitos Previos
- Node.js 20.x o superior
- MySQL 8.x
- npm 10.x o superior

### Backend

1. Navegar a la carpeta backend:
```bash
cd backend
```

2. Copiar el archivo de ejemplo de variables de entorno:
```bash
cp .env.example .env
```

3. Editar `.env` con tus credenciales:
```env
PORT=3000
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=tu_password
DB_NAME=spanishnow
JWT_SECRET=tu_secreto_jwt
CLOUDINARY_CLOUD_NAME=tu_cloud_name
CLOUDINARY_API_KEY=tu_api_key
CLOUDINARY_API_SECRET=tu_api_secret
```

4. Crear la base de datos MySQL:
```bash
mysql -u root -p
CREATE DATABASE spanishnow;
exit;
```

5. Inicializar las tablas:
```bash
npm run db:init
```

6. Iniciar el servidor:
```bash
npm run dev
```

El backend estará disponible en `http://localhost:3000`

### Frontend

1. Navegar a la carpeta frontend:
```bash
cd frontend
```

2. Instalar dependencias (si no se hizo automáticamente):
```bash
npm install
```

3. Iniciar el servidor de desarrollo:
```bash
npm start
```

El frontend estará disponible en `http://localhost:4200`

## Características del Método TPRS

El sistema está diseñado para soportar el método TPRS:

- **Historias repetitivas**: Cada unidad contiene historias con vocabulario de alta frecuencia
- **Audio dual**: Versión lenta y normal para cada historia
- **Vocabulario clave**: 5-10 palabras objetivo por unidad
- **Preguntas de comprensión**: Preguntas simples (sí/no, elección múltiple)
- **Progreso tracking**: Seguimiento de historias completadas

## Roles de Usuario

### Profesor
- Crear y gestionar cursos
- Crear unidades temáticas
- Subir historias con audio
- Definir vocabulario clave
- Crear preguntas de comprensión

### Alumno
- Explorar catálogo de cursos
- Inscribirse en cursos
- Consumir historias (audio + texto)
- Responder preguntas
- Ver progreso personal

## API Endpoints

### Autenticación
- `POST /api/auth/register` - Registro
- `POST /api/auth/login` - Login

### Cursos
- `GET /api/courses` - Listar todos los cursos
- `GET /api/courses/:id` - Obtener curso con unidades
- `POST /api/courses` - Crear curso (profesor)
- `PUT /api/courses/:id` - Actualizar curso (profesor)
- `DELETE /api/courses/:id` - Eliminar curso (profesor)

### Unidades
- `GET /api/units/:id` - Obtener unidad con historias
- `POST /api/units` - Crear unidad (profesor)
- `PUT /api/units/:id` - Actualizar unidad (profesor)
- `DELETE /api/units/:id` - Eliminar unidad (profesor)

### Historias
- `GET /api/stories/:id` - Obtener historia con preguntas
- `POST /api/stories` - Crear historia (profesor)
- `PUT /api/stories/:id` - Actualizar historia (profesor)
- `DELETE /api/stories/:id` - Eliminar historia (profesor)

### Inscripciones
- `GET /api/enrollments/my-courses` - Cursos del alumno
- `POST /api/enrollments` - Inscribirse en curso
- `GET /api/enrollments/:id/progress` - Ver progreso
- `POST /api/enrollments/progress` - Marcar historia completada

## Comandos Útiles

### Backend
```bash
npm start          # Iniciar servidor producción
npm run dev        # Iniciar con nodemon
npm run db:init    # Inicializar base de datos
```

### Frontend
```bash
npm start          # Iniciar desarrollo
npm run build      # Build para producción
npm test           # Ejecutar tests
```

## Próximos Pasos

1. Crear componentes de Angular para auth, cursos, dashboard
2. Implementar sistema de rutas
3. Diseñar interfaces de usuario
4. Agregar validaciones en formularios
5. Implementar manejo de errores
6. Agregar tests

## Licencia

MIT
