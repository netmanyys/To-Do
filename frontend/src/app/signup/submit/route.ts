import { NextResponse } from "next/server";

export async function POST(req: Request) {
  const base = process.env.INTERNAL_API_BASE || "http://api:8000";
  const form = await req.formData();
  const username = String(form.get("username") || "");
  const email = String(form.get("email") || "");
  const password = String(form.get("password") || "");

  await fetch(`${base}/api/signup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, email, password }),
  });

  // redirect back to login page
  const host = req.headers.get("x-forwarded-host") || req.headers.get("host") || "192.168.50.170:3001";
  const proto = req.headers.get("x-forwarded-proto") || "http";
  const url = new URL(`${proto}://${host}/`);
  return NextResponse.redirect(url, 303);
}
