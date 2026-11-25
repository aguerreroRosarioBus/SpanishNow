#!/bin/bash
# Backup diario de la base MySQL (DEP-04). Lo corre cron todos los días a las 04:30 UTC (01:30 de Argentina):
#
#   30 4 * * * /root/spanishnow/deploy/backup.sh >> /root/spanishnow/deploy/backups/backup.log 2>&1
#
# 1. Vuelca la base y verifica que el volcado esté sano (no vacío, no cortado).
# 2. Lo sube cifrado a Google Drive con rclone (BACKUP_REMOTE). Sin copia externa el script FALLA, salvo
#    BACKUP_SIN_COPIA_EXTERNA=1 (solo pruebas locales).
# 3. Aplica la retención: últimos 14 diarios + 8 domingos + 6 días 1, local y en Drive.
# 4. Avisa a healthchecks.io (HC_BACKUP_URL): si no llega el aviso en 26 h, te escribe.
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

DIARIOS=${BACKUP_DIARIOS:-14}
SEMANALES=${BACKUP_SEMANALES:-8}
MENSUALES=${BACKUP_MENSUALES:-6}

fallar() {
  echo "ERROR: $*" >&2
  ping_hc "${HC_BACKUP_URL:-}" /fail
  exit 1
}

ping_hc "${HC_BACKUP_URL:-}" /start
mkdir -p "$BACKUP_DIR"

NOMBRE="spanishnow-$(date -u +%Y%m%d-%H%M).sql.gz"
ARCHIVO="$BACKUP_DIR/$NOMBRE"

registrar "Volcando la base a $NOMBRE"
volcar_base "$ARCHIVO" || fallar "no se pudo volcar la base"
registrar "Volcado sano: $(du -h "$ARCHIVO" | cut -f1), $(cut -d' ' -f1 "$ARCHIVO.sha256")"

if [ -n "${BACKUP_REMOTE:-}" ]; then
  registrar "Subiendo a ${BACKUP_REMOTE}"
  rclone_run copyto "/data/$NOMBRE" "${BACKUP_REMOTE}$NOMBRE" || fallar "falló la subida de $NOMBRE"
  rclone_run copyto "/data/$NOMBRE.sha256" "${BACKUP_REMOTE}$NOMBRE.sha256" || fallar "falló la subida del sha256"
  # Comprobar que quedó del otro lado (con cifrado no se puede comparar el tamaño: se comprueba que exista).
  rclone_run lsf "${BACKUP_REMOTE}$NOMBRE" | grep -qx "$NOMBRE" || fallar "$NOMBRE no aparece en el destino externo"
  registrar "Copia externa verificada"
elif [ "${BACKUP_SIN_COPIA_EXTERNA:-0}" = 1 ]; then
  registrar "AVISO: sin copia externa (BACKUP_SIN_COPIA_EXTERNA=1); solo para pruebas"
else
  fallar "BACKUP_REMOTE no está configurado: el backup quedaría solo en este servidor"
fi

# Retención local y, para lo mismo que se borra acá, también en Drive. Nunca se borra en Drive nada que no se
# haya decidido borrar acá: si por error se vaciara este directorio, la copia externa queda intacta.
borrados=$(retener_programados "$BACKUP_DIR" spanishnow "$DIARIOS" "$SEMANALES" "$MENSUALES")
if [ -n "$borrados" ]; then
  while IFS= read -r viejo; do
    registrar "Retención: se borra $viejo"
    if [ -n "${BACKUP_REMOTE:-}" ]; then
      rclone_run deletefile "${BACKUP_REMOTE}$viejo" || echo "aviso: no se pudo borrar $viejo en el destino externo" >&2
      rclone_run deletefile "${BACKUP_REMOTE}$viejo.sha256" || true
    fi
  done <<< "$borrados"
fi

ping_hc "${HC_BACKUP_URL:-}"
registrar "Backup terminado: $NOMBRE"
