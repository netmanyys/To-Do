import { NextResponse } from "next/server";

export async function POST(req: Request) {
  const base = process.env.INTERNAL_API_BASE || "http://api:8000";
  const cookie = req.headers.get("cookie") || "";
  const form = await req.formData();
  const code = String(form.get("code") || "").trim();

  await fetch(`${base}/api/verify_email_code`, {
    method: "POST",
    headers: { "Content-Type": "application/json", cookie },
    body: JSON.stringify({ code }),
  });

  const host = req.headers.get("x-forwarded-host") || req.headers.get("host") || "192.168.50.170:3001";
  const proto = req.headers.get("x-forwarded-proto") || "http";
  return NextResponse.redirect(new URL("/", `${proto}://${host}`), 303);
}
