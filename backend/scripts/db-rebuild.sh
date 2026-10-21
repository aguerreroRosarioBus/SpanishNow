#!/usr/bin/env bash
# Rebuilds a database from scratch: dump -> drop -> migrate -> curated seeds -> verify.
#
#   scripts/db-rebuild.sh --target local   --db spanishnow_rebuild_test [--dump-dir DIR] [--yes]
#   scripts/db-rebuild.sh --target railway [--db NAME] --yes --confirm-db NAME     (or type the name when asked)
#
# Options
#   --target local|railway   where to rebuild (required)
#   --db NAME                database name (railway: must equal RAILWAY_DB_NAME if given)
#   --dump-dir DIR           where the pre-rebuild dump goes (default ~/SpanishNow-backups, outside the repo)
#   --yes                    do not ask for the plain confirmation (railway ALSO needs the typed database name)
#   --confirm-db NAME        non-interactive "typed" confirmation: must equal the database name
#   --force-dev-db           allow a local rebuild of the development database `spanishnow`
#   --skip-dump              skip the pre-rebuild dump. ONLY for --target local AND a database whose name contains `e2e`
#   --dry-run                check the guards and print the plan; touch nothing
#
# local   : connection from DB_HOST / DB_PORT / DB_USER / DB_PASSWORD (environment, else backend/.env); the host must be
#           localhost / 127.0.0.1 / ::1. The database is dropped and created again.
# railway : connection ONLY from RAILWAY_DB_HOST / RAILWAY_DB_PORT / RAILWAY_DB_USER / RAILWAY_DB_PASSWORD / RAILWAY_DB_NAME
#           (never from backend/.env). Railway may not allow dropping the database, so every table is dropped instead.
#           SEED_TEST_PASSWORD must be set (password of the test accounts).
#
# The passwords are passed to mysql/mysqldump through MYSQL_PWD and to node through the environment; they are never printed.
set -euo pipefail

BACKEND_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TARGET=""; DB=""; DUMP_DIR="$HOME/SpanishNow-backups"; YES=0; FORCE_DEV=0; CONFIRM_DB=""; DRY_RUN=0; SKIP_DUMP=0

die() { echo "ERROR: $*" >&2; exit 1; }
log() { echo "==> $*"; }

usage() { sed -n '2,/^set -euo/p' "$0" | sed '$d' | sed 's/^# \{0,1\}//'; exit "${1:-0}"; }

while [ $# -gt 0 ]; do
  case "$1" in
    --target) TARGET="${2:-}"; shift 2 ;;
    --db) DB="${2:-}"; shift 2 ;;
    --dump-dir) DUMP_DIR="${2:-}"; shift 2 ;;
    --yes) YES=1; shift ;;
    --confirm-db) CONFIRM_DB="${2:-}"; shift 2 ;;
    --force-dev-db) FORCE_DEV=1; shift ;;
    --skip-dump) SKIP_DUMP=1; shift ;;
    --dry-run) DRY_RUN=1; shift ;;
    -h|--help) usage 0 ;;
    *) echo "Unknown option: $1" >&2; usage 1 ;;
  esac
done

dotenv_get() { # value of KEY from backend/.env (local target only); prints nothing when absent
  local file="$BACKEND_DIR/.env" line
  [ -f "$file" ] || return 0
  line="$(grep -E "^$1=" "$file" | tail -1 || true)"
  line="${line#*=}"; line="${line%$'\r'}"
  line="${line%\"}"; line="${line#\"}"; line="${line%\'}"; line="${line#\'}"
  printf '%s' "$line"
}

# ---- target resolution and guards ------------------------------------------------------------------------------
case "$TARGET" in
  local)
    HOST="${DB_HOST:-$(dotenv_get DB_HOST)}"; HOST="${HOST:-localhost}"
    PORT="${DB_PORT:-$(dotenv_get DB_PORT)}"; PORT="${PORT:-3306}"
    DBUSER="${DB_USER:-$(dotenv_get DB_USER)}"; DBUSER="${DBUSER:-root}"
    PASS="${DB_PASSWORD-$(dotenv_get DB_PASSWORD)}"
    case "$HOST" in localhost|127.0.0.1|::1) ;; *) die "--target local refuses host '$HOST': it must be localhost, 127.0.0.1 or ::1" ;; esac
    [ -n "$DB" ] || die "--db is required"
    if [ "$DB" = "spanishnow" ] && [ "$FORCE_DEV" -ne 1 ]; then
      die "'spanishnow' is the development database; pass --force-dev-db if you really want to rebuild it"
    fi
    ;;
  railway)
    for v in RAILWAY_DB_HOST RAILWAY_DB_PORT RAILWAY_DB_USER RAILWAY_DB_PASSWORD RAILWAY_DB_NAME; do
      [ -n "${!v:-}" ] || die "$v must be set in the environment (backend/.env is never used for railway)"
    done
    HOST="$RAILWAY_DB_HOST"; PORT="$RAILWAY_DB_PORT"; DBUSER="$RAILWAY_DB_USER"; PASS="$RAILWAY_DB_PASSWORD"
    case "$HOST" in localhost|127.0.0.1|::1) die "RAILWAY_DB_HOST points to this machine; use --target local" ;; esac
    if [ -n "$DB" ] && [ "$DB" != "$RAILWAY_DB_NAME" ]; then die "--db '$DB' differs from RAILWAY_DB_NAME"; fi
    DB="$RAILWAY_DB_NAME"
    [ "$YES" -eq 1 ] || die "--target railway needs --yes (and the typed database name)"
    [ -n "${SEED_TEST_PASSWORD:-}" ] || die "SEED_TEST_PASSWORD must be set for railway (password of the test accounts)"
    ;;
  *) echo "--target must be 'local' or 'railway'" >&2; usage 1 ;;
esac
if [ "$SKIP_DUMP" -eq 1 ]; then
  [ "$TARGET" = local ] || die "--skip-dump is only allowed with --target local"
  case "$DB" in *e2e*) ;; *) die "--skip-dump is only allowed for databases whose name contains 'e2e'" ;; esac
fi
[[ "$DB" =~ ^[A-Za-z0-9_]{1,64}$ ]] || die "invalid database name '$DB' (letters, digits and underscore only)"
[[ "$PORT" =~ ^[0-9]+$ ]] || die "invalid port '$PORT'"

mysql_args=(--protocol=TCP -h "$HOST" -P "$PORT" -u "$DBUSER" --default-character-set=utf8mb4)
mysql_q() { MYSQL_PWD="$PASS" mysql "${mysql_args[@]}" -N -B -e "$1"; }
run_node() { ( cd "$BACKEND_DIR" && DB_HOST="$HOST" DB_PORT="$PORT" DB_USER="$DBUSER" DB_PASSWORD="$PASS" DB_NAME="$DB" node "$@" ); }

log "Target: $TARGET  host=$HOST  port=$PORT  user=$DBUSER  database=$DB"
log "Dump directory: $DUMP_DIR"

if [ "$DRY_RUN" -eq 1 ]; then
  log "Dry run: guards passed. Plan: 1) dump  2) $([ "$TARGET" = local ] && echo 'DROP/CREATE DATABASE' || echo 'drop every table')  3) db:migrate  4) db:seed:curated  5) verify. Nothing was executed."
  exit 0
fi

# Connection check before asking anything.
mysql_q "SELECT 1" >/dev/null 2>&1 || die "cannot connect to $HOST:$PORT as $DBUSER"

# ---- confirmation ----------------------------------------------------------------------------------------------
NEEDS_TYPED=0
{ [ "$TARGET" = railway ] || [ "$DB" = "spanishnow" ]; } && NEEDS_TYPED=1
if [ "$NEEDS_TYPED" -eq 1 ]; then
  if [ -n "$CONFIRM_DB" ]; then
    [ "$CONFIRM_DB" = "$DB" ] || die "--confirm-db '$CONFIRM_DB' does not match the database '$DB'"
  elif [ -t 0 ]; then
    read -r -p "This DESTROYS all data of '$DB' on $HOST. Type the database name to continue: " typed
    [ "$typed" = "$DB" ] || die "confirmation did not match; nothing was changed"
  else
    die "typed confirmation required: pass --confirm-db $DB or run from a terminal"
  fi
elif [ "$YES" -ne 1 ]; then
  [ -t 0 ] || die "not interactive: pass --yes"
  read -r -p "Rebuild local database '$DB'? Its data will be replaced. [y/N] " answer
  case "$answer" in y|Y|yes|YES) ;; *) die "aborted; nothing was changed" ;; esac
fi

# ---- 1. dump -----------------------------------------------------------------------------------------------------
db_exists="$(mysql_q "SELECT COUNT(*) FROM information_schema.SCHEMATA WHERE SCHEMA_NAME = '$DB'")"
table_count=0
[ "$db_exists" -eq 1 ] && table_count="$(mysql_q "SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = '$DB'")"

if [ "$SKIP_DUMP" -eq 1 ]; then
  log "1/5 Dump skipped (--skip-dump, e2e database '$DB')"
elif [ "$table_count" -gt 0 ]; then
  log "1/5 Dumping $table_count table(s) of '$DB'"
  ( umask 077; mkdir -p "$DUMP_DIR" ); chmod 700 "$DUMP_DIR" 2>/dev/null || true
  DUMP_FILE="$DUMP_DIR/${TARGET}-${DB}-$(date +%Y%m%d-%H%M%S).sql.gz"
  if ! ( umask 077; set -o pipefail
         MYSQL_PWD="$PASS" mysqldump "${mysql_args[@]}" --single-transaction --routines --triggers --no-tablespaces --set-gtid-purged=OFF "$DB" \
           | gzip > "$DUMP_FILE" ); then
    rm -f "$DUMP_FILE"; die "mysqldump failed; nothing was changed"
  fi
  gunzip -t "$DUMP_FILE" || die "the dump is not a valid gzip file ($DUMP_FILE); nothing was changed"
  gunzip -c "$DUMP_FILE" | grep -q 'CREATE TABLE' || die "the dump has no CREATE TABLE ($DUMP_FILE); nothing was changed"
  [ -s "$DUMP_FILE" ] || die "the dump is empty ($DUMP_FILE)"
  log "    dump verified: $DUMP_FILE ($(du -h "$DUMP_FILE" | cut -f1))"
else
  log "1/5 Nothing to dump: database '$DB' $([ "$db_exists" -eq 1 ] && echo 'has no tables' || echo 'does not exist yet')"
fi

# ---- 2. drop / create -------------------------------------------------------------------------------------------
if [ "$TARGET" = local ]; then
  log "2/5 Dropping and creating database '$DB'"
  collation="utf8mb4_unicode_ci"
  [ -n "$(mysql_q "SHOW COLLATION LIKE 'utf8mb4_0900_ai_ci'")" ] && collation="utf8mb4_0900_ai_ci"
  mysql_q "DROP DATABASE IF EXISTS \`$DB\`; CREATE DATABASE \`$DB\` CHARACTER SET utf8mb4 COLLATE $collation" >/dev/null
else
  log "2/5 Dropping every table of '$DB' (the database itself is kept)"
  tables="$(mysql_q "SET SESSION group_concat_max_len = 1000000; SELECT GROUP_CONCAT(CONCAT('\`', TABLE_NAME, '\`') SEPARATOR ',') FROM information_schema.TABLES WHERE TABLE_SCHEMA = '$DB' AND TABLE_TYPE = 'BASE TABLE'")"
  if [ -n "$tables" ] && [ "$tables" != "NULL" ]; then
    MYSQL_PWD="$PASS" mysql "${mysql_args[@]}" "$DB" -e "SET FOREIGN_KEY_CHECKS = 0; DROP TABLE IF EXISTS $tables; SET FOREIGN_KEY_CHECKS = 1"
  fi
fi

# ---- 3-5. migrate, seed, verify ---------------------------------------------------------------------------------
log "3/5 Migrations"
run_node src/db/migrate.js up
log "4/5 Curated seeds"
run_node src/db/seed.js
log "5/5 Verification"
run_node src/db/verify.js

log "Done. Database '$DB' rebuilt.${DUMP_FILE:+ Previous state saved in $DUMP_FILE}"
