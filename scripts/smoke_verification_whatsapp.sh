#!/usr/bin/env bash
set -euo pipefail

HOST=${HOST:-192.168.50.170}
PORT_WEB=${PORT_WEB:-3001}
PORT_ADMIN=${PORT_ADMIN:-3002}
PORT_API=${PORT_API:-8001}
BASE_WEB="http://${HOST}:${PORT_WEB}"
BASE_ADMIN="http://${HOST}:${PORT_ADMIN}"
BASE_API="http://${HOST}:${PORT_API}"

fail() { echo "FAIL: $*"; exit 1; }
require_cmd(){ command -v "$1" >/dev/null 2>&1 || fail "missing cmd: $1"; }
require_cmd curl
require_cmd sed
require_cmd grep

# 0) health (retry to avoid post-restart connection reset)
for i in {1..10}; do
  if curl -sS -o /dev/null "${BASE_API}/health"; then
    break
  fi
  sleep 0.3
  [[ $i -lt 10 ]] || fail "api down"
done

# 1) Create a signup request
u="verify_$(date +%s)"
email="${u}@example.com"
pass="Abcdef12"

resp=$(curl -sS -X POST "${BASE_API}/api/signup" -H 'Content-Type: application/json' \
  -d "{\"username\":\"$u\",\"email\":\"$email\",\"password\":\"$pass\"}") || fail "signup failed"
echo "$resp" | grep -q '"status"\s*:\s*"pending"' || fail "signup not pending: $resp"

# 2) Admin login
hdr=$(mktemp)
trap 'rm -f "$hdr"' EXIT
curl -sS -D "$hdr" -o /dev/null -X POST "${BASE_API}/api/login" -H 'Content-Type: application/json' \
  -d '{"username":"admin","password":"Admin1234"}' || fail "admin login failed"
SID_ADMIN=$(grep -i '^set-cookie: sid=' "$hdr" | head -n1 | sed -E 's/^set-cookie: (sid=[^;]+).*/\1/i')
[[ -n "$SID_ADMIN" ]] || fail "admin sid missing"

# 3) Find pending request id for our username
reqs=$(curl -sSf "${BASE_API}/api/admin/signup_requests?status=pending" -H "Cookie: ${SID_ADMIN}") || fail "list signup requests"
[[ -n "$reqs" ]] || fail "empty signup request list response"
req_id=$(echo "$reqs" | python3 -c 'import json,sys; u=sys.argv[1]; arr=json.load(sys.stdin); hit=[r for r in arr if r.get("username")==u]; print(hit[0]["id"] if hit else "")' "$u")
[[ -n "$req_id" ]] || fail "no pending req id for $u"

# 4) Approve and capture verification_code
approve=$(curl -sSf -X POST "${BASE_API}/api/admin/signup_requests/${req_id}/approve" -H "Cookie: ${SID_ADMIN}") || fail "approve failed"
code=$(echo "$approve" | python3 -c 'import json,sys; j=json.load(sys.stdin); print(j.get("verification_code",""))')
[[ "$code" =~ ^[0-9]{6}$ ]] || fail "verification_code missing/invalid: $approve"

# 5) User login (should succeed but me.email_verified should be false)
hdr2=$(mktemp)
trap 'rm -f "$hdr" "$hdr2"' EXIT
curl -sS -D "$hdr2" -o /dev/null -X POST "${BASE_API}/api/login" -H 'Content-Type: application/json' \
  -d "{\"username\":\"$u\",\"password\":\"$pass\"}" || fail "user login failed"
SID_USER=$(grep -i '^set-cookie: sid=' "$hdr2" | head -n1 | sed -E 's/^set-cookie: (sid=[^;]+).*/\1/i')
[[ -n "$SID_USER" ]] || fail "user sid missing"

me=$(curl -sS "${BASE_API}/api/me" -H "Cookie: ${SID_USER}") || fail "me failed"
echo "$me" | grep -q '"email_verified"\s*:\s*false' || fail "expected email_verified=false: $me"

# 6) Verify code
v=$(curl -sS -X POST "${BASE_API}/api/verify_email_code" -H 'Content-Type: application/json' -H "Cookie: ${SID_USER}" \
  -d "{\"code\":\"$code\"}") || fail "verify failed"
echo "$v" | grep -q '"ok"\s*:\s*true' || fail "verify not ok: $v"

me2=$(curl -sS "${BASE_API}/api/me" -H "Cookie: ${SID_USER}") || fail "me2 failed"
echo "$me2" | grep -q '"email_verified"\s*:\s*true' || fail "expected email_verified=true: $me2"

echo "OK: smoke_verification_whatsapp (user=$u code=$code)"