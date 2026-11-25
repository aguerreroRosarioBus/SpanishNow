#!/bin/bash
# Publica una rama en el servidor (DEP-06).
#
#   ./actualizar.sh                  # vuelve a publicar la última rama (o main)
#   ./actualizar.sh mi-rama          # publica esa rama
#   ./actualizar.sh --sin-git        # construye lo que ya está en disco (primera vez o pruebas locales)
#
# Orden pensado para que un fallo nunca deje al sitio peor que antes:
#   1. Construye las imágenes nuevas con la versión vieja todavía sirviendo.
#   2. Guarda un volcado de seguridad (backups/pre-<commit>-…) y lo verifica.
#   3. Corre las migraciones con la imagen nueva. Si fallan, la versión vieja sigue arriba.
#   4. Reemplaza el backend y la web y espera a que estén sanos.
#
# El cuerpo va dentro de una función: el `git checkout` reemplaza este mismo archivo y bash no debe leer la mitad
# del script nuevo.
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

principal() {
  local usar_git=1 rama=""
  for argumento in "$@"; do
    case "$argumento" in
      --sin-git) usar_git=0 ;;
      -*) echo "Opción desconocida: $argumento" >&2; return 2 ;;
      *) rama=$argumento ;;
    esac
  done

  local repo ultima="$DEPLOY_DIR/.rama-publicada" anterior="$DEPLOY_DIR/.commit-anterior"
  repo=$(cd "$DEPLOY_DIR/.." && pwd)
  [ -f "$DEPLOY_DIR/.env" ] && [ -f "$DEPLOY_DIR/.env.api" ] || { echo "Falta deploy/.env o deploy/.env.api: corré ./instalar.sh" >&2; return 1; }

  git -C "$repo" rev-parse HEAD > "$anterior" 2>/dev/null || true

  if [ "$usar_git" = 1 ]; then
    rama=${rama:-$(cat "$ultima" 2>/dev/null || echo main)}
    registrar "Bajando origin/$rama"
    git -C "$repo" fetch --prune origin
    git -C "$repo" cat-file -e "origin/$rama:deploy/docker-compose.yml" 2>/dev/null \
      || { echo "La rama $rama no tiene deploy/: no se publica." >&2; return 1; }
    git -C "$repo" checkout --force -B publicada "origin/$rama"
    echo "$rama" > "$ultima"
  fi
  local commit
  commit=$(git -C "$repo" rev-parse --short HEAD 2>/dev/null || echo sin-git)

  registrar "Construyendo las imágenes (tarda unos minutos; el sitio sigue con la versión anterior)"
  compose build

  registrar "Levantando la base"
  compose up -d --wait --wait-timeout 180 spanishnow-db

  if compose ps --status running --services | grep -qx spanishnow-api; then
    registrar "Volcado de seguridad antes de migrar"
    volcar_base "$BACKUP_DIR/pre-$commit-$(date -u +%Y%m%d-%H%M%S).sql.gz" \
      || { echo "No se pudo guardar el volcado de seguridad: no se publica." >&2; return 1; }
  else
    registrar "Primera publicación: no hay datos que respaldar todavía"
  fi

  registrar "Migraciones"
  if ! compose run --rm --no-deps spanishnow-api npm run db:migrate; then
    echo "" >&2
    echo "LA MIGRACIÓN FALLÓ. La versión anterior sigue sirviendo." >&2
    echo "Si la base quedó a medias: ./restaurar.sh backups/pre-$commit-… (el volcado de seguridad de recién)." >&2
    return 1
  fi

  registrar "Reemplazando el backend y la web"
  if ! compose up -d --wait --wait-timeout 180; then
    echo "" >&2
    echo "LA VERSIÓN NUEVA NO QUEDÓ SANA. Últimos registros del backend:" >&2
    compose logs --tail 40 spanishnow-api >&2 || true
    echo "Para volver a la versión anterior: ./actualizar.sh <rama-o-commit-anterior> (commit previo: $(cat "$anterior" 2>/dev/null))" >&2
    return 1
  fi

  # Limpieza acotada: nada de `system prune` ni `image prune -a`, el servidor es compartido y borrarían imágenes
  # o volúmenes de otros proyectos.
  docker image prune -f > /dev/null
  docker builder prune -f --filter "until=48h" > /dev/null
  retener_previos "$BACKUP_DIR" 10 > /dev/null

  registrar "Disco: $(df -h / | awk 'NR==2 {print $3" usados de "$2}')"
  registrar "Publicado: ${rama:-local} ($commit)"
  compose ps
}

principal "$@"
exit $?
