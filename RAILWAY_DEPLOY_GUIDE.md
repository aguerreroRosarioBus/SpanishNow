# Guía Rápida - Desplegar en Railway

## 📋 Requisitos Previos

- ✅ Cuenta de GitHub
- ✅ Código preparado (ya está listo)
- ✅ Credenciales de Cloudinary (ya las tienes)
- ✅ Dump de base de datos (backend/Dump20260122.sql)

---

## Paso 1: Subir cambios a GitHub

Antes de desplegar, sube los cambios preparados:

```bash
git add .
git commit -m "Preparar proyecto para despliegue en Railway

- Agregar engines en package.json
- Agregar railway.json
- Configurar CORS para producción
- Agregar comentarios TODO para URLs"
git push origin main
```

---

## Paso 2: Crear Proyecto en Railway

1. Ve a https://railway.app
2. Click en **"Login"** → **"Login with GitHub"**
3. Autoriza Railway para acceder a tus repositorios
4. Click en **"+ New Project"**
5. Selecciona **"Deploy from GitHub repo"**
6. Busca y selecciona **"SpanishNow"**

---

## Paso 3: Configurar el Backend

### 3.1 Configurar Root Directory

1. Railway creará un servicio automáticamente
2. Haz clic en el servicio
3. Ve a **"Settings"** (⚙️)
4. Busca **"Root Directory"**
5. Escribe: `backend`
6. Railway guardará automáticamente y redesplegar

### 3.2 Esperar el primer deploy

- Railway detectará Node.js y ejecutará `npm install`
- Este primer deploy **fallará** porque no hay base de datos aún
- Es normal, continuamos

---

## Paso 4: Agregar Base de Datos MySQL

1. En la vista del proyecto, click en **"+ New"**
2. Selecciona **"Database"**
3. Selecciona **"Add MySQL"**
4. Railway creará una base de datos MySQL vacía

---

## Paso 5: Configurar Variables de Entorno

1. Click en tu servicio **backend** (no MySQL)
2. Ve a **"Variables"**
3. Agrega estas variables una por una:

```
NODE_ENV=production
```

**Para conectar con MySQL** (usar referencias):
```
DB_HOST=${{MySQL.MYSQLHOST}}
DB_USER=${{MySQL.MYSQLUSER}}
DB_PASSWORD=${{MySQL.MYSQLPASSWORD}}
DB_NAME=${{MySQL.MYSQLDATABASE}}
```

**Cloudinary**:
```
CLOUDINARY_CLOUD_NAME=dzrtcxloa
CLOUDINARY_API_KEY=393292195494439
CLOUDINARY_API_SECRET=4--Mx-13TkQAsJ8wg4NtZDwh0s4
```

**JWT Secret**:
```
JWT_SECRET=SpanishNow_2026_Secret_Key_Production_Secure_Token_123456
```

4. Railway redesplegar automáticamente

---

## Paso 6: Generar URL Pública

1. En el servicio backend, ve a **"Settings"**
2. Busca **"Networking"**
3. Click en **"Generate Domain"**
4. Railway generará una URL como: `spanishnow-backend-production-xxx.up.railway.app`
5. **Copia esta URL** (la necesitarás después)

---

## Paso 7: Importar el Dump en MySQL

Ahora vamos a cargar todos los datos desde el archivo `backend/Dump20260122.sql`

### Opción A: Usando Railway CLI (Recomendado)

1. Instala Railway CLI:
```bash
npm install -g @railway/cli
```

2. Inicia sesión:
```bash
railway login
```

3. Desde la carpeta del proyecto:
```bash
cd /Users/andresguerrero/Repos/SpanishNow/backend
railway link
```
(Selecciona tu proyecto SpanishNow)

4. Conecta con MySQL y ejecuta el dump:
```bash
railway run mysql -h $MYSQLHOST -u $MYSQLUSER -p$MYSQLPASSWORD $MYSQLDATABASE < Dump20260122.sql
```

O conecta directamente:
```bash
railway connect MySQL
```

Luego en la consola MySQL:
```sql
source Dump20260122.sql;
```

### Opción B: Usando MySQL Workbench/DBeaver

1. En Railway, click en **MySQL**
2. Ve a **"Connect"**
3. Copia las credenciales:
   - MYSQLHOST
   - MYSQLPORT (usualmente 3306)
   - MYSQLUSER
   - MYSQLPASSWORD
   - MYSQLDATABASE

4. Abre MySQL Workbench o DBeaver
5. Crea nueva conexión con esas credenciales
6. Conecta
7. Ve a File → Run SQL Script (o Import)
8. Selecciona `backend/Dump20260122.sql`
9. Ejecuta

---

## Paso 8: Verificar que todo funciona

### 8.1 Verificar Health Check

Abre en tu navegador:
```
https://[TU-URL-DE-RAILWAY]/health
```

Deberías ver:
```json
{
  "status": "OK",
  "message": "SpanishNow API is running"
}
```

### 8.2 Verificar Base de Datos

Intenta hacer login con las credenciales del dump:

**Profesor:**
- Email: `admin@gmail.com`
- Password: (la contraseña hasheada está en el dump)

**Estudiante:**
- Email: `lucas@gmail.com`
- Password: (la contraseña hasheada está en el dump)

**Nota:** Si no recuerdas las contraseñas, puedes crear nuevos usuarios desde el frontend después de desplegarlo.

---

## Paso 9: Ver Logs (si hay errores)

Si algo falla:

1. En Railway, click en tu servicio backend
2. Ve a **"Deployments"**
3. Click en el deployment activo
4. Ve a **"View Logs"**
5. Busca errores en rojo

Errores comunes:
- `ECONNREFUSED`: Variables de entorno de MySQL mal configuradas
- `ER_ACCESS_DENIED`: Credenciales de MySQL incorrectas
- `Table doesn't exist`: El dump no se importó correctamente

---

## ✅ Checklist Final

Antes de continuar con Vercel:

- [ ] Backend desplegado en Railway
- [ ] MySQL funcionando
- [ ] Variables de entorno configuradas
- [ ] Dump importado exitosamente
- [ ] URL pública generada
- [ ] `/health` responde OK
- [ ] No hay errores en los logs

---

## 🎯 Siguiente Paso

Una vez que todo esto funcione, continúa con:
- **Fase 3:** Desplegar Frontend en Vercel
- **Fase 4:** Actualizar CORS con la URL de Vercel

---

## 🆘 Ayuda

Si tienes problemas:

1. Revisa los logs en Railway
2. Verifica que las variables de entorno estén bien escritas
3. Asegúrate de que el dump se importó completamente
4. Verifica que MySQL esté running (debe tener un ícono verde)

**Usuarios de prueba en el dump:**
- `admin@gmail.com` (teacher)
- `lucas@gmail.com` (student)

Las contraseñas están hasheadas. Si necesitas, podemos crear un script para actualizar las contraseñas.
