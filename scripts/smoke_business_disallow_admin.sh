#!/usr/bin/env bash
set -euo pipefail

HOST=${HOST:-192.168.50.170}
PORT_WEB=${PORT_WEB:-3001}
PORT_ADMIN=${PORT_ADMIN:-3002}
PORT_API=${PORT_API:-8001}
BASE_WEB="http://${HOST}:${PORT_WEB}"
BASE_ADMIN="http://${HOST}:${PORT_ADMIN}"
BASE_API="http://${HOST}:${PORT_API}"

fail(){ echo "FAIL: $*"; exit 1; }
require_cmd(){ command -v "$1" >/dev/null 2>&1 || fail "missing cmd: $1"; }
require_cmd curl
require_cmd grep
require_cmd sed

# health (retry)
for i in {1..10}; do
  code=$(curl -sS -o /dev/null -w '%{http_code}' "${BASE_WEB}/healthz" || true)
  [[ "$code" == "200" ]] && break
  sleep 0.3
  [[ $i -lt 10 ]] || fail "web healthz http $code"
done

# Posting admin creds to BUSINESS /login should NOT establish a session and should set login_error=admin_not_allowed
hdr=$(mktemp)
trap 'rm -f "$hdr"' EXIT
curl -sS -D "$hdr" -o /dev/null -X POST "${BASE_WEB}/login" \
  -H 'Content-Type: application/x-www-form-urlencoded' \
  --data-urlencode 'username=admin' \
  --data-urlencode 'password=Admin1234' || fail "post /login"

# Should set login_error cookie
grep -qi '^set-cookie: login_error=admin_not_allowed' "$hdr" || fail "missing login_error admin_not_allowed"

# Should clear sid
grep -qi '^set-cookie: sid=;.*Max-Age=0' "$hdr" || fail "sid not cleared"

# And still allow admin login on admin site via API (sanity)
hdr2=$(mktemp)
trap 'rm -f "$hdr" "$hdr2"' EXIT
curl -sS -D "$hdr2" -o /dev/null -X POST "${BASE_API}/api/login" -H 'Content-Type: application/json' \
  -d '{"username":"admin","password":"Admin1234"}' || fail "api admin login"
grep -qi '^set-cookie: sid=' "$hdr2" || fail "api did not set sid"

# Admin site should be reachable
code=$(curl -sS -o /dev/null -w '%{http_code}' "${BASE_ADMIN}/" || true)
[[ "$code" == "200" ]] || fail "admin site home http $code"

echo "OK: smoke_business_disallow_admin"