import { NextResponse } from "next/server";

export async function POST(req: Request) {
  const base = process.env.INTERNAL_API_BASE || "http://api:8000";
  const cookie = req.headers.get("cookie") || "";
  const form = await req.formData();
  const text = String(form.get("text") || "").trim();
  const priority = String(form.get("priority") || "Medium");
  if (text) {
    await fetch(`${base}/api/todos`, {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie },
      body: JSON.stringify({ title: text, priority }),
    });
  }
  const { redirectHome } = await import("../_lib/redirect");
  return redirectHome(req, 303);
}
