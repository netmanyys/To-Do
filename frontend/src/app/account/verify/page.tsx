import { cookies } from "next/headers";

async function apiFetch(path: string, init?: RequestInit) {
  const base = process.env.INTERNAL_API_BASE || "http://api:8000";
  const c = await cookies();
  const sid = c.get("sid")?.value;

  const headers = new Headers(init?.headers);
  if (sid) headers.set("cookie", `sid=${sid}`);

  const r = await fetch(`${base}${path}`, {
    ...init,
    headers,
    cache: "no-store",
  });
  return r;
}

export default async function VerifyPage() {
  const meR = await apiFetch("/api/me");
  if (meR.status !== 200) {
    return (
      <div className="wrap">
        <div className="card">
          <h1>Verify</h1>
          <p className="sub">
            Please <a href="/">sign in</a> first.
          </p>
        </div>
      </div>
    );
  }

  const me = (await meR.json()) as { username: string; email_verified?: boolean };

  return (
    <div className="wrap">
      <div className="card">
        <div className="top">
          <div>
            <h1>Enter verification code</h1>
            <p className="sub">
              Signed in as <b>{me.username}</b>
              {me.email_verified === false ? " · verification required" : ""}
            </p>
          </div>
          <a href="/">Back</a>
        </div>

        <form className="row row-stack" method="post" action="/account/verify/submit">
          <input name="code" type="text" placeholder="6-digit code" inputMode="numeric" pattern="[0-9]{6}" required />
          <button type="submit">Verify</button>
        </form>

        <div className="meta">Code expires in ~15 minutes after admin approval (temporary WhatsApp flow).</div>
      </div>
    </div>
  );
}
