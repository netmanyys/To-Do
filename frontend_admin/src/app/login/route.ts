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

  // Handle auth errors explicitly (otherwise everything looks like "admin required")
  if (r.status !== 200) {
    const host = req.headers.get("x-forwarded-host") || req.headers.get("host") || "192.168.50.170:3002";
    const proto = req.headers.get("x-forwarded-proto") || "http";
    const home = new URL(`${proto}://${host}/`);

    const res = NextResponse.redirect(home, 303);
    const code = r.status;
    const err = code === 423 ? "locked" : code === 401 ? "invalid" : code === 404 ? "not_found" : "error";
    res.headers.append("set-cookie", `admin_login_error=${err}; Path=/; Max-Age=10; SameSite=Lax`);
    // clear cookie in browser
    res.headers.append("set-cookie", "sid=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax");
    return res;
  }

  const setCookie = r.headers.get("set-cookie") || "";
  const cookieKV = setCookie ? setCookie.split(";")[0] : ""; // "sid=..."

  // If login failed, just redirect back (API will set no cookie)
  const host = req.headers.get("x-forwarded-host") || req.headers.get("host") || "192.168.50.170:3002";
  const proto = req.headers.get("x-forwarded-proto") || "http";
  const home = new URL(`${proto}://${host}/`);

  // Validate admin access immediately: call /api/me with the new sid cookie.
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

  if (!isAdmin) {
    // ensure no session remains
    try {
      await fetch(`${base}/api/logout`, { method: "POST", headers: cookieKV ? { cookie: cookieKV } : {} });
    } catch {}

    const res = NextResponse.redirect(home, 303);
    // clear cookie in browser
    res.headers.append("set-cookie", "sid=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax");
    res.headers.append("set-cookie", "admin_login_error=admin_required; Path=/; Max-Age=5; SameSite=Lax");
    return res;
  }

  // OK: redirect to /admin
  const res = NextResponse.redirect(new URL("/admin", home), 303);
  if (setCookie) res.headers.set("set-cookie", setCookie);
  // clear any previous error
  res.headers.append("set-cookie", "admin_login_error=; Path=/; Max-Age=0; SameSite=Lax");
  return res;
}
