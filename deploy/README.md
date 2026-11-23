# Despliegue de SpanishNow en el VPS

Todo lo necesario para publicar SpanishNow en un VPS compartido con backup. El plan completo (decisiones, fases y datos del servidor) es un documento privado de Andrés, porque este repositorio es público. Este paquete (W11, issue #94) es la **fase 1**: deja todo listo y probado en local; las fases 0 y 2 a 7 se hacen en el servidor, con Andrés presente.

## Cómo está armado

```
Caddy compartido (Gestión, 80/443, HTTPS automático)
   └─ platform.spanishnow.ar ──► spanishnow-web (nginx) ─┬─ /api, /health, /uploads ─► spanishnow-api ─► spanishnow-db (MySQL 8.4)
                                                         └─ el resto: la app Angular
```

- `spanishnow-db`, `spanishnow-api` y `spanishnow-web` viven en la red propia `spanishnow_default`. Solo `spanishnow-web` se une además a la red del Caddy (`deploy_default`). **La base y el backend no publican ningún puerto.**
- Los nombres llevan el prefijo `spanishnow-` a propósito: en `deploy_default` ya existen servicios llamados `app` y `db` (Gestión).
- La web y la API comparten dominio: el frontend llama a `/api`, sin CORS.
- `TRUST_PROXY=2` (Caddy + nginx) hace que `req.ip` sea la IP real del cliente y los límites por IP del chat sean por persona.
- Límites de memoria: db 768 MB, api 512 MB, web 64 MB. En reposo, medido: unos 315 MB entre los tres.

| Archivo | Para qué |
| --- | --- |
| `docker-compose.yml` | Los tres servicios, volúmenes y límites |
| `docker-compose.prueba.yml` | Publica la web en `127.0.0.1:18080` para probar sin dominio (túnel SSH o local) |
| `Dockerfile.api`, `Dockerfile.web`, `nginx.conf` | Imágenes del backend y de la web |
| `spanishnow.caddy` | Bloque para el Caddy compartido |
| `.env.example`, `.env.api.example` | Plantillas de configuración (los reales no van al repositorio) |
| `instalar.sh` | Crea `.env` y `.env.api` con secretos generados en el servidor |
| `actualizar.sh` | Publica una versión (build, volcado de seguridad, migraciones, reemplazo) |
| `backup.sh`, `verificar-backup.sh`, `restaurar.sh` | Backup diario, prueba de restauración y restauración |
| `pruebas/retencion.sh` | Prueba automática de la retención de backups |

## Requisitos del servidor
Docker con el plugin `compose`, `git`, `openssl`, `curl`, `gzip`, y que exista la red de Docker del Caddy compartido (`deploy_default`). Conviene tener swap: el build de Angular es lo que más memoria pide.

## Instalar (una vez)

```bash
git clone https://github.com/aguerreroRosarioBus/SpanishNow.git /root/spanishnow
cd /root/spanishnow/deploy
./instalar.sh
```

`instalar.sh` crea `deploy/.env` y `deploy/.env.api` (permiso 600) con contraseñas y claves generadas en el propio servidor; nunca las imprime ni pisa un archivo que ya existe. Después:

1. Completar a mano `deploy/.env.api` (Cloudinary, Hotmart, Brevo, Google, Zoom, `ADMIN_EMAILS`). Las líneas pendientes son las que terminan en `=`: `grep -n '=$' deploy/.env.api`.
2. **Guardar `GOOGLE_TOKEN_ENCRYPTION_KEY` en el gestor de contraseñas, fuera del servidor.** Si se pierde, los docentes tienen que reconectar Google y Zoom aunque se restaure la base.
3. Configurar la copia externa del backup (más abajo) y completar `BACKUP_REMOTE` en `deploy/.env`.

## Publicar

```bash
cd /root/spanishnow/deploy
./actualizar.sh              # la última rama publicada (o main)
./actualizar.sh mi-rama      # otra rama
```

El orden evita dejar el sitio peor que antes: construye las imágenes nuevas con la versión vieja todavía sirviendo → guarda un volcado de seguridad `backups/pre-<commit>-…` y lo verifica → corre las migraciones con la imagen nueva → recién ahí reemplaza el backend y la web y espera a que estén sanos. **Si el build o una migración fallan, la versión anterior sigue sirviendo.** Si la base quedó a medias, se restaura el volcado de seguridad (ver «Restaurar»).

La primera vez crea la base y aplica las 38 migraciones; no se corre ninguna semilla de prueba. El primer administrador es el correo que se haya puesto en `ADMIN_EMAILS` cuando se registre.

No hay publicación automática: a diferencia de la copia local de pruebas, el servidor **no** sigue a `main` solo.

### Volver a la versión anterior
El script guarda el commit previo en `deploy/.commit-anterior`. `./actualizar.sh <commit-o-rama>` publica esa versión. Las migraciones no se revierten solas: si una migración nueva cambió la base, restaurar antes el volcado `pre-<commit>`.

## Probar sin dominio (fase 2)
Antes de tocar DNS ni el Caddy:

```bash
cd /root/spanishnow/deploy
COMPOSE_EXTRA_FILE=docker-compose.prueba.yml ./actualizar.sh
# en la Mac:
ssh -L 18080:127.0.0.1:18080 root@<IP-del-servidor>      # y abrir http://localhost:18080
```

## Dominio y HTTPS (fase 4)
DNS **solo** (nube gris) de `platform.spanishnow.ar` hacia la IP del VPS. Después:

```bash
cp /root/spanishnow/deploy/spanishnow.caddy /root/gestion/deploy/sitios/spanishnow.caddy
cd /root/gestion
docker compose -f deploy/docker-compose.yml exec caddy caddy validate --config /etc/caddy/Caddyfile
docker compose -f deploy/docker-compose.yml exec caddy caddy reload --config /etc/caddy/Caddyfile
```

Validar **antes** de recargar: un error en este archivo afectaría a Gestión y CalcuCocos.

## Backup

| Qué | Cuándo | Dónde |
| --- | --- | --- |
| Volcado de la base verificado (`backup.sh`) | diario 04:30 UTC (01:30 de Argentina) | `deploy/backups/` + Google Drive cifrado |
| Volcado de seguridad (`actualizar.sh`, `restaurar.sh`) | antes de cada publicación o restauración | `deploy/backups/pre-…` (últimos 10) |
| Prueba de restauración (`verificar-backup.sh`) | lunes 05:00 UTC | base temporal, se borra sola |

**Retención:** 14 diarios + 8 domingos + 6 días 1, igual en el servidor y en Drive. La retención de Drive solo borra lo que decidió borrar la local: si por error se vaciara `backups/`, la copia externa queda intacta.

**Qué verifica `backup.sh` antes de dar un backup por bueno:** que mysqldump termine bien, que el gzip esté íntegro, que tenga tablas y la línea final `-- Dump completed`, y que el archivo aparezca en Drive. Si algo falla, termina con error y avisa a healthchecks.io. **Sin `BACKUP_REMOTE` falla a propósito**, porque el backup quedaría solo en este servidor.

### Cron (fase 3)

```cron
30 4 * * * /root/spanishnow/deploy/backup.sh >> /root/spanishnow/deploy/backups/backup.log 2>&1
0 5 * * 1 /root/spanishnow/deploy/verificar-backup.sh >> /root/spanishnow/deploy/backups/verificacion.log 2>&1
```

### Alerta por ausencia (healthchecks.io)
Crear dos chequeos gratuitos: **backup** (período 1 día, margen 2 h) y **verificación** (período 7 días, margen 1 día). Cargar sus URLs sin barra final en `HC_BACKUP_URL` y `HC_VERIFY_URL` de `deploy/.env`. Si un chequeo no recibe aviso a tiempo, escribe por correo.

### Configurar Google Drive con rclone (una vez, desde la Mac)
Autorizar Drive necesita un navegador, y el servidor no tiene. Se hace en la Mac y se copia la configuración:

1. `brew install rclone` y `rclone config`.
2. Remote **`gdrive`**: tipo `drive`, dejar `client_id` y `client_secret` vacíos, **scope `drive.file`** (rclone solo ve lo que él mismo sube) y autorizar en el navegador. *Si más adelante se usa un OAuth propio, publicarlo («In production»): en modo «Testing» el permiso vence a los 7 días.*
3. Remote **`gdrive-crypt`**: tipo `crypt`, `remote` = `gdrive:SpanishNow-backups`, `filename_encryption` = `off` (los nombres con la fecha quedan legibles; en Drive terminan en `.bin`), `directory_name_encryption` = `false`, y dejar que rclone **genere** las dos contraseñas.
4. **Guardar las dos contraseñas del crypt en el gestor de contraseñas.** Sin ellas los backups no se pueden leer, y el `rclone.conf` solo las guarda ofuscadas.
5. Copiar la configuración al servidor y completar el destino:
   ```bash
   scp ~/.config/rclone/rclone.conf root@<IP-del-servidor>:/root/spanishnow/deploy/rclone/rclone.conf
   ssh root@<IP-del-servidor> 'chmod 600 /root/spanishnow/deploy/rclone/rclone.conf'
   # en deploy/.env:  BACKUP_REMOTE=gdrive-crypt:
   ```
6. Probar: `./backup.sh` debe terminar con «Copia externa verificada», y el archivo debe verse en Drive.

## Restaurar

```bash
cd /root/spanishnow/deploy
./restaurar.sh backups/spanishnow-AAAAMMDD-HHMM.sql.gz
```

Comprueba el archivo (sha256 y volcado sano), **guarda el estado actual** en `backups/pre-restauracion-…`, pide escribir el nombre de la base, para el backend, reemplaza toda la base, lo vuelve a arrancar y cuenta las tablas. Si la restauración falla, el comando indica cómo volver al estado anterior.

Para traer un backup desde Drive (rclone descifra solo):

```bash
cd /root/spanishnow/deploy
docker run --rm -v "$PWD/rclone:/config/rclone" -v "$PWD/backups:/data" rclone/rclone:1.68.2 \
  copyto gdrive-crypt:spanishnow-AAAAMMDD-HHMM.sql.gz /data/spanishnow-AAAAMMDD-HHMM.sql.gz
```

**Simulacro completo:** antes de salir a producción y cada trimestre, restaurar un backup real, comprobar que la app arranca y que se puede iniciar sesión.

## Qué se probó en local (AC-DEP)
Ver la tabla de pruebas en la descripción del PR. Resumen: el stack completo levanta con Docker, la migración que falla no reemplaza la versión en marcha, el backup rechaza volcados vacíos, cortados o con sha256 alterado, la retención conserva exactamente lo previsto (con `date` de macOS y de Linux), una base rota se restaura de punta a punta, y la copia cifrada vuelve idéntica al bajarla.

## Lo que no hace este paquete
No instala nada en el servidor, no toca DNS, y no crea las cuentas de Brevo, Google Drive ni healthchecks.io. No hay binlog: la pérdida máxima aceptada es de 24 h, y Hotmart conserva el historial de ventas para reprocesar webhooks.
