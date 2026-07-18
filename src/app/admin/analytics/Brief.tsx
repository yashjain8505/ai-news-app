// The AI analyst brief — a compact, glanceable card. The brief is generated
// out-of-band by the analytics-brief GitHub workflow (the `claude` CLI on your
// Claude subscription token) and stored in Supabase; this just renders the
// latest one. No client JS, no in-app LLM call, no API key.

import type { StoredBrief } from "@/lib/brief";

const kicker: React.CSSProperties = {
  fontSize: 10,
  letterSpacing: "0.16em",
  textTransform: "uppercase",
};

function fmtIstUtc(iso: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const o: Intl.DateTimeFormatOptions = {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  };
  return `${d.toLocaleString("en-GB", { ...o, timeZone: "Asia/Kolkata" })} IST`;
}

// A short-bullet column. `tone` colors the leading marker: accent (red) draws the
// eye to problems, dim stays quiet for what's fine.
function Column({
  title,
  items,
  tone,
}: {
  title: string;
  items: string[];
  tone: "ok" | "warn";
}) {
  if (!items || items.length === 0) return null;
  const mark = tone === "warn" ? "var(--accent)" : "var(--dim)";
  return (
    <div>
      <div className="mono" style={{ ...kicker, color: "var(--dim)", marginBottom: 9 }}>
        {title}
      </div>
      <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 6 }}>
        {items.map((t, i) => (
          <li
            key={i}
            className="serif"
            style={{ fontSize: 13.5, lineHeight: 1.35, color: "var(--ink)", display: "flex", gap: 8 }}
          >
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

export function Brief({ stored }: { stored: StoredBrief | null }) {
  return (
    <div style={{ border: "1px solid var(--rule)", padding: "16px 18px" }}>
      {/* header */}
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          gap: 12,
          flexWrap: "wrap",
          marginBottom: stored ? 12 : 0,
        }}
      >
        <div className="mono" style={{ ...kicker, color: "var(--accent)" }}>
          AI brief
        </div>
        {stored ? (
          <div className="mono" style={{ fontSize: 10, letterSpacing: "0.05em", color: "var(--dim)" }}>
            {stored.range}d · {fmtIstUtc(stored.generatedAt)}
          </div>
        ) : null}
      </div>

      {!stored ? (
        <p className="serif" style={{ fontSize: 13, color: "var(--muted)", margin: "10px 0 0" }}>
          No brief yet. It generates daily (or run the{" "}
          <span className="mono">analytics-brief</span> workflow) — on your Claude
          subscription, no API key.
        </p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {/* headline */}
          <p className="serif" style={{ fontSize: 16, lineHeight: 1.35, color: "var(--ink)", margin: 0, fontWeight: 600 }}>
            {stored.brief.headline}
          </p>

          {/* working / needs attention */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
              gap: 18,
            }}
          >
            <Column title="Working" items={stored.brief.working} tone="ok" />
            <Column title="Needs attention" items={stored.brief.notWorking} tone="warn" />
          </div>

          {/* do next */}
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
                      {d.why ? (
                        <span style={{ color: "var(--dim)" }}> — {d.why}</span>
                      ) : null}
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
        </div>
      )}
    </div>
  );
}
