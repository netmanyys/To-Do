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

export default async function AccountPage({
  searchParams,
}: {
  searchParams: Promise<{ err?: string }>;
}) {
  const meR = await apiFetch("/api/me");
  if (meR.status !== 200) {
    return (
      <div className="wrap">
        <div className="card">
          <h1>Account</h1>
          <p className="sub">Please <a href="/">sign in</a> first.</p>
        </div>
      </div>
    );
  }

  const sp = await searchParams;
  const err = (sp.err || "").trim();

  const me = (await meR.json()) as { username: string; must_change_password?: boolean };

  return (
    <div className="wrap">
      <div className="card">
        <div className="top">
          <div>
            <h1>Change password</h1>
            <p className="sub">
              Signed in as <b>{me.username}</b>
              {me.must_change_password ? " · password change required" : ""}
            </p>
          </div>
          <a href="/">Back</a>
        </div>

        {err === "pw_mismatch" ? <div className="err">New passwords do not match.</div> : null}

        <form className="row row-stack" method="post" action="/account/change-password">
          <input name="old_password" type="password" placeholder="old password" minLength={8} required />
          <input name="new_password" type="password" placeholder="new password" minLength={8} required />
          <input name="new_password2" type="password" placeholder="repeat new password" minLength={8} required />
          <button type="submit">Update password</button>
        </form>

        <div className="meta">
          Rule: ≥8 chars, include 1 lowercase, 1 uppercase, 1 number.
        </div>
      </div>
    </div>
  );
}
