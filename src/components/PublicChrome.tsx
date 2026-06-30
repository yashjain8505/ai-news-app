import { SITE } from "@/lib/seo";

// Shared masthead + section nav + footer for the public (logged-out) pages.
// Plain anchors keep it server-only and fully crawlable.
const NAV = [
  { key: "daily", label: "Daily AI" },
  { key: "funding", label: "Funding" },
  { key: "tools", label: "New Tools" },
  { key: "articles", label: "Articles" },
];

export default function PublicChrome({
  children,
  subtitle,
}: {
  children: React.ReactNode;
  subtitle?: string;
}) {
  return (
    <main className="bs-main" style={{ position: "relative" }}>
      <header style={{ paddingTop: 18 }}>
        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
          <a href="/" style={{ textDecoration: "none", display: "inline-flex", alignItems: "flex-end", gap: 12 }}>
            <span style={{ display: "inline-flex", alignItems: "flex-end", gap: 3, paddingBottom: 6 }}>
              <span style={{ width: 6, height: 13, background: "var(--accent)" }} />
              <span style={{ width: 6, height: 22, background: "var(--accent)" }} />
              <span style={{ width: 6, height: 31, background: "var(--accent)" }} />
            </span>
            <span className="display" style={{ fontSize: "clamp(34px,5vw,50px)", lineHeight: 0.9, letterSpacing: "0.13em", textTransform: "uppercase", color: "var(--ink)" }}>
              Signal
            </span>
          </a>
          <a
            href="/welcome"
            className="mono"
            style={{ fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase", padding: "8px 14px", border: "1px solid var(--accent)", color: "var(--accent)", textDecoration: "none" }}
          >
            Personalize &#8599;
          </a>
        </div>
        <div className="mono" style={{ fontSize: 10, letterSpacing: "0.22em", textTransform: "uppercase", color: "var(--dim)", marginTop: 12 }}>
          {subtitle ?? SITE.tagline}
        </div>
        <div style={{ borderTop: "3px solid var(--ruleStrong)", marginTop: 14 }} />
        <nav style={{ display: "flex", gap: 22, flexWrap: "wrap", padding: "12px 0 0" }}>
          {NAV.map((n) => (
            <a
              key={n.key}
              href={`/section/${n.key}`}
              className="mono"
              style={{ fontSize: 12, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--dim)", textDecoration: "none" }}
            >
              {n.label}
            </a>
          ))}
        </nav>
      </header>

      <div style={{ marginTop: 28 }}>{children}</div>

      <footer className="mono" style={{ marginTop: 64, borderTop: "3px double var(--ruleStrong)", paddingTop: 18, display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 11, color: "var(--faint)", flexWrap: "wrap", gap: 8 }}>
        <span style={{ textTransform: "uppercase" }}>
          {SITE.name} &mdash; {SITE.tagline}
        </span>
        <a href="/welcome" style={{ color: "var(--accent)", textDecoration: "none" }}>
          Get your personalized edition &rarr;
        </a>
      </footer>
    </main>
  );
}
