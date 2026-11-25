#!/bin/bash
# Prueba de la retención de backups (AC-DEP-04): con 190 días de archivos falsos se conserva exactamente lo previsto
# y se borra solo lo demás. No usa Docker ni la base. Corre con date de BSD (macOS) y de GNU (Linux):
#
#   deploy/pruebas/retencion.sh
#   docker run --rm -v "$PWD/deploy:/deploy" ubuntu:24.04 bash /deploy/pruebas/retencion.sh
source "$(dirname "${BASH_SOURCE[0]}")/../lib.sh"

fallos=0
verificar() { # verificar <descripción> <esperado> <obtenido>
  if [ "$2" = "$3" ]; then echo "  ok   $1"; else echo "  FALLA $1 (esperado $2, obtenido $3)"; fallos=$((fallos + 1)); fi
}

dir=$(mktemp -d)
trap 'rm -rf "$dir"' EXIT

# Un archivo por día, 04:30 UTC, desde el 2026-05-18 hasta el 2026-11-23 (190 días), cada uno con su .sha256.
fecha_epoch=$(date -u -d 2026-11-23 +%s 2>/dev/null || date -u -j -f %Y%m%d 20261123 +%s)
for atras in $(seq 0 189); do
  dia=$(date -u -d "@$((fecha_epoch - atras * 86400))" +%Y%m%d 2>/dev/null || date -u -r $((fecha_epoch - atras * 86400)) +%Y%m%d)
  : > "$dir/spanishnow-$dia-0430.sql.gz"
  : > "$dir/spanishnow-$dia-0430.sql.gz.sha256"
done

echo "Retención programada (14 diarios + 8 domingos + 6 días 1)"
borrados=$(retener_programados "$dir" spanishnow 14 8 6)
quedan=$(ls "$dir"/spanishnow-*.sql.gz | wc -l | tr -d ' ')
verificar "quedan 25 archivos (14 + 6 domingos + 5 días 1 que no coinciden con los anteriores)" 25 "$quedan"
verificar "se borraron 165 de 190" 165 "$(printf '%s\n' "$borrados" | grep -c .)"
verificar "no quedan .sha256 huérfanos" "$quedan" "$(ls "$dir"/*.sha256 | wc -l | tr -d ' ')"

esperados="20261123 20261110 20261108 20261101 20261025 20261018 20261011 20261004 20261001 20260901 20260801 20260701 20260601"
for dia in $esperados; do
  [ -f "$dir/spanishnow-$dia-0430.sql.gz" ] && estado=si || estado=no
  verificar "se conserva $dia" si "$estado"
done
for dia in 20261109 20261107 20261031 20260930 20260731; do
  [ -f "$dir/spanishnow-$dia-0430.sql.gz" ] && estado=si || estado=no
  verificar "se borra $dia" no "$estado"
done

echo "Segunda pasada: no borra nada más (idempotente)"
verificar "sin cambios" 0 "$(retener_programados "$dir" spanishnow 14 8 6 | grep -c . || true)"

echo "Retención de volcados de seguridad (últimos 10)"
for i in $(seq 1 14); do
  : > "$dir/pre-abc$i-2026112$((i % 10))-0000.sql.gz"
  touch -t "20261101$(printf '%02d' "$i")00" "$dir/pre-abc$i-2026112$((i % 10))-0000.sql.gz"
done
retener_previos "$dir" 10 > /dev/null
verificar "quedan 10 pre-*" 10 "$(ls "$dir"/pre-*.sql.gz | wc -l | tr -d ' ')"
verificar "se conserva el más nuevo" si "$([ -f "$dir/pre-abc14-20261124-0000.sql.gz" ] && echo si || echo no)"
verificar "no toca los programados" 25 "$(ls "$dir"/spanishnow-*.sql.gz | wc -l | tr -d ' ')"

[ "$fallos" = 0 ] && echo "Todo bien." || { echo "$fallos fallo(s)."; exit 1; }
