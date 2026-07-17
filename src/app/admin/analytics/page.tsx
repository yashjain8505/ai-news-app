import type { Metadata } from "next";
import { isAdmin, adminConfigured } from "@/lib/adminData";
import { AdminShell, AdminLogin } from "../AdminShell";
import {
  getAnalyticsOverview,
  normalizeRange,
  ANALYTICS_RANGES,
  type AnalyticsRange,
} from "@/lib/analyticsData";
import { getStoredBrief } from "@/lib/brief";
import { Brief, type BriefSnapshot } from "./Brief";
import {
  StatCard,
  BarList,
  Sparkline,
  SectionTitle,
  Panel,
  Notice,
  fmtNum,
} from "./charts";

// Reads request cookies + live data on every hit — never cache or prerender.
export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata: Metadata = {
  title: "Analytics",
  robots: { index: false, follow: false },
};

// --- shared table styles (match the overview page) ---------------------------

const headCell: React.CSSProperties = {
  textAlign: "left",
  padding: "7px 10px",
  borderBottom: "2px solid var(--ruleStrong)",
  fontSize: 10,
  letterSpacing: "0.12em",
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
const numCell: React.CSSProperties = { ...cell, textAlign: "right", whiteSpace: "nowrap" };

const twoCol: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
  gap: 16,
};

function fmtIstUtc(iso: string): string {
  const d = new Date(iso);
  const opts: Intl.DateTimeFormatOptions = {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  };
  const ist = d.toLocaleString("en-GB", { ...opts, timeZone: "Asia/Kolkata" });
  const utc = d.toLocaleString("en-GB", { ...opts, timeZone: "UTC" });
  return `${ist} IST · ${utc} UTC`;
}

const SECTION_SHORT: Record<string, string> = {
  daily: "Daily",
  tools: "Tools",
  articles: "Articles",
  funding: "Funding",
};

export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string }>;
}) {
  if (!(await isAdmin())) {
    return <AdminLogin notConfigured={!adminConfigured} />;
  }

  const sp = await searchParams;
  const range: AnalyticsRange = normalizeRange(sp.range);
  const [o, storedBrief] = await Promise.all([
    getAnalyticsOverview(range),
    getStoredBrief(range),
  ]);

  // Plain, always-accurate numbers for the summary card (computed live, not LLM).
  const topSectionRow = [...o.product.sections].sort(
    (a, b) => b.interactions - a.interactions
  )[0];
  const snapshot: BriefSnapshot = {
    gaConfigured: o.ga.configured,
    visitors: o.ga.kpis.users.value,
    visitorsDeltaPct: o.ga.kpis.users.deltaPct,
    signups: o.product.totalUsers,
    activeThisWeek: o.product.activeThisWeek,
    subscribers: o.newsletter.subscribers,
    channels: o.ga.channels.slice(0, 3),
    topSection:
      topSectionRow && topSectionRow.interactions > 0 ? topSectionRow.label : null,
  };

  return (
    <AdminShell subtitle="Analytics" active="analytics">
      {/* Range selector + freshness */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 12,
          flexWrap: "wrap",
          marginBottom: 22,
        }}
      >
        <div style={{ display: "flex", gap: 8 }}>
          {ANALYTICS_RANGES.map((r) => {
            const activeR = r === range;
            return (
              <a
                key={r}
                href={`/admin/analytics?range=${r}`}
                className="mono"
                style={{
                  fontSize: 11,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  padding: "7px 13px",
                  textDecoration: "none",
                  border: `1px solid ${activeR ? "var(--accent)" : "var(--rule)"}`,
                  background: activeR ? "var(--accent)" : "transparent",
                  color: activeR ? "var(--onAccent)" : "var(--muted)",
                }}
              >
                {r}d
              </a>
            );
          })}
        </div>
        <span className="mono" style={{ fontSize: 10, letterSpacing: "0.06em", color: "var(--dim)" }}>
          as of {fmtIstUtc(o.generatedAt)}
        </span>
      </div>

      {/* AI brief */}
      <div style={{ marginBottom: 40 }}>
        <Brief stored={storedBrief} snapshot={snapshot} />
      </div>

      {/* ---------------- GROWTH ---------------- */}
      <section style={{ marginBottom: 44 }}>
        <SectionTitle
          kicker="Growth · primary"
          title="Acquisition & traffic"
          note="Where people come from and whether the top of the funnel is widening."
        />

        {!o.ga.configured ? (
          <Notice>
            Google Analytics isn&rsquo;t connected yet. Add{" "}
            <span className="mono">GA4_PROPERTY_ID</span> and{" "}
            <span className="mono">GA_SERVICE_ACCOUNT_JSON_B64</span> to light up
            these panels. Your product data below works regardless.
          </Notice>
        ) : o.ga.error ? (
          <Notice tone="accent">GA request failed: {o.ga.error}</Notice>
        ) : (
          <>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
                gap: 12,
                marginBottom: 20,
              }}
            >
              <StatCard label="Users" kpi={o.ga.kpis.users} />
              <StatCard label="Sessions" kpi={o.ga.kpis.sessions} />
              <StatCard label="New users" kpi={o.ga.kpis.newUsers} />
              <StatCard label="Engagement rate" kpi={o.ga.kpis.engagementRate} format="rate" />
              <StatCard label="Avg session" kpi={o.ga.kpis.avgSessionSec} format="duration" />
            </div>

            <Panel title="Sessions per day" style={{ marginBottom: 16 }}>
              <Sparkline points={o.ga.sessionsTrend} height={80} />
            </Panel>

            <div style={{ ...twoCol, marginBottom: 16 }}>
              <Panel title="Acquisition channels">
                <BarList items={o.ga.channels} />
              </Panel>
              <Panel title="Top landing pages">
                <BarList
                  items={o.ga.landingPages.map((p) => ({ name: p.path, value: p.sessions }))}
                />
              </Panel>
            </div>

            <div style={twoCol}>
              <Panel title="Top countries">
                <BarList items={o.ga.countries} />
              </Panel>
              <Panel title="Devices">
                <BarList items={o.ga.devices} />
              </Panel>
            </div>
          </>
        )}
      </section>

      {/* ---------------- ENGAGEMENT ---------------- */}
      <section style={{ marginBottom: 44 }}>
        <SectionTitle
          kicker="Engagement & retention"
          title="What people do once they're here"
          note="Your own signal — clicks, likes, and 'show less' — per section and per story."
        />

        {!o.product.configured ? (
          <Notice>
            Service role not configured (<span className="mono">SUPABASE_SERVICE_ROLE_KEY</span>),
            so product data can&rsquo;t be read here.
          </Notice>
        ) : (
          <>
            <div style={{ ...twoCol, marginBottom: 16 }}>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: 12,
                }}
              >
                <div style={{ border: "1px solid var(--rule)", padding: "16px 18px" }}>
                  <div className="display" style={{ fontSize: 32, color: "var(--ink)", lineHeight: 1 }}>
                    {fmtNum(o.product.totalUsers)}
                  </div>
                  <div className="mono" style={{ fontSize: 10, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--dim)", marginTop: 10 }}>
                    Total users
                  </div>
                </div>
                <div style={{ border: "1px solid var(--rule)", padding: "16px 18px" }}>
                  <div className="display" style={{ fontSize: 32, color: "var(--ink)", lineHeight: 1 }}>
                    {fmtNum(o.product.activeThisWeek)}
                  </div>
                  <div className="mono" style={{ fontSize: 10, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--dim)", marginTop: 10 }}>
                    Active this week
                  </div>
                </div>
              </div>
              <Panel title="Interactions by action">
                <BarList items={o.product.interactionsByAction} emptyLabel="No interactions in range." />
              </Panel>
            </div>

            <Panel title="Section engagement" style={{ marginBottom: 16 }}>
              <div style={{ overflowX: "auto" }}>
                <table className="mono" style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
                  <thead>
                    <tr>
                      <th style={headCell}>Section</th>
                      <th style={{ ...headCell, textAlign: "right" }}>Interactions</th>
                      <th style={{ ...headCell, textAlign: "right" }}>Clicks</th>
                      <th style={{ ...headCell, textAlign: "right" }}>Likes</th>
                      <th style={{ ...headCell, textAlign: "right" }}>Less</th>
                      <th style={{ ...headCell, textAlign: "right" }}>Positivity</th>
                      <th style={{ ...headCell, textAlign: "right" }}>Avg dwell</th>
                    </tr>
                  </thead>
                  <tbody>
                    {o.product.sections.map((s) => (
                      <tr key={s.section}>
                        <td style={cell}>{s.label}</td>
                        <td style={numCell}>{s.interactions}</td>
                        <td style={numCell}>{s.clicks}</td>
                        <td style={numCell}>{s.likes}</td>
                        <td style={numCell}>{s.less}</td>
                        <td style={{ ...numCell, color: s.positivity === null ? "var(--dim)" : "var(--ink)" }}>
                          {s.positivity === null ? "—" : `${s.positivity}%`}
                        </td>
                        <td style={{ ...numCell, color: "var(--muted)" }}>
                          {s.dwellAvgSec === null ? "—" : `${s.dwellAvgSec}s`}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Panel>

            <div style={twoCol}>
              <Panel title="Top stories">
                <ItemTable
                  rows={o.product.topItems.map((i) => ({
                    title: i.title,
                    section: i.section,
                    a: i.clicks,
                    b: i.likes,
                    c: i.less,
                  }))}
                  cols={["Clicks", "Likes", "Less"]}
                  emptyLabel="No story interactions yet."
                />
              </Panel>
              <Panel title="Underperforming stories">
                <ItemTable
                  rows={o.product.bottomItems.map((i) => ({
                    title: i.title,
                    section: i.section,
                    a: i.less,
                    b: i.score,
                  }))}
                  cols={["Less", "Score"]}
                  emptyLabel="No negative signal — nothing flagged."
                />
              </Panel>
            </div>
          </>
        )}
      </section>

      {/* ---------------- CONTENT / SOURCING ---------------- */}
      {o.product.configured ? (
        <section style={{ marginBottom: 44 }}>
          <SectionTitle
            kicker="Content & curation"
            title="Which sources & depths land"
            note="Signal for what to source more of — and how technical to go."
          />
          <div style={twoCol}>
            <Panel title="Source performance">
              {o.product.topSources.length === 0 ? (
                <p className="serif" style={{ fontSize: 13, color: "var(--dim)", fontStyle: "italic" }}>
                  No source-attributed interactions yet.
                </p>
              ) : (
                <div style={{ overflowX: "auto" }}>
                  <table className="mono" style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
                    <thead>
                      <tr>
                        <th style={headCell}>Source</th>
                        <th style={{ ...headCell, textAlign: "right" }}>Items</th>
                        <th style={{ ...headCell, textAlign: "right" }}>Clicks</th>
                        <th style={{ ...headCell, textAlign: "right" }}>Likes</th>
                        <th style={{ ...headCell, textAlign: "right" }}>Less</th>
                      </tr>
                    </thead>
                    <tbody>
                      {o.product.topSources.map((s) => (
                        <tr key={s.source}>
                          <td style={cell}>{s.source}</td>
                          <td style={numCell}>{s.items}</td>
                          <td style={numCell}>{s.clicks}</td>
                          <td style={numCell}>{s.likes}</td>
                          <td style={numCell}>{s.less}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Panel>
            <Panel title="Engagement by technical depth">
              {o.product.techLevels.length === 0 ? (
                <p className="serif" style={{ fontSize: 13, color: "var(--dim)", fontStyle: "italic" }}>
                  No depth-tagged interactions yet.
                </p>
              ) : (
                <BarList
                  items={o.product.techLevels.map((t) => ({
                    name: `Level ${t.level} · ${t.items} items`,
                    value: t.clicks + t.likes,
                  }))}
                />
              )}
            </Panel>
          </div>
        </section>
      ) : null}

      {/* ---------------- NEWSLETTER ---------------- */}
      <section>
        <SectionTitle
          kicker="Newsletter & subscribers"
          title="List growth"
          note="Subscriber base, where signups come from, and recent sends."
        />
        <div style={{ ...twoCol, marginBottom: 16 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div style={{ border: "1px solid var(--rule)", padding: "16px 18px" }}>
              <div className="display" style={{ fontSize: 32, color: "var(--ink)", lineHeight: 1 }}>
                {fmtNum(o.newsletter.subscribers)}
              </div>
              <div className="mono" style={{ fontSize: 10, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--dim)", marginTop: 10 }}>
                Subscribers
              </div>
            </div>
            <div style={{ border: "1px solid var(--rule)", padding: "16px 18px" }}>
              <div className="display" style={{ fontSize: 32, color: "var(--ink)", lineHeight: 1 }}>
                +{fmtNum(o.newsletter.newInRange)}
              </div>
              <div className="mono" style={{ fontSize: 10, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--dim)", marginTop: 10 }}>
                New in range
              </div>
            </div>
          </div>
          <Panel title="Signup sources">
            <BarList items={o.newsletter.bySource} emptyLabel="No subscribers yet." />
          </Panel>
        </div>
        <Panel title="Recent sends">
          {o.newsletter.recentSends.length === 0 ? (
            <p className="serif" style={{ fontSize: 13, color: "var(--dim)", fontStyle: "italic" }}>
              No newsletter sends recorded.
            </p>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table className="mono" style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
                <thead>
                  <tr>
                    <th style={headCell}>Edition</th>
                    <th style={{ ...headCell, textAlign: "right" }}>Recipients</th>
                    <th style={headCell}>Provider</th>
                  </tr>
                </thead>
                <tbody>
                  {o.newsletter.recentSends.map((s, i) => (
                    <tr key={`${s.date}-${i}`}>
                      <td style={cell}>{s.date || "—"}</td>
                      <td style={numCell}>{fmtNum(s.recipients)}</td>
                      <td style={{ ...cell, color: "var(--muted)" }}>{s.provider}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      </section>
    </AdminShell>
  );
}

// Compact leaderboard table shared by top / underperforming stories.
function ItemTable({
  rows,
  cols,
  emptyLabel,
}: {
  rows: { title: string; section: string | null; a: number; b: number; c?: number }[];
  cols: string[];
  emptyLabel: string;
}) {
  if (rows.length === 0) {
    return (
      <p className="serif" style={{ fontSize: 13, color: "var(--dim)", fontStyle: "italic" }}>
        {emptyLabel}
      </p>
    );
  }
  return (
    <div style={{ overflowX: "auto" }}>
      <table className="mono" style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
        <thead>
          <tr>
            <th style={headCell}>Story</th>
            {cols.map((c) => (
              <th key={c} style={{ ...headCell, textAlign: "right" }}>
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              <td style={{ ...cell, maxWidth: 260 }}>
                <span
                  style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "var(--ink)" }}
                  title={r.title}
                >
                  {r.title}
                </span>
                {r.section ? (
                  <span style={{ fontSize: 10, color: "var(--dim)", letterSpacing: "0.06em" }}>
                    {SECTION_SHORT[r.section] ?? r.section}
                  </span>
                ) : null}
              </td>
              <td style={numCell}>{r.a}</td>
              <td style={numCell}>{r.b}</td>
              {cols.length > 2 ? <td style={numCell}>{r.c ?? 0}</td> : null}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
