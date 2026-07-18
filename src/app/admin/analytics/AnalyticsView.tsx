// Presentational view for the simplified analytics page — a clean mirror of the
// Google Analytics basics. Pure/props-only so it can be previewed with sample
// data. No product/engagement tables, no AI essay — just numbers, where-from,
// countries & cities, top pages, devices, and top search queries.

import type { SimpleAnalytics } from "@/lib/simpleAnalytics";
import { RANGE_PRESETS } from "@/lib/simpleAnalytics";
import { fmtNum, fmtDuration, BarList, Panel, Notice } from "./charts";

const kicker: React.CSSProperties = {
  fontSize: 10,
  letterSpacing: "0.14em",
  textTransform: "uppercase",
  color: "var(--dim)",
};

const twoCol: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
  gap: 14,
};

function fmtIstUtc(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const o: Intl.DateTimeFormatOptions = {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  };
  return `${d.toLocaleString("en-GB", { ...o, timeZone: "Asia/Kolkata" })} IST · ${d.toLocaleString("en-GB", { ...o, timeZone: "UTC" })} UTC`;
}

function Stat({
  label,
  value,
  delta,
  showDelta,
}: {
  label: string;
  value: string;
  delta: number | null;
  showDelta: boolean;
}) {
  let chip: React.ReactNode = null;
  if (showDelta) {
    if (delta === null) chip = <span style={{ color: "var(--accent)" }}>new</span>;
    else if (delta !== 0)
      chip = (
        <span style={{ color: delta > 0 ? "var(--accent)" : "var(--dim)" }}>
          {delta > 0 ? "▲" : "▼"} {Math.abs(delta)}%
        </span>
      );
  }
  return (
    <div style={{ border: "1px solid var(--rule)", padding: "14px 16px" }}>
      <div className="display" style={{ fontSize: 30, lineHeight: 1, color: "var(--ink)" }}>
        {value}
      </div>
      <div className="mono" style={{ fontSize: 10, letterSpacing: "0.06em", marginTop: 7, minHeight: 12 }}>
        {chip} {showDelta && (chip ? <span style={{ color: "var(--dim)" }}>vs prev</span> : null)}
      </div>
      <div className="mono" style={{ ...kicker, marginTop: 6 }}>
        {label}
      </div>
    </div>
  );
}

export function AnalyticsView({
  data,
  takeaway,
}: {
  data: SimpleAnalytics;
  takeaway?: string | null;
}) {
  const { ga, queries, rangeKey } = data;
  const showDelta = rangeKey !== "today"; // "today" is a partial day — no honest delta

  return (
    <div>
      {/* range tabs + freshness */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 12,
          flexWrap: "wrap",
          marginBottom: 18,
        }}
      >
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {RANGE_PRESETS.map((r) => {
            const on = r.key === rangeKey;
            return (
              <a
                key={r.key}
                href={`/admin/analytics?range=${r.key}`}
                className="mono"
                style={{
                  fontSize: 11,
                  letterSpacing: "0.06em",
                  textTransform: "uppercase",
                  padding: "7px 13px",
                  textDecoration: "none",
                  border: `1px solid ${on ? "var(--accent)" : "var(--rule)"}`,
                  background: on ? "var(--accent)" : "transparent",
                  color: on ? "var(--onAccent)" : "var(--muted)",
                }}
              >
                {r.label}
              </a>
            );
          })}
        </div>
        <span className="mono" style={{ fontSize: 10, letterSpacing: "0.05em", color: "var(--dim)" }}>
          as of {fmtIstUtc(data.generatedAt)}
        </span>
      </div>

      {/* one-line AI takeaway */}
      {takeaway ? (
        <p
          className="serif"
          style={{
            fontSize: 15,
            lineHeight: 1.4,
            color: "var(--ink)",
            margin: "0 0 22px",
            paddingLeft: 12,
            borderLeft: "3px solid var(--accent)",
          }}
        >
          {takeaway}
        </p>
      ) : null}

      {!ga.configured ? (
        <Notice>
          Google Analytics isn&rsquo;t connected. Set{" "}
          <span className="mono">GA4_PROPERTY_ID</span> and a service-account key in
          Vercel to light this up.
        </Notice>
      ) : ga.error ? (
        <Notice tone="accent">GA request failed: {ga.error}</Notice>
      ) : (
        <>
          {/* headline numbers */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
              gap: 12,
              marginBottom: 24,
            }}
          >
            <Stat label="Visitors" value={fmtNum(ga.users.value)} delta={ga.users.deltaPct} showDelta={showDelta} />
            <Stat label="Sessions" value={fmtNum(ga.sessions.value)} delta={ga.sessions.deltaPct} showDelta={showDelta} />
            <Stat label="New visitors" value={fmtNum(ga.newUsers.value)} delta={ga.newUsers.deltaPct} showDelta={showDelta} />
            <Stat label="Avg. time" value={fmtDuration(ga.avgEngagementSec.value)} delta={ga.avgEngagementSec.deltaPct} showDelta={showDelta} />
          </div>

          {/* where from + countries */}
          <div style={{ ...twoCol, marginBottom: 14 }}>
            <Panel title="Where they come from">
              <BarList items={ga.channels} emptyLabel="No traffic in this period." />
            </Panel>
            <Panel title="Countries">
              <BarList items={ga.countries} emptyLabel="No data yet." />
            </Panel>
          </div>

          {/* cities + devices */}
          <div style={{ ...twoCol, marginBottom: 14 }}>
            <Panel title="Cities">
              <BarList items={ga.cities} emptyLabel="No data yet." />
            </Panel>
            <Panel title="Devices">
              <BarList items={ga.devices} emptyLabel="No data yet." />
            </Panel>
          </div>

          {/* top pages */}
          <Panel title="Top pages" style={{ marginBottom: 14 }}>
            <BarList
              items={ga.pages.map((p) => ({ name: p.path, value: p.views }))}
              emptyLabel="No page views in this period."
            />
          </Panel>
        </>
      )}

      {/* search queries */}
      <Panel title={`Top search queries · ${queries.windowLabel}`}>
        {!queries.configured ? (
          <p className="serif" style={{ fontSize: 13, color: "var(--dim)", fontStyle: "italic" }}>
            Search Console not connected — see the Search tab.
          </p>
        ) : queries.error ? (
          <p className="serif" style={{ fontSize: 13, color: "var(--accent)" }}>{queries.error}</p>
        ) : queries.rows.length === 0 ? (
          <p className="serif" style={{ fontSize: 13, color: "var(--dim)", fontStyle: "italic" }}>
            No query data yet (Search Console has a ~2-day lag).
          </p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div className="mono" style={{ display: "flex", justifyContent: "space-between", ...kicker }}>
              <span>Query</span>
              <span>Clicks · Impressions</span>
            </div>
            {queries.rows.map((q, i) => (
              <div
                key={i}
                style={{ display: "flex", justifyContent: "space-between", gap: 12, borderTop: i ? "1px solid var(--rule)" : "none", paddingTop: i ? 8 : 0 }}
              >
                <span className="serif" style={{ fontSize: 13.5, color: "var(--ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={q.query}>
                  {q.query}
                </span>
                <span className="mono" style={{ fontSize: 12.5, color: "var(--muted)", flexShrink: 0 }}>
                  {fmtNum(q.clicks)} · {fmtNum(q.impressions)}
                </span>
              </div>
            ))}
          </div>
        )}
      </Panel>
    </div>
  );
}
