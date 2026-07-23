import type { Metadata } from "next";
import { isAdmin, adminConfigured } from "@/lib/adminData";
import { AdminShell, AdminLogin } from "../AdminShell";
import { Notice, fmtPct } from "../seo/charts";
import { getVisibilityOverview, type VisRow } from "@/lib/geoData";

// Reads cookies + live data every hit — never cache.
export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata: Metadata = {
  title: "GEO",
  robots: { index: false, follow: false },
};

function Tile({ big, label }: { big: string; label: string }) {
  return (
    <div style={{ border: "1px solid var(--rule)", padding: "16px 18px", minWidth: 128 }}>
      <div className="display" style={{ fontSize: 32, lineHeight: 1, color: "var(--ink)" }}>
        {big}
      </div>
      <div
        className="mono"
        style={{ fontSize: 10, letterSpacing: "0.07em", textTransform: "uppercase", color: "var(--dim)", marginTop: 10 }}
      >
        {label}
      </div>
    </div>
  );
}

function QueryRow({ r }: { r: VisRow }) {
  return (
    <li style={{ padding: "12px 0", borderBottom: "1px solid var(--rule)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "baseline" }}>
        <span className="serif" style={{ fontSize: 15, color: "var(--ink)" }}>{r.query}</span>
        <span className="mono" style={{ fontSize: 11, color: r.cited ? "var(--accent)" : "var(--dim)", whiteSpace: "nowrap" }}>
          {r.cited ? `cited${r.best_position ? ` · #${r.best_position}` : ""}` : "not cited"}
        </span>
      </div>
      {r.notes ? (
        <div className="mono" style={{ fontSize: 11, color: "var(--dim)", marginTop: 4, overflowWrap: "anywhere" }}>
          {r.notes}
        </div>
      ) : null}
    </li>
  );
}

export default async function GeoPage() {
  if (!(await isAdmin())) {
    return <AdminLogin notConfigured={!adminConfigured} />;
  }

  const o = await getVisibilityOverview();

  return (
    <AdminShell active="geo" subtitle="AI-search visibility">
      <h1 className="display" style={{ fontSize: 26, color: "var(--ink)", margin: "0 0 6px" }}>
        GEO visibility
      </h1>
      <p className="mono" style={{ fontSize: 11, letterSpacing: "0.04em", color: "var(--dim)", margin: "0 0 22px" }}>
        Is wortins.com cited by AI search for the queries we target · the content robots fill the &ldquo;not cited&rdquo; gaps
      </p>

      {!o.configured ? (
        <Notice>Service role key not configured on this deployment.</Notice>
      ) : o.total === 0 ? (
        <Notice>
          No visibility data yet. The tracker runs Wednesdays — trigger{" "}
          <span className="mono">ai-visibility.yml</span> from the GitHub Actions tab to populate it now.
        </Notice>
      ) : (
        <>
          <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
            <Tile big={fmtPct(o.citedPct)} label="Citation rate" />
            <Tile big={`${o.cited}/${o.total}`} label="Queries cited" />
            <Tile big={String(o.losing.length)} label="Gaps to fill" />
          </div>

          {o.losing.length > 0 && (
            <section style={{ marginTop: 32 }}>
              <h2 className="display" style={{ fontSize: 18, color: "var(--ink)", margin: "0 0 10px" }}>
                Not cited — the robots&apos; target list
              </h2>
              <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
                {o.losing.map((r) => (
                  <QueryRow key={r.query} r={r} />
                ))}
              </ul>
            </section>
          )}

          {o.winning.length > 0 && (
            <section style={{ marginTop: 32 }}>
              <h2 className="display" style={{ fontSize: 18, color: "var(--ink)", margin: "0 0 10px" }}>
                Cited — we&apos;re winning these
              </h2>
              <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
                {o.winning.map((r) => (
                  <QueryRow key={r.query} r={r} />
                ))}
              </ul>
            </section>
          )}

          {o.latestAt && (
            <p className="mono" style={{ fontSize: 10, color: "var(--faint)", marginTop: 24 }}>
              Last checked {new Date(o.latestAt).toISOString().slice(0, 16).replace("T", " ")} UTC
            </p>
          )}
        </>
      )}
    </AdminShell>
  );
}
