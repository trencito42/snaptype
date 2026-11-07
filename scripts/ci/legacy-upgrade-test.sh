#!/usr/bin/env bash
# Real persistent-volume legacy upgrade test. Requires Docker + compose and a populated .env.
# DESTRUCTIVE: ends with `docker compose down -v`. Never run against a stack holding real data.
set -euo pipefail
cd "$(dirname "$0")/../.."
set -a; . ./.env; set +a

mysql_q() { docker exec -i -e MYSQL_PWD="$MYSQL_ROOT_PASSWORD" snaptype-mysql mysql -h127.0.0.1 --protocol=TCP -uroot -N -s "$MYSQL_DATABASE" "$@"; }
exec > >(tee /tmp/legacy.log) 2>&1
annotate() { # $1 title, $2 text -> GitHub annotation (newlines encoded)
  printf '::error title=%s::%s
' "$1" "$(printf '%s' "$2" | sed 's/%/%25/g' | awk '{printf "%s%%0A", $0}')"
}
cleanup() {
  rc=$?
  if [ "$rc" -ne 0 ]; then
    annotate "legacy-upgrade script output" "$(tail -25 /tmp/legacy.log 2>/dev/null)"
    annotate "legacy-upgrade api logs" "$(docker compose logs --no-color --tail 40 api 2>&1)"
  fi
  docker compose down -v >/dev/null 2>&1 || true
}
trap cleanup EXIT

docker compose down -v >/dev/null 2>&1 || true
docker compose up -d mysql
# Probe over TCP: during first-time init MySQL runs a temporary socket-only server that also answers ping.
READY=0
for _ in $(seq 1 60); do
  if docker exec -e MYSQL_PWD="$MYSQL_ROOT_PASSWORD" snaptype-mysql mysqladmin ping -h127.0.0.1 --protocol=TCP -uroot --silent >/dev/null 2>&1; then READY=1; break; fi
  sleep 3
done
[ "$READY" = 1 ] || { echo "FAIL: MySQL did not become ready"; exit 1; }

# Precondition: a fresh volume must contain NO SnapType tables (i.e. no latest-schema auto-init).
TABLES=$(mysql_q -e "SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA='${MYSQL_DATABASE}'")
[ "$TABLES" = "0" ] || { echo "FAIL: database not empty before legacy fixture ($TABLES tables)"; exit 1; }

mysql_q < tests/fixtures/legacy/legacy_schema.sql
HAS_REV=$(mysql_q -e "SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA='${MYSQL_DATABASE}' AND TABLE_NAME='snippets' AND COLUMN_NAME='revision'")
[ "$HAS_REV" = "0" ] || { echo "FAIL: fixture is not legacy (snippets.revision exists)"; exit 1; }

# Start the full stack on the persistent volume (no -v). The API owns migrations.
docker compose up -d --build
curl --fail --retry 60 --retry-delay 2 --retry-all-errors http://127.0.0.1:3000/health \
  || { docker compose logs api; exit 1; }

EXPECTED=$(printf '%s' 'plaintextsecrettoken999999999999999999' | sha256sum | awk '{print $1}')
STORED=$(mysql_q -e "SELECT token_hash FROM workspace_invitations WHERE id='inv-legacy-99'")
[ "$STORED" = "$EXPECTED" ] || { echo "FAIL: token_hash '$STORED' != '$EXPECTED'"; exit 1; }

TOKEN_COL=$(mysql_q -e "SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA='${MYSQL_DATABASE}' AND TABLE_NAME='workspace_invitations' AND COLUMN_NAME='token'")
[ "$TOKEN_COL" = "0" ] || { echo "FAIL: plaintext token column still present"; exit 1; }

SNIP=$(mysql_q -e "SELECT CONCAT(plain_content,'|',version,'|',revision) FROM snippets WHERE id='s-legacy-1'")
[ "$SNIP" = "Salut, bună ziua! ăîșțâ|3|1" ] || { echo "FAIL: legacy snippet not preserved: $SNIP"; exit 1; }
[ "$(mysql_q -e "SELECT COUNT(*) FROM folders WHERE id='f-legacy-1'")" = "1" ] || { echo "FAIL: folder lost"; exit 1; }
[ "$(mysql_q -e "SELECT COUNT(*) FROM schema_migrations")" -ge 3 ] || { echo "FAIL: migrations not recorded"; exit 1; }
echo "PASS: legacy data preserved and upgraded"

# Data must survive a plain restart.
docker compose restart api
curl --fail --retry 60 --retry-delay 2 --retry-all-errors http://127.0.0.1:3000/health
[ "$(mysql_q -e "SELECT COUNT(*) FROM snippets WHERE id='s-legacy-1'")" = "1" ] || { echo "FAIL: data lost on restart"; exit 1; }

# Production must refuse to start when migration files are missing.
if docker compose run --rm --no-deps -e MIGRATIONS_DIR=/tmp/empty_migrations api node apps/api/dist/server.js; then
  echo "FAIL: API started without migrations in production"; exit 1
fi
echo "PASS: API refuses to start without migrations"
