#!/bin/bash
# Prueba de restauración (DEP-05): restaura el último backup en una base temporal, cuenta tablas y filas y la borra.
# No toca la base real. Lo corre cron una vez por semana:
#
#   0 5 * * 1 /root/spanishnow/deploy/verificar-backup.sh >> /root/spanishnow/deploy/backups/verificacion.log 2>&1
#
#   ./verificar-backup.sh [archivo.sql.gz]      # sin argumento, el programado más reciente
# Avisa a healthchecks.io (HC_VERIFY_URL): si no llega bien en 8 días, te escribe.
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

fallar() {
  echo "ERROR: $*" >&2
  ping_hc "${HC_VERIFY_URL:-}" /fail
  exit 1
}

ping_hc "${HC_VERIFY_URL:-}" /start

ARCHIVO=${1:-$(ls -1 "$BACKUP_DIR"/spanishnow-[0-9]*.sql.gz 2>/dev/null | sort | tail -n 1)}
[ -n "$ARCHIVO" ] && [ -f "$ARCHIVO" ] || fallar "no hay backup para verificar"

if [ -f "$ARCHIVO.sha256" ]; then
  ( cd "$(dirname "$ARCHIVO")" && sha256_de -c "$(basename "$ARCHIVO").sha256" >/dev/null ) \
    || fallar "el sha256 no coincide: el archivo cambió desde que se hizo el backup"
fi
verificar_volcado "$ARCHIVO" || fallar "el volcado no es sano"

# El nombre solo tiene letras, números y guion bajo: no hace falta entrecomillarlo en SQL.
TEMPORAL="verif_$(date -u +%Y%m%d%H%M%S)"
limpiar() {
  compose exec -T spanishnow-db sh -c "MYSQL_PWD=\"\$MYSQL_ROOT_PASSWORD\" mysql -uroot -e 'DROP DATABASE IF EXISTS $TEMPORAL'" >/dev/null 2>&1 || true
}
trap limpiar EXIT

registrar "Restaurando $(basename "$ARCHIVO") en la base temporal $TEMPORAL"
compose exec -T spanishnow-db sh -c "MYSQL_PWD=\"\$MYSQL_ROOT_PASSWORD\" mysql -uroot -e 'CREATE DATABASE $TEMPORAL CHARACTER SET utf8mb4'" \
  || fallar "no se pudo crear la base temporal"
gzip -dc "$ARCHIVO" | compose exec -T spanishnow-db sh -c "MYSQL_PWD=\"\$MYSQL_ROOT_PASSWORD\" exec mysql -uroot $TEMPORAL" \
  || fallar "la restauración falló"

consulta() {
  compose exec -T spanishnow-db sh -c "MYSQL_PWD=\"\$MYSQL_ROOT_PASSWORD\" mysql -uroot -N -B -e \"$1\"" | tr -d '\r'
}
tablas=$(consulta "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='$TEMPORAL'")
migraciones=$(consulta "SELECT COUNT(*) FROM $TEMPORAL.SequelizeMeta" 2>/dev/null || echo 0)
tablas_vivas=$(consulta "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='\$MYSQL_DATABASE'" 2>/dev/null || echo "?")

registrar "Restaurado: $tablas tablas, $migraciones migraciones registradas (la base en uso tiene $tablas_vivas tablas)"
[ "$tablas" -ge 1 ] || fallar "la base restaurada no tiene tablas"
[ "$migraciones" -ge 1 ] || fallar "la base restaurada no tiene migraciones registradas (SequelizeMeta vacía)"

ping_hc "${HC_VERIFY_URL:-}"
registrar "Verificación correcta"
