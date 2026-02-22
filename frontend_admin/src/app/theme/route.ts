import { NextResponse } from "next/server";

export async function POST(req: Request) {
  const form = await req.formData();
  const theme = String(form.get("theme") || "dark");
  let next = String(form.get("next") || "/");

  // Only allow same-origin relative redirects
  if (!next.startsWith("/")) next = "/";

  // req.url inside Docker can be 0.0.0.0; build redirect target from Host header.
  const host = req.headers.get("host") || "192.168.50.170:3001";
  const base = `http://${host}`;

  const res = NextResponse.redirect(new URL(next, base), 303);
  res.cookies.set({
    name: "theme",
    value: theme === "light" ? "light" : "dark",
    httpOnly: false,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
  return res;
}
