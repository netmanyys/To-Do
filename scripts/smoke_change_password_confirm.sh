#!/usr/bin/env bash
set -euo pipefail

HOST=${HOST:-192.168.50.170}
PORT_WEB=${PORT_WEB:-3001}
PORT_API=${PORT_API:-8001}
BASE_WEB="http://${HOST}:${PORT_WEB}"
BASE_API="http://${HOST}:${PORT_API}"

fail(){ echo "FAIL: $*"; exit 1; }
require_cmd(){ command -v "$1" >/dev/null 2>&1 || fail "missing cmd: $1"; }
require_cmd curl
require_cmd sed
require_cmd grep

# health (retry)
for i in {1..10}; do
  if curl -sS -o /dev/null "${BASE_API}/health"; then break; fi
  sleep 0.3
  [[ $i -lt 10 ]] || fail "api down"
done

# create + approve + verify a fresh user
u="pwcf_$(date +%s)"
email="${u}@example.com"
oldpw="Abcdef12"
newpw="Abcdef13"

curl -sS -X POST "${BASE_API}/api/signup" -H 'Content-Type: application/json' \
  -d "{\"username\":\"$u\",\"email\":\"$email\",\"password\":\"$oldpw\"}" >/dev/null || fail "signup"

# admin login
hdr=$(mktemp)
trap 'rm -f "$hdr" "$hdr2"' EXIT
curl -sS -D "$hdr" -o /dev/null -X POST "${BASE_API}/api/login" -H 'Content-Type: application/json' \
  -d '{"username":"admin","password":"Admin1234"}' || fail "admin login"
SID_ADMIN=$(grep -i '^set-cookie: sid=' "$hdr" | head -n1 | sed -E 's/^set-cookie: (sid=[^;]+).*/\1/i')
[[ -n "$SID_ADMIN" ]] || fail "admin sid"

# get req_id for this user
reqs=$(curl -sSf "${BASE_API}/api/admin/signup_requests?status=pending" -H "Cookie: ${SID_ADMIN}") || fail "list reqs"
req_id=$(echo "$reqs" | python3 -c 'import json,sys; u=sys.argv[1]; arr=json.load(sys.stdin); hit=[r for r in arr if r.get("username")==u]; print(hit[0]["id"] if hit else "")' "$u")
[[ -n "$req_id" ]] || fail "no req_id"

approve=$(curl -sSf -X POST "${BASE_API}/api/admin/signup_requests/${req_id}/approve" -H "Cookie: ${SID_ADMIN}") || fail "approve"
code=$(echo "$approve" | python3 -c 'import json,sys; j=json.load(sys.stdin); print(j.get("verification_code",""))')
[[ "$code" =~ ^[0-9]{6}$ ]] || fail "bad code"

# user login
hdr2=$(mktemp)
curl -sS -D "$hdr2" -o /dev/null -X POST "${BASE_API}/api/login" -H 'Content-Type: application/json' \
  -d "{\"username\":\"$u\",\"password\":\"$oldpw\"}" || fail "user login"
SID_USER=$(grep -i '^set-cookie: sid=' "$hdr2" | head -n1 | sed -E 's/^set-cookie: (sid=[^;]+).*/\1/i')
[[ -n "$SID_USER" ]] || fail "user sid"

# verify code
curl -sS -X POST "${BASE_API}/api/verify_email_code" -H 'Content-Type: application/json' -H "Cookie: ${SID_USER}" \
  -d "{\"code\":\"$code\"}" >/dev/null || fail "verify"

# call web change-password route with mismatch (should redirect to /account?err=pw_mismatch, and NOT change password)
loc=$(curl -sS -o /dev/null -D - -X POST "${BASE_WEB}/account/change-password" -H "Cookie: ${SID_USER}" \
  -H 'Content-Type: application/x-www-form-urlencoded' \
  --data-urlencode "old_password=$oldpw" \
  --data-urlencode "new_password=$newpw" \
  --data-urlencode "new_password2=${newpw}X" \
  | grep -i '^location:' | head -n1 | sed -E 's/^location:\s*//i')

echo "$loc" | grep -q '/account?err=pw_mismatch' || fail "expected pw_mismatch redirect, got: $loc"

# ensure old password still works
curl -sS -o /dev/null -X POST "${BASE_API}/api/login" -H 'Content-Type: application/json' \
  -d "{\"username\":\"$u\",\"password\":\"$oldpw\"}" || fail "old password should still work"

echo "OK: smoke_change_password_confirm"