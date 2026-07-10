// Presentational chart + stat primitives for the analytics dashboard.
//
// Deliberately dependency-free: every chart is hand-rolled inline SVG or CSS
// bars driven by the design-system CSS vars (--accent, --ink, --dim, --rule…),
// so they theme with light/dark automatically and add nothing to the bundle.
// All server components — no interactivity lives here.

import type { Kpi } from "@/lib/analyticsData";

// --- formatting --------------------------------------------------------------

export function fmtNum(n: number): string {
  if (!Number.isFinite(n)) return "—";
  if (Math.abs(n) >= 10000) return `${(n / 1000).toFixed(n >= 100000 ? 0 : 1)}k`;
  return Math.round(n).toLocaleString("en-US");
}

export function fmtDuration(sec: number): string {
  if (!sec || sec < 1) return "0s";
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

export function fmtPctRate(ratio: number): string {
  return `${Math.round(ratio * 100)}%`;
}

// --- shared style tokens -----------------------------------------------------

const label: React.CSSProperties = {
  fontSize: 10,
  letterSpacing: "0.14em",
  textTransform: "uppercase",
  color: "var(--dim)",
};

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
      <h2
        className="display"
        style={{
          fontSize: 22,
          lineHeight: 1.05,
          color: "var(--ink)",
          margin: "6px 0 0",
        }}
      >
        {title}
      </h2>
      {note ? (
        <p
          className="serif"
          style={{ fontSize: 13, color: "var(--muted)", margin: "6px 0 0" }}
        >
          {note}
        </p>
      ) : null}
    </div>
  );
}

// A bordered panel container matching the admin card look.
export function Panel({
  children,
  title,
  style,
}: {
  children: React.ReactNode;
  title?: string;
  style?: React.CSSProperties;
}) {
  return (
    <div style={{ border: "1px solid var(--rule)", padding: "16px 18px", ...style }}>
      {title ? (
        <div className="mono" style={{ ...label, marginBottom: 14 }}>
          {title}
        </div>
      ) : null}
      {children}
    </div>
  );
}

// --- Stat card with period-over-period delta ---------------------------------

export function StatCard({
  label: name,
  kpi,
  format = "num",
}: {
  label: string;
  kpi: Kpi;
  format?: "num" | "duration" | "rate";
}) {
  const value =
    format === "duration"
      ? fmtDuration(kpi.value)
      : format === "rate"
      ? fmtPctRate(kpi.value)
      : fmtNum(kpi.value);

  let delta: React.ReactNode = null;
  if (kpi.deltaPct === null) {
    delta = (
      <span style={{ color: "var(--accent)" }}>new</span>
    );
  } else if (kpi.deltaPct !== 0) {
    const up = kpi.deltaPct > 0;
    delta = (
      <span style={{ color: up ? "var(--accent)" : "var(--dim)" }}>
        {up ? "▲" : "▼"} {Math.abs(kpi.deltaPct)}%
      </span>
    );
  } else {
    delta = <span style={{ color: "var(--dim)" }}>0%</span>;
  }

  return (
    <div style={{ border: "1px solid var(--rule)", padding: "16px 18px" }}>
      <div
        className="display"
        style={{ fontSize: 32, lineHeight: 1, color: "var(--ink)" }}
      >
        {value}
      </div>
      <div
        className="mono"
        style={{ fontSize: 10, letterSpacing: "0.07em", marginTop: 8 }}
      >
        {delta}{" "}
        <span style={{ color: "var(--dim)" }}>vs prev</span>
      </div>
      <div className="mono" style={{ ...label, marginTop: 10 }}>
        {name}
      </div>
    </div>
  );
}

// --- Horizontal bar list -----------------------------------------------------

export function BarList({
  items,
  emptyLabel = "No data yet",
  format = "num",
}: {
  items: { name: string; value: number }[];
  emptyLabel?: string;
  format?: "num" | "duration";
}) {
  if (items.length === 0) {
    return (
      <p
        className="serif"
        style={{ fontSize: 13, color: "var(--dim)", fontStyle: "italic" }}
      >
        {emptyLabel}
      </p>
    );
  }
  const max = Math.max(...items.map((i) => i.value), 1);
  const fmt = format === "duration" ? fmtDuration : fmtNum;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
      {items.map((it, i) => (
        <div key={`${it.name}-${i}`}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              gap: 10,
              marginBottom: 3,
            }}
          >
            <span
              className="mono"
              style={{
                fontSize: 12,
                color: "var(--ink)",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
              title={it.name}
            >
              {it.name}
            </span>
            <span
              className="mono"
              style={{ fontSize: 12, color: "var(--muted)", flexShrink: 0 }}
            >
              {fmt(it.value)}
            </span>
          </div>
          <div style={{ height: 6, background: "var(--rule)", overflow: "hidden" }}>
            <div
              style={{
                height: "100%",
                width: `${Math.max(2, (it.value / max) * 100)}%`,
                background: "var(--accent)",
              }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

// --- Sparkline / area line ---------------------------------------------------

export function Sparkline({
  points,
  height = 72,
}: {
  points: { date: string; value: number }[];
  height?: number;
}) {
  if (points.length < 2) {
    return (
      <p
        className="serif"
        style={{ fontSize: 13, color: "var(--dim)", fontStyle: "italic" }}
      >
        Not enough data for a trend yet.
      </p>
    );
  }
  const W = 100; // viewBox width units; scales to container via width:100%
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
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        style={{ width: "100%", height, display: "block" }}
        aria-hidden
      >
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
        style={{
          display: "flex",
          justifyContent: "space-between",
          fontSize: 10,
          letterSpacing: "0.06em",
          color: "var(--dim)",
          marginTop: 6,
        }}
      >
        <span>{points[0].date.slice(5)}</span>
        <span>
          Σ {fmtNum(total)} · peak {fmtNum(peak)}
        </span>
        <span>{points[points.length - 1].date.slice(5)}</span>
      </div>
    </div>
  );
}

// --- Notice banner -----------------------------------------------------------

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
