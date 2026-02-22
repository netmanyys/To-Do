import { NextResponse } from "next/server";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const base = process.env.INTERNAL_API_BASE || "http://api:8000";
  const cookie = req.headers.get("cookie") || "";
  const { id } = await ctx.params;

  const r = await fetch(`${base}/api/admin/signup_requests/${id}/approve`, {
    method: "POST",
    headers: { cookie },
  });

  let code = "";
  try {
    const j = (await r.json()) as { verification_code?: string };
    code = String(j.verification_code || "");
  } catch {
    // ignore
  }

  const host = req.headers.get("x-forwarded-host") || req.headers.get("host") || "192.168.50.170:3002";
  const proto = req.headers.get("x-forwarded-proto") || "http";
  const url = new URL("/admin", `${proto}://${host}`);
  if (code) url.searchParams.set("sent_code", code);
  return NextResponse.redirect(url, 303);
}
