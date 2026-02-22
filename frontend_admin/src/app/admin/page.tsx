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

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{ sent_code?: string }>;
}) {
  const meR = await apiFetch("/api/me");
  if (meR.status !== 200) {
    return (
      <div className="wrap">
        <div className="card">
          <h1>Admin</h1>
          <p className="sub">Please <a href="/">sign in</a> first.</p>
        </div>
      </div>
    );
  }
  const me = (await meR.json()) as { id: number; username: string; is_admin: boolean };
  if (!me.is_admin) {
    return (
      <div className="wrap">
        <div className="card">
          <h1>Admin</h1>
          <p className="sub">Access denied.</p>
        </div>
      </div>
    );
  }

  const sp = await searchParams;
  const sentCode = (sp.sent_code || "").trim();

  const reqR = await apiFetch("/api/admin/signup_requests?status=pending");
  const requests = (await reqR.json()) as Array<{ id: number; username: string; email: string; status: string; created_at: number }>;

  const usersR = await apiFetch("/api/admin/users");
  const users = (await usersR.json()) as Array<{ id: number; username: string; email?: string | null; locked: boolean; is_admin: boolean; failed_login_count: number }>;

  return (
    <div className="wrap">
      <div className="card">
        <div className="top">
          <div>
            <h1>Admin</h1>
            <p className="sub">Signed in as <b>{me.username}</b> · <a href="/account">Change password</a></p>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <form method="post" action="/logout">
              <button className="btn-small btn-ghost" type="submit">Logout</button>
            </form>
            <a href="/">Back</a>
          </div>
        </div>

        {sentCode ? (
          <div className="card" style={{ marginTop: 12 }}>
            <div className="text">Verification code (send via WhatsApp for now): <b>{sentCode}</b></div>
            <div className="meta">User should sign in on 3001, then go to /account/verify to enter this code.</div>
          </div>
        ) : null}

        <h2 style={{ margin: "16px 0 8px", fontSize: 16 }}>Pending signup requests</h2>
        {requests.length ? (
          <ul>
            {requests.map((r) => (
              <li key={r.id}>
                <div>
                  <div className="text">{r.username} · {r.email}</div>
                  <div className="meta">#{r.id}</div>
                </div>
                <form method="post" action={`/admin/requests/${r.id}/approve`}>
                  <button className="btn-small btn-ghost" type="submit">Approve</button>
                </form>
                <form method="post" action={`/admin/requests/${r.id}/reject`}>
                  <button className="btn-small btn-danger" type="submit">Reject</button>
                </form>
              </li>
            ))}
          </ul>
        ) : (
          <div className="meta">No pending requests.</div>
        )}

        <h2 style={{ margin: "18px 0 8px", fontSize: 16 }}>Users</h2>
        <ul>
          {users.map((u) => (
            <li key={u.id}>
              <div>
                <div className="text">
                  {u.username}{u.is_admin ? " (admin)" : ""}
                </div>
                <div className="meta">#{u.id} · locked={String(u.locked)} · fails={u.failed_login_count}</div>
              </div>
              <div />
              {u.locked ? (
                <form method="post" action={`/admin/users/${u.id}/unlock`}>
                  <button className="btn-small btn-ghost" type="submit">Unlock</button>
                </form>
              ) : (
                <div />
              )}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
