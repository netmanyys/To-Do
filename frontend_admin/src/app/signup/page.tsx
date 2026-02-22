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

export default async function SignupPage() {
  // if logged in, redirect home
  const me = await apiFetch("/api/me");
  if (me.status === 200) {
    return (
      <div className="wrap">
        <div className="card">
          <h1>Already signed in</h1>
          <p className="sub">Go back to <a href="/">To‑Do</a>.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="wrap">
      <div className="card">
        <div className="top">
          <div>
            <h1>Request access</h1>
            <p className="sub">Your request will be pending admin approval.</p>
          </div>
        </div>

        <form className="row row-stack" method="post" action="/signup/submit">
          <input name="username" type="text" placeholder="username" maxLength={50} required />
          <input name="email" type="email" placeholder="email" maxLength={120} required />
          <input name="password" type="password" placeholder="password" minLength={6} required />
          <button type="submit">Submit request</button>
        </form>

        <div className="footer">
          <a href="/">Back</a>
        </div>
      </div>
    </div>
  );
}
