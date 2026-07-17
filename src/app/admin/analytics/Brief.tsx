// The AI analyst brief panel — now display-only. The brief is generated
// out-of-band by the analytics-brief GitHub workflow (the `claude` CLI running
// on your Claude subscription token) and stored in Supabase; this just renders
// the latest one. No client JS, no in-app LLM call, no API key.

import type { StoredBrief } from "@/lib/brief";

const label: React.CSSProperties = {
  fontSize: 10,
  letterSpacing: "0.14em",
  textTransform: "uppercase",
  color: "var(--dim)",
};

function fmtIstUtc(iso: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
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

function List({ title, items }: { title: string; items: string[] }) {
  if (!items || items.length === 0) return null;
  return (
    <div>
      <div className="mono" style={{ ...label, marginBottom: 8 }}>
        {title}
      </div>
      <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 7 }}>
        {items.map((t, i) => (
          <li
            key={i}
            className="serif"
            style={{ fontSize: 14, color: "var(--ink)", paddingLeft: 16, position: "relative", lineHeight: 1.4 }}
          >
            <span style={{ position: "absolute", left: 0, color: "var(--accent)" }}>—</span>
            {t}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function Brief({ stored }: { stored: StoredBrief | null }) {
  return (
    <div style={{ border: "1px solid var(--ruleStrong)", padding: "18px 20px" }}>
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          gap: 14,
          flexWrap: "wrap",
        }}
      >
        <div className="mono" style={{ ...label, color: "var(--accent)" }}>
          AI analyst brief
        </div>
        {stored ? (
          <div className="mono" style={{ fontSize: 10, letterSpacing: "0.06em", color: "var(--dim)" }}>
            {stored.range}-day · generated {fmtIstUtc(stored.generatedAt)}
            {stored.model ? ` · ${stored.model}` : ""}
          </div>
        ) : null}
      </div>

      {!stored ? (
        <p
          className="serif"
          style={{ fontSize: 13.5, color: "var(--muted)", marginTop: 14, marginBottom: 0 }}
        >
          No brief generated yet. The <span className="mono">analytics-brief</span>{" "}
          workflow writes one on its next run (daily), or you can trigger it manually
          from the repo&rsquo;s Actions tab. It runs on your Claude subscription token —
          no API key.
        </p>
      ) : (
        <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 18 }}>
          <p
            className="display"
            style={{ fontSize: 19, lineHeight: 1.25, color: "var(--ink)", margin: 0 }}
          >
            {stored.brief.headline}
          </p>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
              gap: 20,
            }}
          >
            <List title="Working" items={stored.brief.working} />
            <List title="Not working" items={stored.brief.notWorking} />
          </div>

          {stored.brief.doNext?.length ? (
            <div>
              <div className="mono" style={{ ...label, marginBottom: 8 }}>
                Do next
              </div>
              <ol style={{ margin: 0, paddingLeft: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 12 }}>
                {stored.brief.doNext.map((d, i) => (
                  <li key={i} style={{ display: "flex", gap: 12 }}>
                    <span
                      className="display"
                      style={{ fontSize: 18, color: "var(--accent)", lineHeight: 1.2, flexShrink: 0 }}
                    >
                      {i + 1}
                    </span>
                    <div>
                      <div className="serif" style={{ fontSize: 14.5, color: "var(--ink)", fontWeight: 600, lineHeight: 1.35 }}>
                        {d.action}
                      </div>
                      {d.why ? (
                        <div className="serif" style={{ fontSize: 13, color: "var(--muted)", marginTop: 2, lineHeight: 1.35 }}>
                          {d.why}
                        </div>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          ) : null}

          {stored.brief.caveat ? (
            <p className="mono" style={{ fontSize: 11, color: "var(--dim)", margin: 0, letterSpacing: "0.04em" }}>
              ⚠ {stored.brief.caveat}
            </p>
          ) : null}
        </div>
      )}
    </div>
  );
}
