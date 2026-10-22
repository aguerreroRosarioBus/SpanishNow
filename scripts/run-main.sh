#!/usr/bin/env bash
# Runs the latest main for local/LAN testing and keeps following origin/main.
# Meant for a dedicated clone that nobody edits or switches branches in (DEVELOPMENT.md, "Copia fija de main").
#
#   scripts/run-main.sh         update, start backend + LAN frontend (HTTPS), then follow origin/main
#   scripts/run-main.sh sync    update once (pull, deps, migrations, env check) and exit
#
# On every new commit in origin/main it fast-forwards, runs `npm ci` only when a package-lock changed,
# `db:migrate` only when there are new migrations, restarts only what needs it (nodemon and ng serve
# reload code by themselves) and warns when backend/.env.example gains a variable backend/.env lacks.
# It never touches backend/.env and never resets local changes.
#
# Env: RUN_MAIN_INTERVAL (seconds, default 60), RUN_MAIN_FRONT_PORT (default 4200),
#      RUN_MAIN_FRONTEND_URL (default https://<LAN IP>:<front port>, overrides FRONTEND_URL for the backend
#      so checkout, email and certificate links open on phones too).
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RUN="$ROOT/.run"
INTERVAL="${RUN_MAIN_INTERVAL:-60}"
FRONT_PORT="${RUN_MAIN_FRONT_PORT:-4200}"
BACK_PID=""
FRONT_PID=""
mkdir -p "$RUN"
cd "$ROOT" || exit 1

# Logs go to stderr so functions can return data on stdout (pull prints the changed paths).
log() { printf '%s %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*" | tee -a "$RUN/run-main.log" >&2; }
notify() { osascript -e "display notification \"$1\" with title \"SpanishNow main\"" >/dev/null 2>&1 || true; }
warn() { log "AVISO: $*"; notify "$*"; }
lan_ip() { ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || echo localhost; }
env_keys() { grep -E '^[A-Za-z_][A-Za-z0-9_]*=' "$1" 2>/dev/null | cut -d= -f1 | sort -u; }
back_port() { local p; p="$(grep -E '^PORT=' backend/.env 2>/dev/null | cut -d= -f2)"; echo "${p:-3000}"; }

guard() {
  case "$ROOT" in */.claude/worktrees/*) echo "run-main.sh es para la copia fija de main, no para un worktree de sesión." >&2; exit 1 ;; esac
  [ "$(git symbolic-ref --short -q HEAD)" = "main" ] || { echo "La copia tiene que estar en la rama main." >&2; exit 1; }
  [ -f backend/.env ] || { echo "Falta backend/.env (copialo de otro checkout y cambiá DB_NAME)." >&2; exit 1; }
}

# Fast-forwards to origin/main. Prints the changed paths and returns 0 only when HEAD moved.
pull() {
  git fetch -q origin main 2>>"$RUN/run-main.log" || { log "No pude consultar GitHub; reintento en el próximo ciclo."; return 1; }
  local old new; old="$(git rev-parse HEAD)"; new="$(git rev-parse origin/main)"
  [ "$old" = "$new" ] && return 1
  if [ -n "$(git status --porcelain --untracked-files=no)" ]; then warn "La copia tiene cambios locales; no actualizo main."; return 1; fi
  git merge -q --ff-only origin/main 2>>"$RUN/run-main.log" || { warn "main no avanza en fast-forward; revisá la copia."; return 1; }
  log "main ${old:0:7} -> ${new:0:7} ($(git rev-list --count "$old..$new") commits): $(git log -1 --format=%s)"
  git diff --name-only "$old" "$new"
}

install() { log "npm ci en $1"; (cd "$ROOT/$1" && npm ci --no-audit --no-fund >>"$RUN/$1.log" 2>&1) || warn "Falló npm ci en $1 (ver .run/$1.log)."; }

migrate() {
  log "Aplicando migraciones"
  (cd backend && npm run -s db:migrate >>"$RUN/run-main.log" 2>&1) || warn "Falló db:migrate (ver .run/run-main.log)."
}

# Warns about variables that appeared in .env.example since the last check and are missing from .env.
check_env() {
  local known="$RUN/env-example-keys" current missing new k
  current="$(env_keys backend/.env.example)"
  missing="$(comm -23 <(echo "$current") <(env_keys backend/.env))"
  if [ ! -f "$known" ]; then
    [ -n "$missing" ] && log "Sin definir en backend/.env (opcionales o sin configurar todavía): $(echo $missing)"
  else
    new="$(comm -13 "$known" <(echo "$current"))"
    for k in $new; do
      echo "$missing" | grep -qx "$k" && warn "Variable nueva $k en .env.example: agregala a backend/.env si la necesitás."
    done
  fi
  echo "$current" >"$known"
}

ensure_free() {
  local pid
  pid="$(lsof -nP -tiTCP:"$1" -sTCP:LISTEN 2>/dev/null | head -1)"
  [ -z "$pid" ] && return 0
  echo "El puerto $1 está ocupado por PID $pid ($(lsof -a -p "$pid" -d cwd -Fn 2>/dev/null | sed -n 's/^n//p')). Frenalo y volvé a correr." >&2
  exit 1
}

start_backend() {
  (cd backend && FRONTEND_URL="$FRONTEND_URL" exec node node_modules/.bin/nodemon src/server.js) >>"$RUN/backend.log" 2>&1 &
  BACK_PID=$!
}
start_frontend() {
  (cd frontend && exec node node_modules/@angular/cli/bin/ng.js serve --configuration lan --port "$FRONT_PORT") >>"$RUN/frontend.log" 2>&1 &
  FRONT_PID=$!
}
# Each background job has its own process group (set -m), so this also stops nodemon's and ng's children.
stop() { [ -n "$1" ] && kill -TERM -- "-$1" 2>/dev/null; wait "$1" 2>/dev/null; }
stop_all() { stop "$BACK_PID"; stop "$FRONT_PID"; BACK_PID=""; FRONT_PID=""; }

# Applies what a pull changed: deps, migrations, restarts.
apply() {
  local changed="$1" back=0 front=0
  if echo "$changed" | grep -qE '^backend/package(-lock)?\.json$'; then install backend; back=1; fi
  if echo "$changed" | grep -qE '^frontend/package(-lock)?\.json$'; then install frontend; front=1; fi
  if echo "$changed" | grep -q '^backend/migrations/'; then migrate; back=1; fi
  echo "$changed" | grep -q '^backend/.env.example$' && check_env
  [ -z "$BACK_PID" ] && return 0
  if [ "$back" = 1 ]; then log "Reiniciando backend"; stop "$BACK_PID"; start_backend; fi
  if [ "$front" = 1 ] || echo "$changed" | grep -qE '^frontend/(angular\.json|proxy\.|tsconfig)'; then
    log "Reiniciando frontend"; stop "$FRONT_PID"; start_frontend
  fi
}

guard
changed="$(pull)"
[ -d backend/node_modules ] || install backend
[ -d frontend/node_modules ] || install frontend
migrate
check_env
[ -n "$changed" ] && apply "$changed"
[ "${1:-}" = "sync" ] && exit 0

FRONTEND_URL="${RUN_MAIN_FRONTEND_URL:-https://$(lan_ip):$FRONT_PORT}"
ensure_free "$(back_port)"
ensure_free "$FRONT_PORT"
set -m
trap 'stop_all; log "Detenido"; exit 0' INT TERM HUP
start_backend
start_frontend
log "Corriendo main $(git rev-parse --short HEAD). Dispositivos: https://$(lan_ip):$FRONT_PORT  ·  Mac: https://localhost:$FRONT_PORT"
log "Logs: $RUN/{backend,frontend,run-main}.log. Revisando origin/main cada ${INTERVAL}s; Ctrl+C para frenar."

while true; do
  sleep "$INTERVAL" & wait $!
  kill -0 "$BACK_PID" 2>/dev/null || { warn "El backend se cayó; lo reinicio (ver .run/backend.log)."; start_backend; }
  kill -0 "$FRONT_PID" 2>/dev/null || { warn "El frontend se cayó; lo reinicio (ver .run/frontend.log)."; start_frontend; }
  changed="$(pull)" && apply "$changed"
done
