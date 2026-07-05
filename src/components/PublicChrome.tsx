import { SITE } from "@/lib/seo";

// Shared masthead + section nav + footer for the public (logged-out) pages.
// Plain anchors keep it server-only and fully crawlable.
const NAV = [
  { key: "daily", href: "/daily-ai", label: "Daily AI" },
  { key: "funding", href: "/funding", label: "Funding" },
  { key: "tools", href: "/new-tools", label: "New Tools" },
  { key: "articles", href: "/articles", label: "Articles" },
  { key: "archive", href: "/editions", label: "Archive" },
];

export default function PublicChrome({
  children,
  subtitle,
  active,
}: {
  children: React.ReactNode;
  subtitle?: string;
  active?: string;
}) {
  return (
    <main className="bs-main" style={{ position: "relative" }}>
      <header style={{ paddingTop: 18 }}>
        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
          <a href="/" style={{ textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 12 }}>
            <span aria-hidden className="display" style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 40, height: 40, background: "var(--accent)", color: "var(--onAccent)", fontSize: 28, lineHeight: 1 }}>
              W
            </span>
            <span className="display" style={{ fontSize: "clamp(34px,5vw,50px)", lineHeight: 0.9, letterSpacing: "0.13em", textTransform: "uppercase", color: "var(--ink)" }}>
              {SITE.name}
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
          {NAV.map((n) => {
            const on = n.key === active;
            return (
              <a
                key={n.href}
                href={n.href}
                className="mono"
                style={{ fontSize: 12, letterSpacing: "0.12em", textTransform: "uppercase", color: on ? "var(--accent)" : "var(--dim)", textDecoration: "none", borderBottom: on ? "2px solid var(--accent)" : "2px solid transparent", paddingBottom: 4 }}
              >
                {n.label}
              </a>
            );
          })}
        </nav>
      </header>

      <div style={{ marginTop: 28 }}>{children}</div>

      <footer className="mono" style={{ marginTop: 64, borderTop: "3px double var(--ruleStrong)", paddingTop: 18, display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 11, color: "var(--faint)", flexWrap: "wrap", gap: 12 }}>
        <span style={{ textTransform: "uppercase" }}>
          {SITE.name} &mdash; {SITE.tagline}
        </span>
        <nav style={{ display: "flex", gap: 18, flexWrap: "wrap", alignItems: "center" }}>
          <a href="/about" style={{ color: "var(--dim)", textDecoration: "none" }}>About</a>
          <a href="/contact" style={{ color: "var(--dim)", textDecoration: "none" }}>Contact</a>
          <a href="/editions" style={{ color: "var(--dim)", textDecoration: "none" }}>Archive</a>
          <a href="/welcome" style={{ color: "var(--accent)", textDecoration: "none" }}>Personalize &rarr;</a>
        </nav>
      </footer>
    </main>
  );
}
