import { cookies } from "next/headers";
import { redirect } from "next/navigation";

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

export default async function Home() {
  const me = await apiFetch("/api/me");

  if (me.status === 401) {
    const err = (await cookies()).get("admin_login_error")?.value;
    return (
      <div className="wrap">
        <div className="card">
          <div className="top">
            <div>
              <h1>Admin Console</h1>
              <p className="sub">Sign in with an admin account. (Passwords: ≥8, include upper/lower/number.)</p>
              {err === "locked" ? (
                <div className="err">Account locked (too many attempts). Ask admin to unlock.</div>
              ) : null}
              {err === "invalid" ? <div className="err">Invalid username or password.</div> : null}
              {err === "not_found" ? <div className="err">User not found.</div> : null}
              {err === "admin_required" ? <div className="err">Admin access required.</div> : null}
            </div>
          </div>
          <form className="row row-stack" method="post" action="/login">
            <input name="username" type="text" placeholder="admin username" maxLength={50} required />
            <input name="password" type="password" placeholder="password" minLength={8} required />
            <button type="submit">Sign in</button>
          </form>
          <div className="footer">
            Health: <a href="/healthz">/healthz</a>
          </div>
        </div>
      </div>
    );
  }

  const meJson = (await me.json()) as { username: string; is_admin?: boolean; must_change_password?: boolean };

  if (!meJson.is_admin) {
    return (
      <div className="wrap">
        <div className="card">
          <h1>Admin Console</h1>
          <p className="sub">Access denied. This site is for admin users only.</p>
          <form method="post" action="/logout">
            <button className="btn-small btn-ghost" type="submit">
              Logout
            </button>
          </form>
        </div>
      </div>
    );
  }

  if (meJson.must_change_password) {
    return (
      <div className="wrap">
        <div className="card">
          <h1>Password change required</h1>
          <p className="sub">
            Please <a href="/account">change your password</a> to continue.
          </p>
        </div>
      </div>
    );
  }

  redirect("/admin");
}
