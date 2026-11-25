#!/bin/bash
# Prepara el servidor para SpanishNow (DEP-01): comprueba requisitos y crea deploy/.env y deploy/.env.api con los
# secretos generados en el propio servidor. No arranca nada: eso lo hace actualizar.sh.
#
#   ./instalar.sh
#
# Es seguro repetirlo: nunca pisa un archivo que ya existe.
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

for comando in docker git openssl curl gzip; do
  command -v "$comando" >/dev/null 2>&1 || { echo "Falta '$comando' en el servidor." >&2; exit 1; }
done
docker compose version >/dev/null 2>&1 || { echo "Falta el plugin 'docker compose'." >&2; exit 1; }

EDGE=${EDGE_NETWORK:-deploy_default}
if ! docker network inspect "$EDGE" >/dev/null 2>&1; then
  echo "No existe la red de Docker '$EDGE' (la del Caddy compartido)." >&2
  echo "En el VPS es 'deploy_default'. Para una prueba local: docker network create $EDGE" >&2
  exit 1
fi

# Reemplaza cada valor __GENERAR__ por un secreto del tipo que corresponde a su variable. Los secretos nunca se
# imprimen: quedan solo en el archivo.
crear_archivo() {
  local ejemplo=$1 destino=$2
  if [ -e "$destino" ]; then
    echo "Ya existe $(basename "$destino"): no se toca."
    return
  fi
  umask 077
  local linea clave
  : > "$destino"
  while IFS= read -r linea || [ -n "$linea" ]; do
    case "$linea" in
      *=__GENERAR__)
        clave=${linea%%=*}
        case "$clave" in
          GOOGLE_TOKEN_ENCRYPTION_KEY) linea="$clave=$(openssl rand -base64 32)" ;;
          JWT_SECRET)                  linea="$clave=$(openssl rand -hex 48)" ;;
          *)                           linea="$clave=$(openssl rand -hex 24)" ;;
        esac ;;
    esac
    printf '%s\n' "$linea" >> "$destino"
  done < "$ejemplo"
  chmod 600 "$destino"
  echo "Creado $(basename "$destino") (permiso 600)."
}

crear_archivo "$DEPLOY_DIR/.env.example" "$DEPLOY_DIR/.env"
crear_archivo "$DEPLOY_DIR/.env.api.example" "$DEPLOY_DIR/.env.api"
mkdir -p "$BACKUP_DIR" "$DEPLOY_DIR/rclone"

cat <<'FIN'

Siguientes pasos
  1. Completar a mano deploy/.env.api: Cloudinary, Hotmart, Brevo (SMTP), Google, Zoom y ADMIN_EMAILS.
     Las líneas con valor vacío son las que faltan: grep -n '=$' deploy/.env.api
  2. GUARDAR en el gestor de contraseñas, fuera del servidor, la línea GOOGLE_TOKEN_ENCRYPTION_KEY de
     deploy/.env.api. Si se pierde, los docentes tienen que reconectar Google y Zoom aunque se restaure la base.
  3. Configurar la copia externa del backup (README.md, sección Backup) y completar BACKUP_REMOTE en deploy/.env.
  4. Publicar: ./actualizar.sh
FIN
