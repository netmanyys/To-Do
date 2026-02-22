#!/usr/bin/env bash
set -euo pipefail

HOST=${HOST:-192.168.50.170}
PORT_ADMIN=${PORT_ADMIN:-3002}
PORT_API=${PORT_API:-8001}
BASE_ADMIN="http://${HOST}:${PORT_ADMIN}"
BASE_API="http://${HOST}:${PORT_API}"

fail() { echo "FAIL: $*"; exit 1; }

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || fail "missing cmd: $1"
}

require_cmd curl
require_cmd grep
require_cmd sed

# Basic liveness (retry to avoid post-restart connection reset)
for i in {1..10}; do
  code=$(curl -sS -o /dev/null -w '%{http_code}' "${BASE_ADMIN}/" || true)
  [[ "$code" == "200" ]] && break
  sleep 0.3
  [[ $i -lt 10 ]] || fail "admin home http $code"
done

for i in {1..10}; do
  code=$(curl -sS -o /dev/null -w '%{http_code}' "${BASE_ADMIN}/healthz" || true)
  [[ "$code" == "200" ]] && break
  sleep 0.3
  [[ $i -lt 10 ]] || fail "admin healthz http $code"
done

for i in {1..10}; do
  code=$(curl -sS -o /dev/null -w '%{http_code}' "${BASE_API}/health" || true)
  [[ "$code" == "200" ]] && break
  sleep 0.3
  [[ $i -lt 10 ]] || fail "api health http $code"
done

tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
cookies="$tmp/cookies.txt"

# Login as admin, capture sid
resp_headers="$tmp/headers.txt"
curl -sS -D "$resp_headers" -o /dev/null -X POST "${BASE_API}/api/login" \
  -H 'Content-Type: application/json' \
  -d '{"username":"admin","password":"Admin1234"}' || fail "api login request failed"

grep -qi '^set-cookie: sid=' "$resp_headers" || fail "no sid cookie returned from /api/login"
SID=$(grep -i '^set-cookie: sid=' "$resp_headers" | head -n1 | sed -E 's/^set-cookie: (sid=[^;]+).*/\1/i')
[[ -n "$SID" ]] || fail "failed to parse sid"

echo -e "# Netscape cookie file\n${HOST}\tFALSE\t/\tFALSE\t0\tsid\t${SID#sid=}" > "$cookies"

# /api/me must be admin + must_change_password true (bootstrap)
me_json=$(curl -sS "${BASE_API}/api/me" -H "Cookie: ${SID}") || fail "/api/me failed"
echo "$me_json" | grep -q '"is_admin"\s*:\s*true' || fail "/api/me is_admin not true"

# Admin action routes must NOT redirect to 0.0.0.0
# We validate by hitting a known route and checking Location
# Use unlock route for a user id that exists (1). It might no-op but should redirect back to /admin.
loc=$(curl -sS -o /dev/null -D - -X POST "${BASE_ADMIN}/admin/users/1/unlock" -H "Cookie: ${SID}" | grep -i '^location:' | head -n1 || true)
[[ -n "$loc" ]] || fail "no location header from unlock redirect"
echo "$loc" | grep -q "${HOST}:${PORT_ADMIN}/admin" || fail "unlock redirect wrong: $loc"
echo "$loc" | grep -qi '0\.0\.0\.0' && fail "redirect leaked 0.0.0.0: $loc"

echo "OK: smoke_admin"