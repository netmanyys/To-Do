import { NextResponse } from "next/server";

export function redirectHome(req: Request, status: number = 303) {
  const host = req.headers.get("x-forwarded-host") || req.headers.get("host") || "localhost:3000";
  const proto = req.headers.get("x-forwarded-proto") || "http";
  const url = new URL(`${proto}://${host}/`);
  return NextResponse.redirect(url, status);
}
