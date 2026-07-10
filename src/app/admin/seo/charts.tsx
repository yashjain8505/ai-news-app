// Presentational chart + table primitives for the SEO dashboard.
//
// Deliberately dependency-free: hand-rolled inline SVG + CSS bars driven by the
// design-system CSS vars (--accent, --ink, --dim, --rule…), so they theme with
// light/dark and add nothing to the bundle. All server components — no
// interactivity here. Mirrors admin/analytics/charts.tsx so the two dashboards
// look like one product; adds SEO-specific bits (a position KPI where LOWER is
// better, and query/page tables with rank-movement deltas).

import type { Kpi, SeoQuery, SeoPage } from "@/lib/seoData";

// --- formatting --------------------------------------------------------------

export function fmtNum(n: number): string {
  if (!Number.isFinite(n)) return "—";
  if (Math.abs(n) >= 10000) return `${(n / 1000).toFixed(n >= 100000 ? 0 : 1)}k`;
  return Math.round(n).toLocaleString("en-US");
}

export function fmtPct(ratio: number): string {
  return `${(ratio * 100).toFixed(ratio < 0.1 ? 1 : 0)}%`;
}

export function fmtPos(pos: number): string {
  return pos > 0 ? pos.toFixed(1) : "—";
}

// --- shared style tokens -----------------------------------------------------

const label: React.CSSProperties = {
  fontSize: 10,
  letterSpacing: "0.14em",
  textTransform: "uppercase",
  color: "var(--dim)",
};

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

// --- Section header ----------------------------------------------------------

export function SectionTitle({
  kicker,
  title,
  note,
}: {
  kicker: string;
  title: string;
  note?: string;
}) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div className="mono" style={{ ...label, color: "var(--accent)" }}>
        {kicker}
      </div>
      <h2 className="display" style={{ fontSize: 22, lineHeight: 1.05, color: "var(--ink)", margin: "6px 0 0" }}>
        {title}
      </h2>
      {note ? (
        <p className="serif" style={{ fontSize: 13, color: "var(--muted)", margin: "6px 0 0" }}>
          {note}
        </p>
      ) : null}
    </div>
  );
}

export function Panel({
  children,
  title,
  hint,
  style,
}: {
  children: React.ReactNode;
  title?: string;
  hint?: string;
  style?: React.CSSProperties;
}) {
  return (
    <div style={{ border: "1px solid var(--rule)", padding: "16px 18px", ...style }}>
      {title ? (
        <div style={{ marginBottom: 14 }}>
          <div className="mono" style={label}>
            {title}
          </div>
          {hint ? (
            <div className="serif" style={{ fontSize: 12, color: "var(--muted)", marginTop: 4 }}>
              {hint}
            </div>
          ) : null}
        </div>
      ) : null}
      {children}
    </div>
  );
}

export function Notice({
  tone = "muted",
  children,
}: {
  tone?: "muted" | "accent";
  children: React.ReactNode;
}) {
  return (
    <p
      className="serif"
      style={{
        fontSize: 13.5,
        color: tone === "accent" ? "var(--accent)" : "var(--muted)",
        border: "1px solid var(--rule)",
        borderLeft: `3px solid ${tone === "accent" ? "var(--accent)" : "var(--rule)"}`,
        padding: "12px 14px",
        margin: 0,
        overflowWrap: "anywhere",
      }}
    >
      {children}
    </p>
  );
}

// --- Stat card with period-over-period delta ---------------------------------

// `lowerIsBetter` flips the good/bad reading for average position: a drop in
// position is an improvement, so it shows the "up/good" accent, not a decline.
export function StatCard({
  label: name,
  kpi,
  format = "num",
  lowerIsBetter = false,
  hint,
}: {
  label: string;
  kpi: Kpi;
  format?: "num" | "pct" | "position";
  lowerIsBetter?: boolean;
  hint?: string;
}) {
  const value =
    format === "position" ? fmtPos(kpi.value) : format === "pct" ? fmtPct(kpi.value) : fmtNum(kpi.value);

  let delta: React.ReactNode;
  if (kpi.deltaPct === null) {
    delta = <span style={{ color: "var(--accent)" }}>new</span>;
  } else if (kpi.deltaPct === 0) {
    delta = <span style={{ color: "var(--dim)" }}>0%</span>;
  } else {
    const rose = kpi.deltaPct > 0;
    const improved = lowerIsBetter ? !rose : rose;
    delta = (
      <span style={{ color: improved ? "var(--accent)" : "var(--dim)" }}>
        {rose ? "▲" : "▼"} {Math.abs(kpi.deltaPct)}%
      </span>
    );
  }

  return (
    <div style={{ border: "1px solid var(--rule)", padding: "16px 18px" }}>
      <div className="display" style={{ fontSize: 32, lineHeight: 1, color: "var(--ink)" }}>
        {value}
      </div>
      <div className="mono" style={{ fontSize: 10, letterSpacing: "0.07em", marginTop: 8 }}>
        {delta} <span style={{ color: "var(--dim)" }}>vs prev</span>
      </div>
      <div className="mono" style={{ ...label, marginTop: 10 }}>
        {name}
      </div>
      {hint ? (
        <div className="serif" style={{ fontSize: 11, color: "var(--muted)", marginTop: 6, lineHeight: 1.3 }}>
          {hint}
        </div>
      ) : null}
    </div>
  );
}

// --- Sparkline (single series) -----------------------------------------------

export function Sparkline({
  points,
  height = 72,
  emptyLabel = "Not enough data for a trend yet.",
}: {
  points: { date: string; value: number }[];
  height?: number;
  emptyLabel?: string;
}) {
  if (points.length < 2) {
    return (
      <p className="serif" style={{ fontSize: 13, color: "var(--dim)", fontStyle: "italic" }}>
        {emptyLabel}
      </p>
    );
  }
  const W = 100;
  const H = height;
  const max = Math.max(...points.map((p) => p.value), 1);
  const stepX = W / (points.length - 1);
  const coords = points.map((p, i) => {
    const x = i * stepX;
    const y = H - 4 - (p.value / max) * (H - 12);
    return [x, y] as const;
  });
  const line = coords.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`).join(" ");
  const area = `${line} L${W},${H} L0,${H} Z`;
  const total = points.reduce((a, p) => a + p.value, 0);
  const peak = Math.max(...points.map((p) => p.value));

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ width: "100%", height, display: "block" }} aria-hidden>
        <path d={area} fill="var(--accent)" opacity={0.1} />
        <path
          d={line}
          fill="none"
          stroke="var(--accent)"
          strokeWidth={1.4}
          vectorEffect="non-scaling-stroke"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      </svg>
      <div
        className="mono"
        style={{ display: "flex", justifyContent: "space-between", fontSize: 10, letterSpacing: "0.06em", color: "var(--dim)", marginTop: 6 }}
      >
        <span>{points[0].date.slice(5)}</span>
        <span>Σ {fmtNum(total)} · peak {fmtNum(peak)}</span>
        <span>{points[points.length - 1].date.slice(5)}</span>
      </div>
    </div>
  );
}

// --- rank-movement delta -----------------------------------------------------

// Lower position = better, so prev-minus-now positive means the rank improved
// (moved up the page). Renders a small colored delta, or nothing when we have no
// prior baseline.
function PosDelta({ position, prev }: { position: number; prev: number | null }) {
  // No prior-period baseline → show nothing (a " new" tag on every row is noise
  // while the whole site is new to Search, and it clips the column edge).
  if (prev === null) return null;
  const improved = prev - position; // >0 = moved up
  if (Math.abs(improved) < 0.5) return null;
  const up = improved > 0;
  return (
    <span style={{ color: up ? "var(--accent)" : "var(--dim)", fontSize: 10 }}>
      {" "}
      {up ? "▲" : "▼"}
      {Math.abs(improved).toFixed(0)}
    </span>
  );
}

// --- query + page tables -----------------------------------------------------

function TruncCell({ text, title, href }: { text: string; title?: string; href?: string }) {
  const inner = (
    <span
      style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "var(--ink)", maxWidth: 320 }}
      title={title ?? text}
    >
      {text}
    </span>
  );
  return (
    <td style={{ ...cell, maxWidth: 320 }}>
      {href ? (
        <a href={href} target="_blank" rel="noreferrer" style={{ color: "var(--ink)", textDecoration: "none" }}>
          {inner}
        </a>
      ) : (
        inner
      )}
    </td>
  );
}

export function QueryTable({
  rows,
  emptyLabel,
}: {
  rows: SeoQuery[];
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
      <table className="mono" style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
        <thead>
          <tr>
            <th style={headCell}>Query</th>
            <th style={{ ...headCell, textAlign: "right" }}>Clk</th>
            <th style={{ ...headCell, textAlign: "right" }}>Impr</th>
            <th style={{ ...headCell, textAlign: "right" }}>CTR</th>
            <th style={{ ...headCell, textAlign: "right" }}>Pos</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={`${r.query}-${i}`}>
              <TruncCell text={r.query} />
              <td style={numCell}>{r.clicks}</td>
              <td style={numCell}>{fmtNum(r.impressions)}</td>
              <td style={{ ...numCell, color: "var(--muted)" }}>{fmtPct(r.ctr)}</td>
              <td style={numCell}>
                {fmtPos(r.position)}
                <PosDelta position={r.position} prev={r.prevPosition} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function PageTable({
  rows,
  emptyLabel,
}: {
  rows: SeoPage[];
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
      <table className="mono" style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
        <thead>
          <tr>
            <th style={headCell}>Page</th>
            <th style={{ ...headCell, textAlign: "right" }}>Clk</th>
            <th style={{ ...headCell, textAlign: "right" }}>Impr</th>
            <th style={{ ...headCell, textAlign: "right" }}>CTR</th>
            <th style={{ ...headCell, textAlign: "right" }}>Pos</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={`${r.path}-${i}`}>
              <TruncCell text={r.path} title={r.url} href={r.url} />
              <td style={numCell}>{r.clicks}</td>
              <td style={numCell}>{fmtNum(r.impressions)}</td>
              <td style={{ ...numCell, color: "var(--muted)" }}>{fmtPct(r.ctr)}</td>
              <td style={numCell}>
                {fmtPos(r.position)}
                <PosDelta position={r.position} prev={r.prevPosition} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
