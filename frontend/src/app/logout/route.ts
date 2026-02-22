import { NextResponse } from "next/server";

export async function POST(req: Request) {
  const base = process.env.INTERNAL_API_BASE || "http://api:8000";
  const cookie = req.headers.get("cookie") || "";
  await fetch(`${base}/api/logout`, { method: "POST", headers: { cookie } });

  const { redirectHome } = await import("../_lib/redirect");
  const res = redirectHome(req, 303);
  // clear cookie on browser
  res.headers.append(
    "set-cookie",
    "sid=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax"
  );
  return res;
}
