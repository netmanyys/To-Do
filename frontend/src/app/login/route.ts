import { NextResponse } from "next/server";

export async function POST(req: Request) {
  const base = process.env.INTERNAL_API_BASE || "http://api:8000";
  const form = await req.formData();
  const username = String(form.get("username") || "");
  const password = String(form.get("password") || "");

  const r = await fetch(`${base}/api/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });

  const { redirectHome } = await import("../_lib/redirect");
  const res = redirectHome(req, 303);

  // If login failed, just redirect back (API sets no cookie)
  if (r.status !== 200) {
    const code = r.status;
    const err = code === 423 ? "locked" : code === 401 ? "invalid" : code === 404 ? "not_found" : "error";
    res.headers.append("set-cookie", `login_error=${err}; Path=/; Max-Age=10; SameSite=Lax`);
    res.headers.append("set-cookie", "sid=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax");
    return res;
  }

  // Pass-through Set-Cookie from FastAPI (sid)
  const setCookie = r.headers.get("set-cookie") || "";
  const cookieKV = setCookie ? setCookie.split(";")[0] : ""; // "sid=..."

  // Business site should NOT allow admin accounts.
  let isAdmin = false;
  try {
    const me = await fetch(`${base}/api/me`, {
      headers: cookieKV ? { cookie: cookieKV } : {},
      cache: "no-store",
    });
    if (me.status === 200) {
      const j = (await me.json()) as { is_admin?: boolean };
      isAdmin = !!j.is_admin;
    }
  } catch {
    // ignore
  }

  if (isAdmin) {
    // ensure no session remains
    try {
      await fetch(`${base}/api/logout`, { method: "POST", headers: cookieKV ? { cookie: cookieKV } : {} });
    } catch {}

    res.headers.append("set-cookie", "sid=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax");
    res.headers.append("set-cookie", "login_error=admin_not_allowed; Path=/; Max-Age=10; SameSite=Lax");
    return res;
  }

  if (setCookie) res.headers.set("set-cookie", setCookie);
  // clear any previous error
  res.headers.append("set-cookie", "login_error=; Path=/; Max-Age=0; SameSite=Lax");
  return res;
}
