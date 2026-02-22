import { NextResponse } from "next/server";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const base = process.env.INTERNAL_API_BASE || "http://api:8000";
  const cookie = req.headers.get("cookie") || "";
  const { id } = await ctx.params;
  const form = await req.formData();
  const priority = String(form.get("priority") || "Medium");

  await fetch(`${base}/api/todos/${id}/priority`, {
    method: "POST",
    headers: { "Content-Type": "application/json", cookie },
    body: JSON.stringify({ priority }),
  });

  const { redirectHome } = await import("../../../_lib/redirect");
  return redirectHome(req, 303);
}
