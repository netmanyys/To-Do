#!/usr/bin/env bash
set -euo pipefail

HOST=${HOST:-192.168.50.170}
PORT_ADMIN=${PORT_ADMIN:-3002}
PORT_API=${PORT_API:-8001}
BASE_ADMIN="http://${HOST}:${PORT_ADMIN}"
BASE_API="http://${HOST}:${PORT_API}"

fail(){ echo "FAIL: $*"; exit 1; }
require_cmd(){ command -v "$1" >/dev/null 2>&1 || fail "missing cmd: $1"; }
require_cmd curl
require_cmd grep
require_cmd sed

# health (retry)
for i in {1..10}; do
  code=$(curl -sS -o /dev/null -w '%{http_code}' "${BASE_ADMIN}/healthz" || true)
  [[ "$code" == "200" ]] && break
  sleep 0.3
  [[ $i -lt 10 ]] || fail "admin healthz http $code"
done

# hit logout route on admin site (should work even without a cookie)
out=$(curl -sS -o /dev/null -D - -X POST "${BASE_ADMIN}/logout" ) || fail "logout post"

# should clear sid
echo "$out" | grep -qi '^set-cookie: sid=;.*Max-Age=0' || fail "sid not cleared"

# should redirect back to admin home (not 0.0.0.0)
loc=$(echo "$out" | grep -i '^location:' | head -n1 | sed -E 's/^location:\s*//i')
[[ -n "$loc" ]] || fail "no location"
echo "$loc" | grep -q "${HOST}:${PORT_ADMIN}/" || fail "bad redirect: $loc"
echo "$loc" | grep -qi '0\.0\.0\.0' && fail "redirect leaked 0.0.0.0: $loc"

echo "OK: smoke_admin_logout"