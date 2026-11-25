#!/bin/bash
# Restaura la base desde un backup (DEP-05). REEMPLAZA toda la base en uso.
#
#   ./restaurar.sh backups/spanishnow-20261123-0430.sql.gz
#
# Antes de tocar nada: comprueba el archivo, guarda un volcado de seguridad del estado actual
# (backups/pre-restauracion-…) y pide escribir el nombre de la base. Durante la restauración el backend está parado.
#
# Para traer un backup desde Google Drive (rclone descifra solo):
#   docker run --rm -v "$PWD/rclone:/config/rclone" -v "$PWD/backups:/data" rclone/rclone:1.68.2 \
#     copyto gdrive-crypt:spanishnow-AAAAMMDD-HHMM.sql.gz /data/spanishnow-AAAAMMDD-HHMM.sql.gz
#
# Pruebas automáticas: --confirmar <nombre-de-la-base> reemplaza la pregunta.
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

ARCHIVO=""
CONFIRMAR=""
while [ $# -gt 0 ]; do
  case "$1" in
    --confirmar) CONFIRMAR=${2:-}; shift 2 ;;
    -*) echo "Opción desconocida: $1" >&2; exit 2 ;;
    *) ARCHIVO=$1; shift ;;
  esac
done
[ -n "$ARCHIVO" ] || { echo "Uso: $0 <archivo.sql.gz> [--confirmar <base>]" >&2; exit 2; }
[ -f "$ARCHIVO" ] || { echo "No existe: $ARCHIVO" >&2; exit 1; }
ARCHIVO=$(cd "$(dirname "$ARCHIVO")" && pwd)/$(basename "$ARCHIVO")

BASE=${DB_NAME:-spanishnow}

if [ -f "$ARCHIVO.sha256" ]; then
  ( cd "$(dirname "$ARCHIVO")" && sha256_de -c "$(basename "$ARCHIVO").sha256" >/dev/null ) \
    || { echo "El sha256 no coincide: el archivo cambió desde que se hizo el backup. No se restaura." >&2; exit 1; }
else
  echo "Aviso: no hay $(basename "$ARCHIVO").sha256; solo se comprueba que el volcado esté sano."
fi
verificar_volcado "$ARCHIVO" || { echo "El volcado no es sano. No se restaura." >&2; exit 1; }

echo "Se va a REEMPLAZAR toda la base «$BASE» con $(basename "$ARCHIVO")."
if [ -n "$CONFIRMAR" ]; then
  RESPUESTA=$CONFIRMAR
else
  read -r -p "Escribí el nombre de la base para confirmar: " RESPUESTA
fi
[ "$RESPUESTA" = "$BASE" ] || { echo "No coincide. No se hizo nada." >&2; exit 1; }

SEGURIDAD="$BACKUP_DIR/pre-restauracion-$(date -u +%Y%m%d-%H%M%S).sql.gz"
registrar "Guardando el estado actual en $(basename "$SEGURIDAD")"
volcar_base "$SEGURIDAD" || { echo "No se pudo guardar el estado actual. No se restaura." >&2; exit 1; }

registrar "Parando el backend"
compose stop spanishnow-api

registrar "Restaurando"
compose exec -T spanishnow-db sh -c "MYSQL_PWD=\"\$MYSQL_ROOT_PASSWORD\" mysql -uroot -e 'DROP DATABASE IF EXISTS $BASE; CREATE DATABASE $BASE CHARACTER SET utf8mb4'"
if ! gzip -dc "$ARCHIVO" | compose exec -T spanishnow-db sh -c "MYSQL_PWD=\"\$MYSQL_ROOT_PASSWORD\" exec mysql -uroot $BASE"; then
  echo "LA RESTAURACIÓN FALLÓ. El estado anterior está en $SEGURIDAD: ./restaurar.sh $SEGURIDAD" >&2
  exit 1
fi

registrar "Arrancando el backend"
compose up -d --wait --wait-timeout 180 spanishnow-api

tablas=$(compose exec -T spanishnow-db sh -c "MYSQL_PWD=\"\$MYSQL_ROOT_PASSWORD\" mysql -uroot -N -B -e \"SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='$BASE'\"" | tr -d '\r')
registrar "Restauración terminada: $tablas tablas en «$BASE». Estado anterior guardado en $(basename "$SEGURIDAD")."
