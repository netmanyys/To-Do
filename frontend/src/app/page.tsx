import { cookies } from "next/headers";
import { ThemeSelect } from "./_components/ThemeSelect";
import { TodoActions } from "./_components/TodoActions";

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

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ priority?: string; status?: string }>;
}) {
  const c = await cookies();
  const theme = c.get("theme")?.value === "light" ? "light" : "dark";

  const me = await apiFetch("/api/me");
  if (me.status === 401) {
    const err = c.get("login_error")?.value;
    // not logged in
    return (
      <div className="wrap">
        <div className="card">
          <div className="top">
            <div>
              <h1>Sign in</h1>
              <p className="sub">New user? Request access below. (Passwords: ≥8, include upper/lower/number.)</p>
              {err === "admin_not_allowed" ? <div className="err">Admin accounts must use the admin site.</div> : null}
              {err === "locked" ? <div className="err">Account locked (too many attempts).</div> : null}
              {err === "invalid" ? <div className="err">Invalid username or password.</div> : null}
              {err === "not_found" ? <div className="err">User not found.</div> : null}
            </div>
          </div>
          <form className="row row-stack" method="post" action="/login">
            <input name="username" type="text" placeholder="username" maxLength={50} required />
            <input name="password" type="password" placeholder="password" minLength={8} required />
            <button type="submit">Sign in</button>
          </form>
          <div className="footer" style={{ marginTop: 10 }}>
            <a href="/signup">Request access</a>
          </div>
          <div className="footer">
            Health: <a href="/healthz">/healthz</a>
          </div>
        </div>
      </div>
    );
  }

  const meJson = (await me.json()) as { id: number; username: string; must_change_password?: boolean; email_verified?: boolean; is_admin?: boolean };
  if (meJson.is_admin) {
    return (
      <div className="wrap">
        <div className="card">
          <h1>Access denied</h1>
          <p className="sub">Admin accounts must use the admin site (3002).</p>
          <form method="post" action="/logout">
            <button className="btn-small btn-ghost" type="submit">Logout</button>
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

  if (meJson.email_verified === false) {
    return (
      <div className="wrap">
        <div className="card">
          <h1>Verification required</h1>
          <p className="sub">
            Please <a href="/account/verify">enter your verification code</a> to continue.
          </p>
        </div>
      </div>
    );
  }
  const todosR = await apiFetch("/api/todos");
  const todosAll = (await todosR.json()) as Array<{ id: number; title: string; done: boolean; priority: string; created_at: number }>;

  const sp = await searchParams;
  const pr = String(sp.priority || "all").toLowerCase();
  const st = String(sp.status || "all").toLowerCase();

  const todos = todosAll.filter((t) => {
    const okPr = pr === "all" ? true : String(t.priority || "").toLowerCase() === pr;
    const okSt =
      st === "all" ? true : st === "done" ? t.done === true : st === "todo" ? t.done === false : true;
    return okPr && okSt;
  });

  const fmtPT = (unixSeconds: number) => {
    const d = new Date(unixSeconds * 1000);
    // Format in Pacific Time explicitly (do not rely on server/container TZ)
    return d
      .toLocaleString("sv-SE", {
        timeZone: "America/Los_Angeles",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      })
      .replace(" ", " ");
  };

  return (
    <div className="wrap">
      <div className="card">
        <div className="header-block">
        <div className="top" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {/* Row 1: header + logout */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
            <div>
              <h1>To‑Do</h1>
              <p className="sub">
                Signed in as <b>{meJson.username}</b> · data is persisted in PostgreSQL.
              </p>
            </div>
            <div className="top-right">
              <form method="post" action="/logout">
                <button className="btn-small btn-ghost top-right-wide" type="submit">
                  Logout
                </button>
              </form>

              <div className="top-right-wide">
                <ThemeSelect theme={theme as "dark" | "light"} />
              </div>
            </div>
          </div>

          {/* Row 2: filters */}
          <form method="get" action="/" className="row row-grid-3" style={{ padding: 0 }}>
            <select name="priority" defaultValue={pr}>
              <option value="all">All priorities</option>
              <option value="High">High</option>
              <option value="Medium">Medium</option>
              <option value="Low">Low</option>
            </select>
            <select name="status" defaultValue={st}>
              <option value="all">All status</option>
              <option value="todo">Not done</option>
              <option value="done">Done</option>
            </select>
            <button className="btn-ghost" type="submit">
              Filter
            </button>
          </form>
        </div>

        <form className="row row-grid-3" method="post" action="/todos">
          <input name="text" type="text" placeholder="Add a task…" maxLength={200} autoFocus />
          <select name="priority" defaultValue="Medium">
            <option value="High">High</option>
            <option value="Medium">Medium</option>
            <option value="Low">Low</option>
          </select>
          <button type="submit">Add</button>
        </form>
        </div>

        <ul>
          {todos.length ? (
            todos.map((t) => (
              <li key={t.id} className={t.done ? "todo-done" : "todo-todo"}>
                <div>
                  <div className={`text ${t.done ? "done" : ""}`}>{t.title}</div>
                  <div className="meta">
                    #{t.id} · {fmtPT(t.created_at)} PT · {t.priority}
                  </div>
                </div>

                <TodoActions id={t.id} done={t.done} priority={t.priority} />
              </li>
            ))
          ) : (
            <li>
              <div>
                <div className="text">No tasks yet.</div>
                <div className="meta">Add one above.</div>
              </div>
              <div />
              <div />
            </li>
          )}
        </ul>

        <div className="footer">
          Endpoints: <code>GET /</code>, <code>POST /todos</code> · API Docs: <a href="/api-docs">Swagger</a>
        </div>
      </div>
    </div>
  );
}
