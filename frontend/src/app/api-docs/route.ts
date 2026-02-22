import { NextResponse } from "next/server";

export async function GET(req: Request) {
  const host = req.headers.get("host") || "192.168.50.170:3001";
  const hostname = host.split(":")[0] || "192.168.50.170";
  const url = `http://${hostname}:8001/docs`;
  return NextResponse.redirect(url, 302);
}
