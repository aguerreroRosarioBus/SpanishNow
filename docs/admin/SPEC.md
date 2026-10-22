# Panel de administración: usuarios, roles, permisos y cuentas de prueba

## Modelo

- **Rol** (`users.role`, sin cambios): `teacher` | `student`. Es lo que la persona *es* en la app; todo el código existente sigue filtrando por rol y por `teacherId`.
- **Permisos** (`users.permissions`, JSON nullable, array de strings): capacidades de administración **encima** del rol. Un profesor o un alumno pueden tenerlos.
- **Cuenta de prueba** (`users.isTestAccount`, boolean, default false).
- **Suspensión** (`users.suspendedAt`, DATETIME nullable). Suspendida = no puede iniciar sesión y sus tokens dejan de valer. No borra datos.

### Catálogo de permisos (`backend/src/config/permissions.js`)

| Clave | Etiqueta | Habilita |
|---|---|---|
| `users.manage` | Gestionar usuarios y permisos | Ver el listado, cambiar rol, asignar/quitar permisos, suspender/reactivar |
| `test_users.manage` | Usuarios de prueba | Crear cuentas de prueba, «Entrar como» una cuenta de prueba, borrar cuentas de prueba |

Permisos efectivos = `users.permissions` ∪ (todos, si el email está en `ADMIN_EMAILS`).

- `ADMIN_EMAILS` (env, separado por comas, case-insensitive): administradores de arranque. Siempre tienen todos los permisos; el panel los muestra como «fijos por configuración» y no deja quitárselos ni suspenderlos.
- El seed curado local (`seeds/local-test-accounts.json`) le da todos los permisos a `admin@gmail.com` (campo `permissions` por cuenta).

### Reglas de seguridad

- Las cuentas de prueba **nunca** pueden tener permisos (400 si se intenta). Por eso «Entrar como» no puede escalar privilegios.
- Nadie puede suspenderse a sí mismo ni quitarse `users.manage`.
- Pasar un profesor a alumno se rechaza (409) si es dueño de algún curso.
- «Entrar como» solo sobre cuentas con `isTestAccount = true` y no suspendidas.
- Un token emitido por «Entrar como» lleva `impersonatedBy: <adminId>` y vence en 2 h. Con ese token no se puede usar `/api/admin` (403) aunque la cuenta tuviera permisos.

## Backend

- Migración `20261107000000-add-user-admin-fields.js` (idempotente, con `down`), modelo `User` actualizado.
- `authMiddleware` / `optionalAuth`: un usuario suspendido → 401 `{ error: 'Account suspended' }` (optionalAuth lo trata como anónimo). `req.impersonatedBy` cuando el token lo trae.
- `POST /api/auth/login`: suspendido → 403 `{ error: 'This account is suspended' }`.
- Todas las respuestas de auth que devuelven `user` (register, login, reset-password, …) incluyen `permissions: string[]` (efectivos) e `isTestAccount: boolean`. Un solo helper serializa el usuario.
- `GET /api/auth/me` → `{ user }` (mismo formato, + `impersonatedBy` si corresponde). El frontend lo llama al arrancar para refrescar permisos.
- Middleware `requirePermission(key)` en `auth.middleware.js`.

### `/api/admin` (todo con `authMiddleware`)

| Método y ruta | Permiso | Descripción |
|---|---|---|
| `GET /permissions` | cualquiera de los dos | `[{ key, label, description }]` |
| `GET /users?search=&role=&kind=real\|test&status=active\|suspended&page=1&pageSize=25` | `users.manage` o `test_users.manage` (este último solo ve cuentas de prueba) | `{ users: [...], total, page, pageSize }`; cada usuario: `id, name, email, role, permissions, fixedAdmin, isTestAccount, suspendedAt, createdAt, enrollmentsCount, coursesCount` |
| `PATCH /users/:id` body `{ role?, permissions?, suspended? }` | `users.manage` | Devuelve el usuario. Reglas de arriba. Permisos desconocidos → 400 |
| `POST /test-users` body `{ role, name?, courseId?, count? (1–10) }` | `test_users.manage` | Crea cuentas de prueba. Email `prueba-<role>-<6 chars>@spanishnow.test`, contraseña aleatoria legible. Si `courseId` y rol alumno → inscripción `source: 'manual'`. No manda emails. Responde `[{ user, password }]` (la contraseña solo se ve acá) |
| `POST /users/:id/impersonate` | `test_users.manage` | `{ user, token }` para la cuenta de prueba |
| `DELETE /test-users/:id` | `test_users.manage` | Borra una cuenta de prueba y todos sus datos |
| `DELETE /test-users` | `test_users.manage` | Borra todas las cuentas de prueba y sus datos; `{ deleted: n }` |

Borrado: en una transacción, todo lo que cuelga del usuario (inscripciones y su progreso, intentos, certificados, órdenes, comentarios, miembros de clases en vivo, conexión de Google, tokens, tooltips, y si es profesor de prueba, sus cursos con su contenido, cupones, afiliados, clases en vivo). Nunca toca usuarios reales.

## Frontend

- `User` gana `permissions?: string[]`, `isTestAccount?: boolean`, `impersonatedBy?: number`.
- `AuthService`: `hasPermission(key)`, `isAdmin()` (cualquier permiso), `refreshMe()` al arrancar, `impersonate(userId)` (guarda la sesión del admin en `localStorage.adminSession` y navega al dashboard del rol), `stopImpersonating()` (restaura y vuelve a `/admin/users`), `impersonating` signal.
- `adminGuard` (cualquier permiso de admin).
- Ruta `/admin/users` → pantalla «Usuarios» (en español, trato de tú):
  - Filtros: búsqueda por nombre/email, rol, real/prueba, activo/suspendido. Tabla paginada con badges (Profesor/Alumno, Prueba, Suspendida, Admin fijo).
  - Por usuario: cambiar rol, checkboxes de permisos, suspender/reactivar (con confirmación), y en cuentas de prueba «Entrar como» y «Borrar».
  - Bloque «Crear usuarios de prueba»: rol, nombre opcional, curso opcional (solo alumno), cantidad. Al crear muestra email y contraseña con botón copiar y «Entrar como».
  - «Borrar todas las cuentas de prueba» con confirmación.
- Menú lateral: grupo «Administración» › «Usuarios» para quien tenga permisos (profesor o alumno).
- Banner fijo mientras se está «entrando como»: «Estás viendo la app como X (cuenta de prueba) · Volver a mi cuenta».
