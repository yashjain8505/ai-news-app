// The analytics summary card — plain numbers first, then the AI read.
//
// The top "snapshot" (visitors, signups, where-from, best section) is computed
// live from the overview, so it's always accurate. The narrative below (headline
// / working / needs-attention / do-next) is the brief generated out-of-band by
// the analytics-brief GitHub workflow (the `claude` CLI on your Claude
// subscription token) and stored in Supabase. No client JS, no API key.

import type { StoredBrief } from "@/lib/brief";
import { fmtNum } from "./charts";

export type BriefSnapshot = {
  gaConfigured: boolean;
  visitors: number;
  visitorsDeltaPct: number | null;
  signups: number;
  activeThisWeek: number;
  subscribers: number;
  channels: { name: string; value: number }[];
  topSection: string | null;
};

const kicker: React.CSSProperties = {
  fontSize: 10,
  letterSpacing: "0.16em",
  textTransform: "uppercase",
};

function fmtIst(iso: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Kolkata",
  });
}

function Stat({ label, value, delta }: { label: string; value: string; delta?: number | null }) {
  let chip: React.ReactNode = null;
  if (delta === null) chip = <span style={{ color: "var(--accent)" }}> new</span>;
  else if (typeof delta === "number" && delta !== 0)
    chip = (
      <span style={{ color: delta > 0 ? "var(--accent)" : "var(--dim)" }}>
        {" "}
        {delta > 0 ? "▲" : "▼"}
        {Math.abs(delta)}%
      </span>
    );
  return (
    <div>
      <div className="display" style={{ fontSize: 24, lineHeight: 1, color: "var(--ink)" }}>
        {value}
        <span className="mono" style={{ fontSize: 10, letterSpacing: 0 }}>
          {chip}
        </span>
      </div>
      <div className="mono" style={{ ...kicker, color: "var(--dim)", marginTop: 6 }}>
        {label}
      </div>
    </div>
  );
}

function Column({ title, items, tone }: { title: string; items: string[]; tone: "ok" | "warn" }) {
  if (!items || items.length === 0) return null;
  const mark = tone === "warn" ? "var(--accent)" : "var(--dim)";
  return (
    <div>
      <div className="mono" style={{ ...kicker, color: "var(--dim)", marginBottom: 9 }}>
        {title}
      </div>
      <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 6 }}>
        {items.map((t, i) => (
          <li key={i} className="serif" style={{ fontSize: 13.5, lineHeight: 1.35, color: "var(--ink)", display: "flex", gap: 8 }}>
            <span aria-hidden style={{ color: mark, flexShrink: 0 }}>
              {tone === "warn" ? "△" : "•"}
            </span>
            <span>{t}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// One "label: values" line, e.g. Where from: Organic Search 47 · Direct 40.
function Line({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="serif" style={{ fontSize: 13, color: "var(--muted)", lineHeight: 1.4 }}>
      <span className="mono" style={{ ...kicker, color: "var(--dim)", marginRight: 8 }}>
        {label}
      </span>
      {children}
    </div>
  );
}

export function Brief({ stored, snapshot }: { stored: StoredBrief | null; snapshot?: BriefSnapshot }) {
  return (
    <div style={{ border: "1px solid var(--ruleStrong)", padding: "18px 20px", display: "flex", flexDirection: "column", gap: 16 }}>
      <div className="mono" style={{ ...kicker, color: "var(--accent)" }}>
        Summary
      </div>

      {/* live snapshot — always accurate, computed at load */}
      {snapshot ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ display: "flex", gap: 28, flexWrap: "wrap" }}>
            {snapshot.gaConfigured ? (
              <Stat label="Visitors" value={fmtNum(snapshot.visitors)} delta={snapshot.visitorsDeltaPct} />
            ) : null}
            <Stat label="Signups" value={fmtNum(snapshot.signups)} />
            <Stat label="Active / wk" value={fmtNum(snapshot.activeThisWeek)} />
            <Stat label="Subscribers" value={fmtNum(snapshot.subscribers)} />
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {snapshot.gaConfigured && snapshot.channels.length ? (
              <Line label="Where from">
                {snapshot.channels.map((c, i) => (
                  <span key={c.name}>
                    {i > 0 ? " · " : ""}
                    {c.name} <span style={{ color: "var(--dim)" }}>{fmtNum(c.value)}</span>
                  </span>
                ))}
              </Line>
            ) : !snapshot.gaConfigured ? (
              <Line label="Where from">
                <span style={{ color: "var(--dim)" }}>connect Google Analytics to see traffic sources</span>
              </Line>
            ) : null}
            {snapshot.topSection ? <Line label="Best section">{snapshot.topSection}</Line> : null}
          </div>
        </div>
      ) : null}

      {/* AI read */}
      <div style={{ borderTop: "1px solid var(--rule)", paddingTop: 14, display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div className="mono" style={{ ...kicker, color: "var(--dim)" }}>
            AI read
          </div>
          {stored ? (
            <div className="mono" style={{ fontSize: 10, letterSpacing: "0.05em", color: "var(--dim)" }}>
              {stored.range}d · {fmtIst(stored.generatedAt)} IST
            </div>
          ) : null}
        </div>

        {!stored ? (
          <p className="serif" style={{ fontSize: 13, color: "var(--muted)", margin: 0 }}>
            No brief yet. It generates daily (or run the{" "}
            <span className="mono">analytics-brief</span> workflow) — on your Claude
            subscription, no API key.
          </p>
        ) : (
          <>
            <p className="serif" style={{ fontSize: 16, lineHeight: 1.35, color: "var(--ink)", margin: 0, fontWeight: 600 }}>
              {stored.brief.headline}
            </p>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 18 }}>
              <Column title="Working" items={stored.brief.working} tone="ok" />
              <Column title="Needs attention" items={stored.brief.notWorking} tone="warn" />
            </div>

            {stored.brief.doNext?.length ? (
              <div>
                <div className="mono" style={{ ...kicker, color: "var(--dim)", marginBottom: 9 }}>
                  Do next
                </div>
                <ol style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 8 }}>
                  {stored.brief.doNext.map((d, i) => (
                    <li key={i} style={{ display: "flex", gap: 10, alignItems: "baseline" }}>
                      <span className="mono" style={{ fontSize: 11, color: "var(--accent)", flexShrink: 0, width: 14 }}>
                        {i + 1}
                      </span>
                      <span className="serif" style={{ fontSize: 13.5, lineHeight: 1.35, color: "var(--ink)" }}>
                        {d.action}
                        {d.why ? <span style={{ color: "var(--dim)" }}> — {d.why}</span> : null}
                      </span>
                    </li>
                  ))}
                </ol>
              </div>
            ) : null}

            {stored.brief.caveat ? (
              <p className="mono" style={{ fontSize: 10.5, color: "var(--dim)", margin: 0, letterSpacing: "0.03em", lineHeight: 1.4 }}>
                {stored.brief.caveat}
              </p>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}
