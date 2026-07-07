import { login, logout } from "./actions";

// On-brand utilitarian chrome for the admin console. Server component only, no
// "use client", so it never pulls the DAL or any secret toward the browser.
// Uses the design-system CSS vars (globals.css): --accent, --ink, --bg, --muted,
// --dim, --rule, --ruleStrong, --onAccent, and the mono/display helper classes.

export function AdminShell({
  children,
  subtitle,
}: {
  children: React.ReactNode;
  subtitle?: string;
}) {
  return (
    <main className="bs-main" style={{ position: "relative", paddingTop: 18 }}>
      <header>
        <div
          style={{
            display: "flex",
            alignItems: "flex-end",
            justifyContent: "space-between",
            gap: 16,
            flexWrap: "wrap",
          }}
        >
          <a
            href="/admin"
            style={{
              textDecoration: "none",
              display: "inline-flex",
              alignItems: "center",
              gap: 12,
            }}
          >
            <span
              aria-hidden
              className="display"
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                width: 40,
                height: 40,
                background: "var(--accent)",
                color: "var(--onAccent)",
                fontSize: 28,
                lineHeight: 1,
              }}
            >
              W
            </span>
            <span
              className="display"
              style={{
                fontSize: "clamp(30px,4.5vw,44px)",
                lineHeight: 0.9,
                letterSpacing: "0.13em",
                textTransform: "uppercase",
                color: "var(--ink)",
              }}
            >
              Wortins
            </span>
          </a>
          <form action={logout}>
            <button
              type="submit"
              className="mono"
              style={{
                fontSize: 11,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                padding: "8px 14px",
                border: "1px solid var(--accent)",
                color: "var(--accent)",
                background: "transparent",
                cursor: "pointer",
              }}
            >
              Log out
            </button>
          </form>
        </div>
        <div
          className="mono"
          style={{
            fontSize: 10,
            letterSpacing: "0.22em",
            textTransform: "uppercase",
            color: "var(--dim)",
            marginTop: 12,
          }}
        >
          {subtitle ?? "Admin console"}
        </div>
        <div style={{ borderTop: "3px solid var(--ruleStrong)", marginTop: 14 }} />
      </header>
      <div style={{ marginTop: 28 }}>{children}</div>
    </main>
  );
}

// The password gate. Rendered whenever the request is not an authenticated
// admin, it is the ONLY thing an unauthenticated visitor to /admin ever sees.
export function AdminLogin({
  error,
  notConfigured,
}: {
  error?: boolean;
  notConfigured?: boolean;
}) {
  return (
    <main
      className="bs-main"
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        paddingTop: 40,
      }}
    >
      <div style={{ width: "100%", maxWidth: 380 }}>
        <div
          className="display"
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            width: 44,
            height: 44,
            background: "var(--accent)",
            color: "var(--onAccent)",
            fontSize: 30,
            lineHeight: 1,
            marginBottom: 18,
          }}
        >
          W
        </div>
        <h1
          className="display"
          style={{
            fontSize: 30,
            lineHeight: 1,
            letterSpacing: "0.06em",
            textTransform: "uppercase",
            color: "var(--ink)",
            margin: "0 0 6px",
          }}
        >
          Admin
        </h1>
        <p
          className="mono"
          style={{
            fontSize: 11,
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            color: "var(--dim)",
            margin: "0 0 24px",
          }}
        >
          Restricted, password required
        </p>

        {notConfigured ? (
          <p
            className="serif"
            style={{
              fontSize: 14,
              color: "var(--muted)",
              border: "1px solid var(--rule)",
              padding: "12px 14px",
              margin: "0 0 20px",
            }}
          >
            The admin console is not configured on this deployment
            (<span className="mono">ADMIN_SECRET</span> /{" "}
            <span className="mono">SUPABASE_SERVICE_ROLE_KEY</span> are unset).
          </p>
        ) : null}

        <LoginForm error={error} />
      </div>
    </main>
  );
}

function LoginForm({ error }: { error?: boolean }) {
  return (
    <form action={login} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <input
        type="password"
        name="password"
        required
        autoFocus
        autoComplete="current-password"
        placeholder="Admin password"
        className="mono"
        style={{
          fontSize: 14,
          padding: "12px 14px",
          border: "1px solid var(--ruleStrong)",
          background: "var(--bg)",
          color: "var(--ink)",
        }}
      />
      {error ? (
        <span
          className="mono"
          style={{ fontSize: 11, color: "var(--accent)", letterSpacing: "0.06em" }}
        >
          Incorrect password.
        </span>
      ) : null}
      <button
        type="submit"
        className="mono"
        style={{
          fontSize: 12,
          letterSpacing: "0.1em",
          textTransform: "uppercase",
          padding: "12px 14px",
          background: "var(--accent)",
          color: "var(--onAccent)",
          border: "1px solid var(--accent)",
          cursor: "pointer",
        }}
      >
        Enter
      </button>
    </form>
  );
}
