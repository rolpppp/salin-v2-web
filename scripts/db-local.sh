#!/usr/bin/env bash
# Native-Postgres replacement for `supabase db reset` / `supabase test db` (decision P-7).
# Talks only to a local server via psql. It never touches the linked live project.
#
#   scripts/db-local.sh reset              drop + recreate $SALIN_DB, apply shim + migrations (+ seed)
#   scripts/db-local.sh test [files...]    run pgTAP files (default: supabase/tests/*.sql) with prove
#   scripts/db-local.sh url                print the connection URL
#
# Env: SALIN_DB (default salin_web). Give each parallel agent its own SALIN_DB.
# Server: Homebrew postgresql@17 on port 5433, matching live's major version (PG18 differs, e.g.
# RESTRICT FK errors are 23001 there). Override with PGHOST/PGPORT/PGUSER.
set -euo pipefail
export PGPORT="${PGPORT:-5433}"

cd "$(dirname "$0")/.."
DB="${SALIN_DB:-salin_web}"

case "$DB" in
  *[!a-z0-9_]*) echo "SALIN_DB must be lowercase letters, digits, underscores" >&2; exit 2 ;;
esac
host="${PGHOST:-localhost}"
case "$host" in
  localhost|127.0.0.1|::1|/*) ;;
  *) echo "Refusing non-local PGHOST=$host" >&2; exit 2 ;;
esac

psql_db() { psql -X -q -v ON_ERROR_STOP=1 -d "$DB" "$@"; }

cmd="${1:-}"; shift || true
case "$cmd" in
  reset)
    psql -X -q -v ON_ERROR_STOP=1 -d postgres \
      -c "drop database if exists $DB with (force)" \
      -c "create database $DB"
    psql -X -q -d postgres -c "alter database $DB set search_path = \"\$user\", public, extensions"
    psql_db -f supabase/local/shim.sql
    for f in supabase/migrations/*.sql; do
      echo "Applying $(basename "$f")"
      psql_db -f "$f"
    done
    # Held migrations (D-16): not on live yet, but tested locally.
    for f in supabase/held/*.sql; do
      [ -f "$f" ] || continue
      echo "Applying held $(basename "$f")"
      psql_db -f "$f"
    done
    if [ -f supabase/seed.sql ]; then
      echo "Seeding"
      psql_db -f supabase/seed.sql
    fi
    echo "Reset $DB"
    ;;
  test)
    if [ "$#" -eq 0 ]; then set -- supabase/tests/*.sql; fi
    prove --ext .sql --exec "psql -X -q -A -t -v ON_ERROR_STOP=1 -d $DB -f" "$@"
    ;;
  url)
    echo "postgresql://${PGUSER:-$USER}@localhost:$PGPORT/$DB"
    ;;
  *)
    sed -n '2,11p' "$0" >&2
    exit 2
    ;;
esac
