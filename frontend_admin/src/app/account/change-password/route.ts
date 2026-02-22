import { NextResponse } from "next/server";

export async function POST(req: Request) {
  const base = process.env.INTERNAL_API_BASE || "http://api:8000";
  const cookie = req.headers.get("cookie") || "";
  const form = await req.formData();
  const old_password = String(form.get("old_password") || "");
  const new_password = String(form.get("new_password") || "");
  const new_password2 = String(form.get("new_password2") || "");

  if (!new_password || new_password !== new_password2) {
    const host = req.headers.get("x-forwarded-host") || req.headers.get("host") || "192.168.50.170:3002";
    const proto = req.headers.get("x-forwarded-proto") || "http";
    const url = new URL(`/account?err=pw_mismatch`, `${proto}://${host}`);
    return NextResponse.redirect(url, 303);
  }

  await fetch(`${base}/api/change_password`, {
    method: "POST",
    headers: { "Content-Type": "application/json", cookie },
    body: JSON.stringify({ old_password, new_password }),
  });

  // Force logout (A)
  const host = req.headers.get("x-forwarded-host") || req.headers.get("host") || "192.168.50.170:3002";
  const proto = req.headers.get("x-forwarded-proto") || "http";
  const url = new URL(`${proto}://${host}/`);
  const res = NextResponse.redirect(url, 303);
  res.headers.append("set-cookie", "sid=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax");
  return res;
}
