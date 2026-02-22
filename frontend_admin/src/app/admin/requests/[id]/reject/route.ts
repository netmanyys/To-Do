import { NextResponse } from "next/server";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const base = process.env.INTERNAL_API_BASE || "http://api:8000";
  const cookie = req.headers.get("cookie") || "";
  const { id } = await ctx.params;

  await fetch(`${base}/api/admin/signup_requests/${id}/reject`, {
    method: "POST",
    headers: { cookie },
  });

  const host = req.headers.get("x-forwarded-host") || req.headers.get("host") || "192.168.50.170:3002";
  const proto = req.headers.get("x-forwarded-proto") || "http";
  return NextResponse.redirect(new URL("/admin", `${proto}://${host}`), 303);
}
