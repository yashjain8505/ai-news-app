import type { Metadata } from "next";
import { isAdmin, adminConfigured, getAdminOverview } from "@/lib/adminData";
import { AdminShell, AdminLogin } from "./AdminShell";

// Never cache, never prerender — this reads request cookies and live user data.
export const dynamic = "force-dynamic";
export const revalidate = 0;

// Keep the admin surface out of search + AI crawlers even if robots.txt is missed.
export const metadata: Metadata = {
  title: "Admin",
  robots: { index: false, follow: false },
};

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

const cellTop: React.CSSProperties = {
  textAlign: "left",
  padding: "8px 10px",
  borderBottom: "1px solid var(--rule)",
  verticalAlign: "top",
};
const headCell: React.CSSProperties = {
  textAlign: "left",
  padding: "8px 10px",
  borderBottom: "2px solid var(--ruleStrong)",
  fontSize: 10,
  letterSpacing: "0.14em",
  textTransform: "uppercase",
  color: "var(--dim)",
  whiteSpace: "nowrap",
};

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div style={{ border: "1px solid var(--rule)", padding: "16px 18px" }}>
      <div
        className="display"
        style={{ fontSize: 34, lineHeight: 1, color: "var(--ink)" }}
      >
        {value}
      </div>
      <div
        className="mono"
        style={{
          fontSize: 10,
          letterSpacing: "0.14em",
          textTransform: "uppercase",
          color: "var(--dim)",
          marginTop: 8,
        }}
      >
        {label}
      </div>
    </div>
  );
}

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{ e?: string; deleted?: string }>;
}) {
  // GATE: anything but a verified admin sees only the password form — no data.
  if (!(await isAdmin())) {
    const sp = await searchParams;
    return <AdminLogin error={sp.e === "1"} notConfigured={!adminConfigured} />;
  }

  const sp = await searchParams;
  const { configured, metrics, users } = await getAdminOverview();

  return (
    <AdminShell subtitle="Users & activity" active="overview">
      {!configured ? (
        <p
          className="serif"
          style={{
            fontSize: 15,
            color: "var(--muted)",
            border: "1px solid var(--rule)",
            padding: "14px 16px",
            marginBottom: 24,
          }}
        >
          Service role not configured on this deployment
          (<span className="mono">SUPABASE_SERVICE_ROLE_KEY</span> is unset), so no
          user data can be read here.
        </p>
      ) : null}

      {sp.deleted === "1" ? (
        <p
          className="mono"
          style={{
            fontSize: 11,
            letterSpacing: "0.08em",
            color: "var(--accent)",
            marginBottom: 18,
          }}
        >
          User deleted.
        </p>
      ) : null}

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
          gap: 16,
          marginBottom: 34,
        }}
      >
        <Metric label="Total users" value={metrics.totalUsers} />
        <Metric label="Active this week" value={metrics.activeThisWeek} />
        <Metric label="Avg reads / user" value={metrics.avgReadsPerUser} />
      </div>

      <div style={{ overflowX: "auto" }}>
        <table
          className="mono"
          style={{
            width: "100%",
            borderCollapse: "collapse",
            fontSize: 12.5,
            color: "var(--ink)",
          }}
        >
          <thead>
            <tr>
              <th style={headCell}>Name</th>
              <th style={headCell}>Email</th>
              <th style={headCell}>Joined</th>
              <th style={headCell}>Last active</th>
              <th style={{ ...headCell, textAlign: "right" }}>Reads</th>
              <th style={headCell}>Top tags</th>
              <th style={headCell} />
            </tr>
          </thead>
          <tbody>
            {users.length === 0 ? (
              <tr>
                <td
                  colSpan={7}
                  style={{
                    ...cellTop,
                    color: "var(--dim)",
                    fontStyle: "italic",
                    padding: "18px 10px",
                  }}
                >
                  No users yet.
                </td>
              </tr>
            ) : (
              users.map((u) => (
                <tr key={u.id}>
                  <td style={cellTop}>{u.name || "—"}</td>
                  <td style={cellTop}>{u.email || "—"}</td>
                  <td style={{ ...cellTop, whiteSpace: "nowrap" }}>
                    {fmtDate(u.createdAt)}
                  </td>
                  <td style={{ ...cellTop, whiteSpace: "nowrap" }}>
                    {fmtDate(u.lastActive)}
                  </td>
                  <td style={{ ...cellTop, textAlign: "right" }}>
                    {u.interactions}
                  </td>
                  <td style={{ ...cellTop, color: "var(--muted)" }}>
                    {u.topTags.length
                      ? u.topTags
                          .map((t) => `${t.tag} ${t.pct}%`)
                          .join(" · ")
                      : "—"}
                  </td>
                  <td style={{ ...cellTop, whiteSpace: "nowrap" }}>
                    <a
                      href={`/admin/user/${u.id}`}
                      style={{ color: "var(--accent)", textDecoration: "none" }}
                    >
                      View &rarr;
                    </a>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </AdminShell>
  );
}
