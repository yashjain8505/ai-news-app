import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { isAdmin, adminConfigured, getAdminUserDetail } from "@/lib/adminData";
import { AdminShell, AdminLogin } from "../../AdminShell";
import { deleteUser } from "../../actions";
import DeleteUserForm from "./DeleteUserForm";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata: Metadata = {
  title: "Admin · User",
  robots: { index: false, follow: false },
};

function fmtDateTime(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function fmtDwell(ms: number | null): string {
  if (ms == null) return "—";
  if (ms < 1000) return `${ms}ms`;
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(1)}s`;
  return `${Math.floor(s / 60)}m ${Math.round(s % 60)}s`;
}

const headCell: React.CSSProperties = {
  textAlign: "left",
  padding: "7px 10px",
  borderBottom: "2px solid var(--ruleStrong)",
  fontSize: 10,
  letterSpacing: "0.14em",
  textTransform: "uppercase",
  color: "var(--dim)",
  whiteSpace: "nowrap",
};
const cell: React.CSSProperties = {
  textAlign: "left",
  padding: "7px 10px",
  borderBottom: "1px solid var(--rule)",
  verticalAlign: "top",
};

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2
      className="mono"
      style={{
        fontSize: 12,
        letterSpacing: "0.16em",
        textTransform: "uppercase",
        color: "var(--ink)",
        margin: "40px 0 14px",
        borderBottom: "1px solid var(--rule)",
        paddingBottom: 8,
      }}
    >
      {children}
    </h2>
  );
}

export default async function AdminUserPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ e?: string }>;
}) {
  // GATE first — no data for anyone but a verified admin.
  if (!(await isAdmin())) {
    return <AdminLogin notConfigured={!adminConfigured} />;
  }

  const { id } = await params;
  const sp = await searchParams;
  const detail = await getAdminUserDetail(id);

  if (detail.configured && !detail.found) notFound();

  const { user, mix, interactions, feedback, responses } = detail;

  return (
    <AdminShell subtitle="User detail">
      <div style={{ marginBottom: 6 }}>
        <a
          href="/admin"
          className="mono"
          style={{
            fontSize: 11,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            color: "var(--dim)",
            textDecoration: "none",
          }}
        >
          &larr; All users
        </a>
      </div>

      {!detail.configured ? (
        <p
          className="serif"
          style={{
            fontSize: 15,
            color: "var(--muted)",
            border: "1px solid var(--rule)",
            padding: "14px 16px",
            marginTop: 18,
          }}
        >
          Service role not configured (<span className="mono">SUPABASE_SERVICE_ROLE_KEY</span>{" "}
          unset); no user data available.
        </p>
      ) : (
        <>
          <h1
            className="display"
            style={{
              fontSize: "clamp(26px,4vw,38px)",
              lineHeight: 1.05,
              color: "var(--ink)",
              margin: "10px 0 4px",
            }}
          >
            {user?.name || "Unnamed user"}
          </h1>
          <div
            className="mono"
            style={{ fontSize: 13, color: "var(--muted)", marginBottom: 4 }}
          >
            {user?.email || "—"}
          </div>
          <div
            className="mono"
            style={{ fontSize: 11, color: "var(--dim)", letterSpacing: "0.04em" }}
          >
            Joined {fmtDateTime(user?.createdAt ?? null)} · id {user?.id}
          </div>

          {sp.e ? (
            <p
              className="mono"
              style={{ fontSize: 11, color: "var(--accent)", marginTop: 14 }}
            >
              Delete failed: {sp.e}
            </p>
          ) : null}

          {/* Taste mix ------------------------------------------------------ */}
          <SectionTitle>Taste mix</SectionTitle>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
              gap: 10,
            }}
          >
            {mix.map((m) => (
              <div
                key={m.tag}
                style={{ display: "flex", flexDirection: "column", gap: 4 }}
              >
                <div
                  className="mono"
                  style={{
                    fontSize: 11,
                    display: "flex",
                    justifyContent: "space-between",
                    color: "var(--muted)",
                  }}
                >
                  <span>{m.tag}</span>
                  <span style={{ color: "var(--ink)" }}>{m.pct}%</span>
                </div>
                <div style={{ height: 4, background: "var(--rule)" }}>
                  <div
                    style={{
                      height: 4,
                      width: `${Math.min(100, m.pct)}%`,
                      background: "var(--accent)",
                    }}
                  />
                </div>
              </div>
            ))}
          </div>

          {/* Interactions -------------------------------------------------- */}
          <SectionTitle>Interactions ({interactions.length})</SectionTitle>
          <div style={{ overflowX: "auto" }}>
            <table
              className="mono"
              style={{
                width: "100%",
                borderCollapse: "collapse",
                fontSize: 12,
                color: "var(--ink)",
              }}
            >
              <thead>
                <tr>
                  <th style={headCell}>When</th>
                  <th style={headCell}>Action</th>
                  <th style={{ ...headCell, textAlign: "right" }}>Dwell</th>
                  <th style={headCell}>Item</th>
                </tr>
              </thead>
              <tbody>
                {interactions.length === 0 ? (
                  <tr>
                    <td colSpan={4} style={{ ...cell, color: "var(--dim)", fontStyle: "italic" }}>
                      None
                    </td>
                  </tr>
                ) : (
                  interactions.map((it) => (
                    <tr key={it.id}>
                      <td style={{ ...cell, whiteSpace: "nowrap" }}>
                        {fmtDateTime(it.createdAt)}
                      </td>
                      <td style={cell}>{it.action || "—"}</td>
                      <td style={{ ...cell, textAlign: "right", whiteSpace: "nowrap" }}>
                        {fmtDwell(it.dwellMs)}
                      </td>
                      <td style={{ ...cell, color: "var(--muted)" }}>
                        {it.itemTitle || "—"}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Item feedback ------------------------------------------------- */}
          <SectionTitle>Item feedback ({feedback.length})</SectionTitle>
          <div style={{ overflowX: "auto" }}>
            <table
              className="mono"
              style={{
                width: "100%",
                borderCollapse: "collapse",
                fontSize: 12,
                color: "var(--ink)",
              }}
            >
              <thead>
                <tr>
                  <th style={headCell}>When</th>
                  <th style={{ ...headCell, textAlign: "right" }}>Rating</th>
                  <th style={headCell}>Item</th>
                </tr>
              </thead>
              <tbody>
                {feedback.length === 0 ? (
                  <tr>
                    <td colSpan={3} style={{ ...cell, color: "var(--dim)", fontStyle: "italic" }}>
                      None
                    </td>
                  </tr>
                ) : (
                  feedback.map((f) => (
                    <tr key={f.id}>
                      <td style={{ ...cell, whiteSpace: "nowrap" }}>
                        {fmtDateTime(f.createdAt)}
                      </td>
                      <td style={{ ...cell, textAlign: "right" }}>
                        {f.rating ?? "—"}
                      </td>
                      <td style={{ ...cell, color: "var(--muted)" }}>
                        {f.itemTitle || "—"}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Onboarding taste responses ------------------------------------ */}
          <SectionTitle>Onboarding responses ({responses.length})</SectionTitle>
          <div style={{ overflowX: "auto" }}>
            <table
              className="mono"
              style={{
                width: "100%",
                borderCollapse: "collapse",
                fontSize: 12,
                color: "var(--ink)",
              }}
            >
              <thead>
                <tr>
                  <th style={{ ...headCell, textAlign: "right" }}>Round</th>
                  <th style={headCell}>Chosen</th>
                  <th style={{ ...headCell, textAlign: "right" }}>Shown</th>
                  <th style={headCell}>When</th>
                </tr>
              </thead>
              <tbody>
                {responses.length === 0 ? (
                  <tr>
                    <td colSpan={4} style={{ ...cell, color: "var(--dim)", fontStyle: "italic" }}>
                      None
                    </td>
                  </tr>
                ) : (
                  responses.map((r) => (
                    <tr key={r.id}>
                      <td style={{ ...cell, textAlign: "right" }}>{r.round ?? "—"}</td>
                      <td style={{ ...cell, color: "var(--muted)" }}>
                        {r.chosenTitle || r.chosenId || "—"}
                      </td>
                      <td style={{ ...cell, textAlign: "right" }}>
                        {r.shownIds.length}
                      </td>
                      <td style={{ ...cell, whiteSpace: "nowrap" }}>
                        {fmtDateTime(r.createdAt)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Danger zone: delete ------------------------------------------- */}
          <SectionTitle>Danger zone</SectionTitle>
          <div style={{ border: "1px solid var(--accent)", padding: "16px 18px" }}>
            <div
              className="mono"
              style={{
                fontSize: 11,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                color: "var(--accent)",
                marginBottom: 8,
              }}
            >
              Delete this user
            </div>
            <p
              className="serif"
              style={{ fontSize: 14, color: "var(--muted)", margin: "0 0 14px", maxWidth: "60ch" }}
            >
              Permanently removes the account and cascades every related row
              (interactions, onboarding responses, feedback, taste). This cannot
              be undone.
            </p>
            {/* Native confirm() (in DeleteUserForm) blocks submit unless the
                admin accepts; the action re-checks admin auth server-side too. */}
            <DeleteUserForm
              action={deleteUser}
              userId={user?.id ?? ""}
              userLabel={user?.name || user?.email || "this user"}
            />
          </div>
        </>
      )}
    </AdminShell>
  );
}
