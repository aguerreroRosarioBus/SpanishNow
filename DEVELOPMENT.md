# SpanishNow - Documentación de Desarrollo

## Resumen del Proyecto

SpanishNow es una plataforma de aprendizaje de español basada en el método TPRS (Teaching Proficiency through Reading and Storytelling) para hablantes nativos de inglés. El sistema permite a profesores crear y gestionar cursos con historias, audio y ejercicios, mientras que los estudiantes pueden consumir el contenido y hacer seguimiento de su progreso.

---

## Stack Tecnológico

### Backend
- **Runtime**: Node.js 20.x
- **Framework**: Express.js 5.x
- **Base de datos**: MySQL 8.0
- **ORM**: Sequelize 6.x
- **Autenticación**: JWT (jsonwebtoken)
- **Encriptación**: bcryptjs
- **Almacenamiento de archivos**: Cloudinary
- **Subida de archivos**: Multer
- **Validación**: express-validator
- **CORS**: cors
- **Variables de entorno**: dotenv

### Frontend
- **Framework**: Angular 21.0.4
- **Lenguaje**: TypeScript 5.x
- **Estilos**: SCSS + Bootstrap 5
- **Componentes UI**: ng-bootstrap
- **HTTP Client**: Angular HttpClient
- **Routing**: Angular Router
- **Estado**: Signals (Angular 16+)

### Control de versiones
- **Git + GitHub**
- Repositorio: https://github.com/aguerreroRosarioBus/SpanishNow

---

## Estructura del Proyecto

```
SpanishNow/
│
├── backend/                    # API REST Node.js
│   ├── src/
│   │   ├── config/            # Configuraciones
│   │   │   ├── database.js    # Conexión Sequelize a MySQL
│   │   │   └── cloudinary.js  # Configuración Cloudinary
│   │   │
│   │   ├── models/            # Modelos Sequelize
│   │   │   ├── User.js        # Usuarios (profesores/estudiantes)
│   │   │   ├── Course.js      # Cursos
│   │   │   ├── Unit.js        # Unidades temáticas
│   │   │   ├── Story.js       # Historias TPRS
│   │   │   ├── Vocabulary.js  # Vocabulario por unidad
│   │   │   ├── Question.js    # Preguntas de comprensión
│   │   │   ├── Enrollment.js  # Inscripciones alumno-curso
│   │   │   ├── Progress.js    # Progreso de historias
│   │   │   └── index.js       # Asociaciones entre modelos
│   │   │
│   │   ├── routes/            # Rutas de la API
│   │   │   ├── auth.routes.js       # /api/auth (register, login)
│   │   │   ├── course.routes.js     # /api/courses (CRUD)
│   │   │   ├── unit.routes.js       # /api/units (CRUD)
│   │   │   ├── story.routes.js      # /api/stories (CRUD + audio)
│   │   │   └── enrollment.routes.js # /api/enrollments (inscripción, progreso)
│   │   │
│   │   ├── middlewares/       # Middlewares
│   │   │   ├── auth.middleware.js   # Autenticación JWT y roles
│   │   │   └── upload.middleware.js # Multer para archivos
│   │   │
│   │   ├── utils/             # Utilidades
│   │   │   └── initDb.js      # Script inicialización DB
│   │   │
│   │   └── server.js          # Entry point del servidor
│   │
│   ├── uploads/               # Archivos temporales (gitignored)
│   ├── .env                   # Variables de entorno (gitignored)
│   ├── .env.example           # Ejemplo de variables
│   ├── .gitignore
│   ├── package.json
│   └── package-lock.json
│
├── frontend/                  # Aplicación Angular
│   ├── src/
│   │   ├── app/
│   │   │   ├── core/                    # Funcionalidad core
│   │   │   │   ├── guards/              # Guards de rutas
│   │   │   │   │   └── auth.guard.ts    # authGuard, teacherGuard, studentGuard
│   │   │   │   │
│   │   │   │   ├── interceptors/        # Interceptores HTTP
│   │   │   │   │   └── auth.interceptor.ts # Agrega JWT a requests
│   │   │   │   │
│   │   │   │   ├── models/              # Interfaces TypeScript
│   │   │   │   │   ├── user.model.ts    # User, AuthResponse, Login, Register
│   │   │   │   │   └── course.model.ts  # Course, Unit, Story, etc.
│   │   │   │   │
│   │   │   │   └── services/            # Servicios
│   │   │   │       ├── auth.service.ts       # Autenticación
│   │   │   │       ├── course.service.ts     # Gestión de cursos
│   │   │   │       └── enrollment.service.ts # Inscripciones y progreso
│   │   │   │
│   │   │   ├── features/       # Módulos funcionales (pendiente)
│   │   │   │   ├── auth/       # Login, registro
│   │   │   │   ├── courses/    # Catálogo, detalle
│   │   │   │   └── dashboard/  # Dashboards profesor/alumno
│   │   │   │
│   │   │   ├── shared/         # Componentes compartidos (pendiente)
│   │   │   │
│   │   │   ├── app.config.ts   # Configuración de la app
│   │   │   ├── app.routes.ts   # Definición de rutas
│   │   │   ├── app.ts          # Componente principal
│   │   │   ├── app.html
│   │   │   └── app.scss
│   │   │
│   │   ├── environments/       # Configuración de entornos
│   │   │   ├── environment.ts      # Development (API: localhost:3000)
│   │   │   └── environment.prod.ts # Production
│   │   │
│   │   ├── styles.scss         # Estilos globales + Bootstrap
│   │   ├── index.html
│   │   └── main.ts
│   │
│   ├── angular.json
│   ├── package.json
│   ├── package-lock.json
│   └── tsconfig.json
│
├── .gitignore                 # Gitignore principal
└── README.md                  # Documentación del proyecto
```

---

## Base de Datos - Esquema MySQL

### Tabla: `users`
```sql
id              INT PRIMARY KEY AUTO_INCREMENT
name            VARCHAR(100) NOT NULL
email           VARCHAR(100) UNIQUE NOT NULL
password        VARCHAR(255) NOT NULL (hashed con bcrypt)
role            ENUM('teacher', 'student') DEFAULT 'student'
createdAt       TIMESTAMP
updatedAt       TIMESTAMP
```

### Tabla: `courses`
```sql
id              INT PRIMARY KEY AUTO_INCREMENT
title           VARCHAR(200) NOT NULL
description     TEXT
level           ENUM('A1', 'A2', 'B1', 'B2', 'C1', 'C2') NOT NULL
teacherId       INT NOT NULL (FK -> users.id)
imageUrl        VARCHAR(500)
createdAt       TIMESTAMP
updatedAt       TIMESTAMP
```

### Tabla: `units`
```sql
id              INT PRIMARY KEY AUTO_INCREMENT
courseId        INT NOT NULL (FK -> courses.id, CASCADE DELETE)
title           VARCHAR(200) NOT NULL
description     TEXT
order           INT DEFAULT 0
createdAt       TIMESTAMP
updatedAt       TIMESTAMP
```

### Tabla: `stories`
```sql
id              INT PRIMARY KEY AUTO_INCREMENT
unitId          INT NOT NULL (FK -> units.id, CASCADE DELETE)
title           VARCHAR(200) NOT NULL
text            TEXT NOT NULL
audioSlowUrl    VARCHAR(500) (Cloudinary URL)
audioNormalUrl  VARCHAR(500) (Cloudinary URL)
order           INT DEFAULT 0
createdAt       TIMESTAMP
updatedAt       TIMESTAMP
```

### Tabla: `vocabulary`
```sql
id              INT PRIMARY KEY AUTO_INCREMENT
unitId          INT NOT NULL (FK -> units.id, CASCADE DELETE)
word            VARCHAR(100) NOT NULL
translation     VARCHAR(100) NOT NULL
createdAt       TIMESTAMP
updatedAt       TIMESTAMP
```

### Tabla: `questions`
```sql
id              INT PRIMARY KEY AUTO_INCREMENT
storyId         INT NOT NULL (FK -> stories.id, CASCADE DELETE)
questionText    TEXT NOT NULL
answerType      ENUM('yes_no', 'choice') DEFAULT 'yes_no'
options         JSON (array de opciones para 'choice')
correctAnswer   VARCHAR(200) NOT NULL
createdAt       TIMESTAMP
updatedAt       TIMESTAMP
```

### Tabla: `enrollments`
```sql
id              INT PRIMARY KEY AUTO_INCREMENT
studentId       INT NOT NULL (FK -> users.id)
courseId        INT NOT NULL (FK -> courses.id)
createdAt       TIMESTAMP
updatedAt       TIMESTAMP
```

### Tabla: `progress`
```sql
id              INT PRIMARY KEY AUTO_INCREMENT
enrollmentId    INT NOT NULL (FK -> enrollments.id, CASCADE DELETE)
storyId         INT NOT NULL (FK -> stories.id)
completed       BOOLEAN DEFAULT false
createdAt       TIMESTAMP
updatedAt       TIMESTAMP
```

### Relaciones (Sequelize Associations)
- User **hasMany** Course (como profesor)
- Course **belongsTo** User (teacher)
- Course **hasMany** Unit (onDelete: CASCADE)
- Unit **belongsTo** Course
- Unit **hasMany** Story (onDelete: CASCADE)
- Unit **hasMany** Vocabulary (onDelete: CASCADE)
- Story **belongsTo** Unit
- Story **hasMany** Question (onDelete: CASCADE)
- Question **belongsTo** Story
- Vocabulary **belongsTo** Unit
- User **hasMany** Enrollment (como estudiante)
- Course **hasMany** Enrollment
- Enrollment **belongsTo** User (student)
- Enrollment **belongsTo** Course
- Enrollment **hasMany** Progress (onDelete: CASCADE)
- Story **hasMany** Progress
- Progress **belongsTo** Enrollment
- Progress **belongsTo** Story

---

## API Endpoints

### Autenticación (`/api/auth`)

#### POST `/api/auth/register`
Registro de usuario (profesor o estudiante)

**Request Body:**
```json
{
  "name": "Juan Pérez",
  "email": "juan@example.com",
  "password": "password123",
  "role": "teacher" // o "student"
}
```

**Response (201):**
```json
{
  "user": {
    "id": 1,
    "name": "Juan Pérez",
    "email": "juan@example.com",
    "role": "teacher"
  },
  "token": "eyJhbGciOiJIUzI1NiIs..."
}
```

#### POST `/api/auth/login`
Iniciar sesión

**Request Body:**
```json
{
  "email": "juan@example.com",
  "password": "password123"
}
```

**Response (200):**
```json
{
  "user": { /* user object */ },
  "token": "eyJhbGciOiJIUzI1NiIs..."
}
```

---

### Cursos (`/api/courses`)

#### GET `/api/courses`
Listar todos los cursos (público)

**Response (200):**
```json
[
  {
    "id": 1,
    "title": "Spanish A1 - Beginners",
    "description": "Introduction to Spanish",
    "level": "A1",
    "teacherId": 1,
    "imageUrl": "https://cloudinary.com/...",
    "teacher": {
      "id": 1,
      "name": "Juan Pérez"
    }
  }
]
```

#### GET `/api/courses/:id`
Obtener curso con sus unidades

**Response (200):**
```json
{
  "id": 1,
  "title": "Spanish A1",
  "level": "A1",
  "teacher": { /* teacher object */ },
  "units": [
    {
      "id": 1,
      "title": "Greetings",
      "order": 1
    }
  ]
}
```

#### POST `/api/courses` 🔒 (Teacher only)
Crear curso

**Headers:**
```
Authorization: Bearer {token}
```

**Request Body (multipart/form-data):**
```
title: "Spanish A1"
description: "Introduction"
level: "A1"
image: [file]
```

**Response (201):**
```json
{
  "id": 1,
  "title": "Spanish A1",
  "level": "A1",
  "teacherId": 1,
  "imageUrl": "https://cloudinary.com/..."
}
```

#### PUT `/api/courses/:id` 🔒 (Teacher only, own courses)
Actualizar curso

#### DELETE `/api/courses/:id` 🔒 (Teacher only, own courses)
Eliminar curso

---

### Unidades (`/api/units`)

#### GET `/api/units/:id`
Obtener unidad con historias y vocabulario

**Response (200):**
```json
{
  "id": 1,
  "title": "Greetings",
  "description": "Learn basic greetings",
  "stories": [
    {
      "id": 1,
      "title": "Meeting Maria",
      "text": "Juan wants to meet Maria...",
      "audioSlowUrl": "https://cloudinary.com/slow.mp3",
      "audioNormalUrl": "https://cloudinary.com/normal.mp3"
    }
  ],
  "vocabulary": [
    { "word": "hola", "translation": "hello" },
    { "word": "quiere", "translation": "wants" }
  ]
}
```

#### POST `/api/units` 🔒 (Teacher only)
Crear unidad

**Request Body:**
```json
{
  "courseId": 1,
  "title": "Greetings",
  "description": "Learn greetings",
  "order": 1
}
```

#### PUT `/api/units/:id` 🔒 (Teacher only)
Actualizar unidad

#### DELETE `/api/units/:id` 🔒 (Teacher only)
Eliminar unidad

---

### Historias (`/api/stories`)

#### GET `/api/stories/:id`
Obtener historia con preguntas

**Response (200):**
```json
{
  "id": 1,
  "title": "Meeting Maria",
  "text": "Juan wants to meet Maria...",
  "audioSlowUrl": "https://cloudinary.com/slow.mp3",
  "audioNormalUrl": "https://cloudinary.com/normal.mp3",
  "questions": [
    {
      "id": 1,
      "questionText": "Does Juan want to meet Maria?",
      "answerType": "yes_no",
      "correctAnswer": "yes"
    }
  ]
}
```

#### POST `/api/stories` 🔒 (Teacher only)
Crear historia con audio

**Request Body (multipart/form-data):**
```
unitId: 1
title: "Meeting Maria"
text: "Juan wants..."
order: 1
audioSlow: [file.mp3]
audioNormal: [file.mp3]
```

#### PUT `/api/stories/:id` 🔒 (Teacher only)
Actualizar historia

#### DELETE `/api/stories/:id` 🔒 (Teacher only)
Eliminar historia

---

### Inscripciones y Progreso (`/api/enrollments`)

#### GET `/api/enrollments/my-courses` 🔒 (Student only)
Obtener cursos inscritos del alumno

**Response (200):**
```json
[
  {
    "id": 1,
    "studentId": 2,
    "courseId": 1,
    "createdAt": "2024-12-24T...",
    "course": {
      "id": 1,
      "title": "Spanish A1",
      "level": "A1"
    }
  }
]
```

#### POST `/api/enrollments` 🔒 (Student only)
Inscribirse en un curso

**Request Body:**
```json
{
  "courseId": 1
}
```

#### GET `/api/enrollments/:enrollmentId/progress` 🔒
Ver progreso de una inscripción

**Response (200):**
```json
[
  {
    "id": 1,
    "enrollmentId": 1,
    "storyId": 1,
    "completed": true,
    "story": {
      "id": 1,
      "title": "Meeting Maria"
    }
  }
]
```

#### POST `/api/enrollments/progress` 🔒 (Student only)
Marcar historia como completada

**Request Body:**
```json
{
  "enrollmentId": 1,
  "storyId": 1
}
```

---

## Autenticación y Autorización

### JWT Token
- **Secret**: Definido en `.env` como `JWT_SECRET`
- **Expiración**: 7 días
- **Payload**:
  ```json
  {
    "id": 1,
    "role": "teacher",
    "iat": 1640000000,
    "exp": 1640604800
  }
  ```

### Middlewares
1. **`authMiddleware`**: Verifica token JWT válido
2. **`isTeacher`**: Verifica que el usuario sea profesor
3. **`isStudent`**: Verifica que el usuario sea estudiante

### Interceptor Frontend
- **`authInterceptor`**: Agrega automáticamente el header `Authorization: Bearer {token}` a todas las requests HTTP

### Guards Frontend
- **`authGuard`**: Protege rutas que requieren autenticación
- **`teacherGuard`**: Protege rutas solo para profesores
- **`studentGuard`**: Protege rutas solo para estudiantes

---

## Método TPRS Implementado

### Características TPRS en el Sistema

1. **Historias con vocabulario limitado**
   - Cada `Unit` define 5-10 palabras clave en la tabla `vocabulary`
   - Las `Story` usan vocabulario repetitivo de alta frecuencia

2. **Audio dual**
   - `audioSlowUrl`: Versión lenta para principiantes
   - `audioNormalUrl`: Versión a velocidad natural

3. **Input comprensible (i+1)**
   - Cursos organizados por niveles CEFR (A1-C2)
   - Unidades ordenadas progresivamente

4. **Preguntas de comprensión**
   - Preguntas simples sí/no (`yes_no`)
   - Preguntas de opción múltiple (`choice`)
   - Enfoque en comprensión, no producción

5. **Tracking de progreso**
   - Tabla `progress` registra historias completadas
   - Los alumnos pueden volver a escuchar historias múltiples veces

---

## Configuración de Variables de Entorno

### Backend (`.env`)
```env
# Server
PORT=3000

# Database
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=Teclados98
DB_NAME=spanishnow

# JWT
JWT_SECRET=spanishnow_secret_key_2024

# Cloudinary (para archivos multimedia)
CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_api_key
CLOUDINARY_API_SECRET=your_api_secret
```

### Frontend (environment.ts)
```typescript
export const environment = {
  production: false,
  apiUrl: 'http://localhost:3000/api'
};
```

---

## Instalación y Setup

### Requisitos Previos
- Node.js 20.x o superior
- MySQL 8.0
- npm 10.x

### Pasos de Instalación

#### 1. Clonar repositorio
```bash
git clone https://github.com/aguerreroRosarioBus/SpanishNow.git
cd SpanishNow
```

#### 2. Backend Setup
```bash
cd backend
npm install
cp .env.example .env
# Editar .env con tus credenciales
```

#### 3. Crear base de datos MySQL
```bash
mysql -u root -p
CREATE DATABASE spanishnow;
EXIT;
```

#### 4. Inicializar tablas
```bash
npm run db:init
```

#### 5. Iniciar backend
```bash
npm run dev
# Servidor en http://localhost:3000
```

#### 6. Frontend Setup
```bash
cd ../frontend
npm install
npm start
# Aplicación en http://localhost:4200
```

---

## Scripts Disponibles

### Backend
```bash
npm start          # Iniciar servidor producción
npm run dev        # Iniciar con nodemon (hot reload)
npm run db:init    # Inicializar/actualizar tablas DB
```

### Frontend
```bash
npm start          # Iniciar desarrollo (ng serve)
npm run build      # Build para producción
npm test           # Ejecutar tests
```

---

## Flujo de Trabajo Git

### Branching Strategy
- `main`: Branch principal (producción)
- Feature branches: `feature/nombre-feature`
- Bug fixes: `fix/nombre-fix`

### Commits
Formato de commit messages:
```
tipo: descripción breve

Descripción detallada opcional

🤖 Generated with Claude Code
Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>
```

Tipos: `feat`, `fix`, `docs`, `refactor`, `test`, `chore`

---

## Cloudinary - Configuración de Archivos

### Configuración
1. Crear cuenta en https://cloudinary.com
2. Obtener credenciales del dashboard
3. Agregar a `.env`:
   ```
   CLOUDINARY_CLOUD_NAME=tu_cloud_name
   CLOUDINARY_API_KEY=tu_api_key
   CLOUDINARY_API_SECRET=tu_api_secret
   ```

### Estructura de carpetas en Cloudinary
```
spanishnow/
├── courses/        # Imágenes de cursos
└── audio/          # Archivos de audio de historias
```

### Tipos de archivos soportados
- **Audio**: mp3, wav, ogg, m4a (max 50MB)
- **Imágenes**: jpg, jpeg, png, gif
- **Documentos**: pdf

---

## Seguridad Implementada

### Backend
1. **Passwords**: Hasheados con bcrypt (salt rounds: 10)
2. **JWT**: Token firmado con secret key
3. **CORS**: Configurado para permitir frontend
4. **Validación**: express-validator en rutas
5. **Authorization**: Middlewares de rol verifican permisos
6. **SQL Injection**: Protegido por Sequelize ORM

### Frontend
1. **XSS Protection**: Angular sanitiza automáticamente
2. **Token Storage**: localStorage (considerar httpOnly cookies en producción)
3. **Guards**: Previenen acceso no autorizado a rutas
4. **Interceptor**: Maneja errores 401/403 globalmente

### Mejoras de Seguridad Recomendadas (Producción)
- [ ] Implementar rate limiting
- [ ] HTTPS obligatorio
- [ ] Refresh tokens
- [ ] httpOnly cookies en lugar de localStorage
- [ ] Content Security Policy (CSP)
- [ ] Helmet.js para headers de seguridad

---

## Estado Actual del Proyecto

### ✅ Completado

#### Backend
- [x] Estructura de proyecto inicializada
- [x] Modelos Sequelize creados con asociaciones
- [x] API REST completa (auth, courses, units, stories, enrollments)
- [x] Autenticación JWT implementada
- [x] Middlewares de autorización por rol
- [x] Integración con Cloudinary
- [x] Base de datos MySQL configurada
- [x] Script de inicialización de DB

#### Frontend
- [x] Proyecto Angular inicializado
- [x] Bootstrap integrado
- [x] Estructura de carpetas (core, features, shared)
- [x] Servicios (AuthService, CourseService, EnrollmentService)
- [x] Models/Interfaces TypeScript
- [x] Guards (auth, teacher, student)
- [x] Interceptor HTTP (auth)
- [x] Environments configurados

#### DevOps
- [x] Git inicializado
- [x] .gitignore configurado
- [x] Repositorio en GitHub
- [x] README.md documentado

### 🚧 Pendiente

#### Frontend UI
- [ ] Componentes de autenticación (login, registro)
- [ ] Navbar y layout principal
- [ ] Dashboard de profesor
  - [ ] Lista de mis cursos
  - [ ] Crear/editar curso
  - [ ] Gestionar unidades
  - [ ] Subir historias con audio
  - [ ] Ver estadísticas de alumnos
- [ ] Dashboard de alumno
  - [ ] Mis cursos inscritos
  - [ ] Catálogo de cursos
  - [ ] Ver progreso
- [ ] Componente Story Player
  - [ ] Reproductor de audio con controles
  - [ ] Texto sincronizado
  - [ ] Preguntas de comprensión
  - [ ] Marcar como completado
- [ ] Página de detalle de curso
- [ ] Página de detalle de unidad
- [ ] Formularios reactivos

#### Backend Enhancements
- [ ] Endpoints de vocabulario (CRUD)
- [ ] Endpoints de preguntas (CRUD)
- [ ] Endpoint de estadísticas para profesores
- [ ] Paginación en listados
- [ ] Búsqueda y filtros
- [ ] Soft deletes
- [ ] Logging estructurado

#### Features Adicionales
- [ ] Sistema de comentarios en historias
- [ ] Notificaciones
- [ ] Certificados al completar curso
- [ ] Sistema de niveles/badges
- [ ] Exportar progreso a PDF
- [ ] Audio player con speed control (0.75x, 1x, 1.25x)
- [ ] Modo offline (PWA)

#### Testing
- [ ] Tests unitarios backend (Jest)
- [ ] Tests unitarios frontend (Jasmine/Karma)
- [ ] Tests e2e (Cypress/Playwright)
- [ ] Tests de integración API

#### Deployment
- [ ] Configuración Docker
- [ ] CI/CD pipeline (GitHub Actions)
- [ ] Deploy backend (Railway, Render, AWS)
- [ ] Deploy frontend (Vercel, Netlify)
- [ ] Configuración de dominio

---

## Próximos Pasos Sugeridos

### Prioridad Alta (MVP)
1. **Crear componentes de autenticación**
   - Login form
   - Register form
   - Protected routes

2. **Dashboard de profesor básico**
   - Listar cursos
   - Crear curso simple
   - Ver unidades de un curso

3. **Dashboard de alumno básico**
   - Catálogo de cursos
   - Inscribirse a curso
   - Ver mis cursos

4. **Story Player básico**
   - Mostrar texto
   - Reproducir audio
   - Botón "Marcar completado"

### Prioridad Media
5. Gestión completa de unidades (profesor)
6. Subir historias con audio (profesor)
7. Sistema de progreso visual (alumno)
8. Preguntas de comprensión interactivas

### Prioridad Baja
9. Estadísticas avanzadas
10. Sistema de badges
11. Certificados
12. PWA offline mode

---

## Tecnologías y Librerías - Versiones

### Backend
```json
{
  "express": "^5.2.1",
  "sequelize": "^6.37.7",
  "mysql2": "^3.16.0",
  "bcryptjs": "^3.0.3",
  "jsonwebtoken": "^9.0.3",
  "dotenv": "^17.2.3",
  "cors": "^2.8.5",
  "multer": "^2.0.2",
  "cloudinary": "^2.8.0",
  "express-validator": "^7.3.1",
  "nodemon": "^3.1.11" (dev)
}
```

### Frontend
```json
{
  "@angular/core": "^21.0.4",
  "@angular/common": "^21.0.4",
  "@angular/router": "^21.0.4",
  "@ng-bootstrap/ng-bootstrap": "^18.0.0",
  "bootstrap": "^5.3.3",
  "typescript": "~5.7.0",
  "rxjs": "~7.8.0"
}
```

---

## Contacto y Recursos

### Repositorio
- **GitHub**: https://github.com/aguerreroRosarioBus/SpanishNow

### Recursos TPRS
- [TPRS Books](https://www.tprsbooks.com/)
- [Fluency Matters](https://fluencymatters.com/)
- [Stephen Krashen - Input Hypothesis](https://www.sdkrashen.com/)

### Recursos Técnicos
- [Express.js Docs](https://expressjs.com/)
- [Sequelize Docs](https://sequelize.org/)
- [Angular Docs](https://angular.dev/)
- [Bootstrap Docs](https://getbootstrap.com/)
- [Cloudinary Docs](https://cloudinary.com/documentation)

---

## Notas de Desarrollo

### Decisiones Técnicas

1. **¿Por qué Sequelize?**
   - ORM maduro para Node.js
   - Soporte excelente para MySQL
   - Migraciones y asociaciones bien documentadas

2. **¿Por qué Angular Standalone Components?**
   - Nuevo estándar de Angular (16+)
   - Menos boilerplate que NgModules
   - Mejor tree-shaking

3. **¿Por qué Cloudinary?**
   - Plan gratuito generoso
   - CDN incluido
   - Optimización automática de medios
   - Fácil integración

4. **¿Por qué Bootstrap?**
   - Rápido de implementar
   - Componentes responsivos out-of-the-box
   - ng-bootstrap proporciona componentes nativos Angular

### Convenciones de Código

#### Backend
- Nombres de archivos: `camelCase.js`
- Modelos: PascalCase (ej: `User.js`)
- Rutas: kebab-case (ej: `auth.routes.js`)
- Variables: camelCase
- Constantes: UPPER_CASE

#### Frontend
- Nombres de archivos: `kebab-case.ts`
- Componentes: PascalCase (ej: `LoginComponent`)
- Servicios: PascalCase + Service (ej: `AuthService`)
- Interfaces: PascalCase (ej: `User`)
- Variables: camelCase

---

## Changelog

### 2024-12-27 - Estado Actual
- ✅ Componentes de autenticación completados (login, register) con Bootstrap via CDN
- ✅ Navbar y layout principal implementados
- ✅ Dashboard de profesor completado
  - ✅ Lista de cursos del profesor
  - ✅ Crear curso con imagen (Cloudinary opcional)
  - ✅ Formularios reactivos con validación
- ✅ Dashboard de alumno completado
  - ✅ Catálogo de cursos con inscripción
  - ✅ Vista "Mis Cursos" con cursos inscritos
  - ✅ Sistema de tabs (Explorar/Mis Cursos)
- ✅ Story Player básico completado
  - ✅ Reproducción de audio (lento/normal)
  - ✅ Controles reproducir/pausar
  - ✅ Vista de texto de historia
  - ✅ Navegación por unidades y historias
- ✅ Servicios creados: UnitService, StoryService (en progreso)
- 🚧 **En progreso**: Página de Gestión de Curso para profesores
  - Permitir crear unidades dentro de un curso
  - Permitir crear historias dentro de una unidad
  - Gestión completa del contenido desde UI

### 2024-12-24 - Versión Inicial
- ✅ Proyecto inicializado (backend + frontend)
- ✅ Base de datos MySQL configurada
- ✅ Modelos y API REST implementados
- ✅ Autenticación JWT
- ✅ Estructura frontend con servicios y guards
- ✅ Repositorio Git creado y subido a GitHub
- ✅ Documentación completa (README.md + DEVELOPMENT.md)

---

**Última actualización**: 27 de diciembre de 2024
**Versión**: 0.2.0 (MVP en desarrollo avanzado)
**Estado**: 🚧 En construcción activa - Trabajando en gestión de contenido para profesores
