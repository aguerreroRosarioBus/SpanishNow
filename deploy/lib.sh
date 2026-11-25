#!/bin/bash
# Funciones comunes de los scripts de deploy/ (se carga con `source`, no se ejecuta). Compatible con bash 3.2 (macOS)
# y bash 5 (Ubuntu del VPS).
set -euo pipefail

DEPLOY_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKUP_DIR="$DEPLOY_DIR/backups"
cd "$DEPLOY_DIR"

# Variables de deploy/.env (las mismas que lee docker compose). Igual que en compose, lo que ya está en el entorno
# del que llama gana sobre el archivo: `BACKUP_SIN_COPIA_EXTERNA=0 ./backup.sh` hace lo que dice.
if [ -f "$DEPLOY_DIR/.env" ]; then
  while IFS= read -r linea || [ -n "$linea" ]; do
    case "$linea" in ''|'#'*) continue ;; esac
    clave=${linea%%=*}
    valor=${linea#*=}
    case "$clave" in *[!A-Za-z0-9_]*|'') continue ;; esac
    if [ -z "${!clave+x}" ]; then export "$clave=$valor"; fi
  done < "$DEPLOY_DIR/.env"
  unset linea clave valor
fi

# COMPOSE_EXTRA_FILE suma un segundo archivo (por ejemplo docker-compose.prueba.yml para probar por túnel SSH).
compose() {
  if [ -n "${COMPOSE_EXTRA_FILE:-}" ]; then
    docker compose -f "$DEPLOY_DIR/docker-compose.yml" -f "$DEPLOY_DIR/$COMPOSE_EXTRA_FILE" "$@"
  else
    docker compose -f "$DEPLOY_DIR/docker-compose.yml" "$@"
  fi
}

registrar() { echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] $*"; }

sha256_de() {
  if command -v sha256sum >/dev/null 2>&1; then sha256sum "$@"; else shasum -a 256 "$@"; fi
}

# Avisa a healthchecks.io: ping_hc <url-base> [/start|/fail]. Un fallo del aviso nunca rompe el script.
ping_hc() {
  local base=${1:-} sufijo=${2:-}
  [ -n "$base" ] || return 0
  curl -fsS -m 10 --retry 3 "$base$sufijo" >/dev/null 2>&1 || true
}

# Día de la semana (0 = domingo) de una fecha AAAAMMDD, con date de GNU (Linux) o de BSD (macOS).
dia_semana() {
  date -u -d "$1" +%w 2>/dev/null || date -u -j -f %Y%m%d "$1" +%w
}

# Revisa un volcado: gzip íntegro, al menos una tabla y la línea final de mysqldump. Devuelve 0 si está sano.
verificar_volcado() {
  local archivo=$1
  gzip -t "$archivo" 2>/dev/null || { echo "gzip dañado: $archivo" >&2; return 1; }
  local resumen tablas ultima
  resumen=$(gzip -dc "$archivo" | awk '/^CREATE TABLE/{t++} NF{ultima=$0} END{print (t+0) "\t" ultima}')
  tablas=${resumen%%$'\t'*}
  ultima=${resumen#*$'\t'}
  if [ "$tablas" -lt 1 ]; then echo "el volcado no tiene tablas: $archivo" >&2; return 1; fi
  case "$ultima" in
    "-- Dump completed"*) ;;
    *) echo "el volcado está cortado (sin la línea final de mysqldump): $archivo" >&2; return 1 ;;
  esac
}

# Vuelca la base completa a <destino>.sql.gz. Va a un temporal y recién se renombra si el volcado es sano: un
# archivo cortado a la mitad nunca parece un backup bueno. Deja también <destino>.sha256.
volcar_base() {
  local destino=$1 temporal="$1.tmp"
  mkdir -p "$(dirname "$destino")"
  # La contraseña de root se lee dentro del contenedor: no pasa por la línea de comandos del host.
  if ! compose exec -T spanishnow-db sh -c 'MYSQL_PWD="$MYSQL_ROOT_PASSWORD" exec mysqldump -uroot --single-transaction --routines --triggers --events --hex-blob --default-character-set=utf8mb4 "$MYSQL_DATABASE"' \
      | gzip -9 > "$temporal"; then
    rm -f "$temporal"
    echo "mysqldump falló" >&2
    return 1
  fi
  if ! verificar_volcado "$temporal"; then rm -f "$temporal"; return 1; fi
  mv "$temporal" "$destino"
  ( cd "$(dirname "$destino")" && sha256_de "$(basename "$destino")" > "$(basename "$destino").sha256" )
}

# Retención de los backups programados <prefijo>-AAAAMMDD-HHMM.sql.gz: se conservan los últimos <diarios>, los
# últimos <semanales> de domingo y los últimos <mensuales> de día 1. Borra el resto (y su .sha256) e imprime el
# nombre de cada archivo borrado, para que el llamador borre también la copia externa.
retener_programados() {
  local dir=$1 prefijo=$2 diarios=$3 semanales=$4 mensuales=$5
  local n=0 s=0 m=0 ultimo_s="" ultimo_m="" f base marca dia conservar
  while IFS= read -r f; do
    [ -n "$f" ] || continue
    base=$(basename "$f")
    marca=${base#"$prefijo"-}
    dia=${marca:0:8}
    conservar=0
    if [ "$n" -lt "$diarios" ]; then conservar=1; n=$((n + 1)); fi
    if [ "$(dia_semana "$dia")" = 0 ] && [ "$s" -lt "$semanales" ] && [ "$dia" != "$ultimo_s" ]; then
      conservar=1; s=$((s + 1)); ultimo_s=$dia
    fi
    if [ "${dia:6:2}" = 01 ] && [ "$m" -lt "$mensuales" ] && [ "$dia" != "$ultimo_m" ]; then
      conservar=1; m=$((m + 1)); ultimo_m=$dia
    fi
    if [ "$conservar" = 0 ]; then
      rm -f "$f" "$f.sha256"
      echo "$base"
    fi
  done < <(ls -1 "$dir"/"$prefijo"-[0-9]*.sql.gz 2>/dev/null | sort -r)
}

# Conserva los últimos <n> volcados «de seguridad» (pre-<commit>-… y pre-restauracion-…).
retener_previos() {
  local dir=$1 cuantos=$2 f
  while IFS= read -r f; do
    [ -n "$f" ] || continue
    rm -f "$f" "$f.sha256"
    basename "$f"
  done < <(ls -1t "$dir"/pre-*.sql.gz 2>/dev/null | tail -n +$((cuantos + 1)))
}

# rclone se corre en un contenedor (el VPS no lo tiene instalado). La configuración vive en deploy/rclone/.
rclone_run() {
  docker run --rm \
    -v "$DEPLOY_DIR/rclone:/config/rclone" \
    -v "$BACKUP_DIR:/data" \
    rclone/rclone:1.68.2 "$@"
}
