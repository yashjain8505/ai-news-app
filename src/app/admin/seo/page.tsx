import type { Metadata } from "next";
import { isAdmin, adminConfigured } from "@/lib/adminData";
import { AdminShell, AdminLogin } from "../AdminShell";
import {
  getSeoOverview,
  normalizeRange,
  SEO_RANGES,
  type SeoOverview,
  type SeoRange,
  type SeoPlay,
  type SeoDelta,
  type NamedMetric,
} from "@/lib/seoData";
import type { Sitemap } from "@/lib/gsc";
import { seoBriefConfigured, getLatestReadyBrief } from "@/lib/seoBrief";
import { Brief } from "./Brief";
import {
  StatCard,
  Notice,
  Sparkline,
  QueryTable,
  PageTable,
  SectionTitle,
  fmtNum,
  fmtPct,
  fmtPos,
} from "./charts";

// Reads request cookies + live data on every hit — never cache or prerender.
export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata: Metadata = {
  title: "Search",
  robots: { index: false, follow: false },
};

// --- views (drill-down tabs) -------------------------------------------------

const VIEWS = [
  { key: "plan", label: "Plan" },
  { key: "queries", label: "Queries" },
  { key: "pages", label: "Pages" },
  { key: "traffic", label: "Devices & countries" },
  { key: "indexing", label: "Indexing" },
] as const;
type ViewKey = (typeof VIEWS)[number]["key"];

function normalizeView(v: string | undefined): ViewKey {
  return (VIEWS as readonly { key: string }[]).some((x) => x.key === v) ? (v as ViewKey) : "plan";
}

// --- style tokens ------------------------------------------------------------

const label: React.CSSProperties = {
  fontSize: 10,
  letterSpacing: "0.14em",
  textTransform: "uppercase",
  color: "var(--dim)",
};

// Times in IST + UTC (operator is in India).
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

function fmtDate(iso: string | null): string {
  if (!iso) return "never";
  const d = new Date(iso);
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

// --- shared presentational bits ----------------------------------------------

function Kicker({ children }: { children: React.ReactNode }) {
  return (
    <div className="mono" style={{ ...label, color: "var(--accent)", marginBottom: 6 }}>
      {children}
    </div>
  );
}

function Title({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="display" style={{ fontSize: 22, lineHeight: 1.05, color: "var(--ink)", margin: "0 0 16px" }}>
      {children}
    </h2>
  );
}

const twoCol: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
  gap: 16,
};

function BarGroup({ title, items, metric }: { title: string; items: NamedMetric[]; metric: "clicks" | "impressions" }) {
  const rows = items.filter((i) => i[metric] > 0).slice(0, 6);
  const max = Math.max(...rows.map((i) => i[metric]), 1);
  return (
    <div style={{ border: "1px solid var(--rule)", padding: "14px 16px" }}>
      <div className="mono" style={{ ...label, marginBottom: 12 }}>
        {title}
      </div>
      {rows.length === 0 ? (
        <p className="serif" style={{ fontSize: 13, color: "var(--dim)", fontStyle: "italic", margin: 0 }}>
          Nothing yet.
        </p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
          {rows.map((it, i) => (
            <div key={`${it.name}-${i}`}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10, marginBottom: 3 }}>
                <span className="mono" style={{ fontSize: 12, color: "var(--ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={it.name}>
                  {it.name}
                </span>
                <span className="mono" style={{ fontSize: 12, color: "var(--muted)", flexShrink: 0 }}>
                  {fmtNum(it[metric])}
                </span>
              </div>
              <div style={{ height: 6, background: "var(--rule)", overflow: "hidden" }}>
                <div style={{ height: "100%", width: `${Math.max(2, (it[metric] / max) * 100)}%`, background: "var(--accent)" }} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function InsightList({ items, tone }: { items: string[]; tone: "good" | "bad" }) {
  const mark = tone === "good" ? "var(--accent)" : "var(--dim)";
  if (items.length === 0) {
    return (
      <p className="serif" style={{ fontSize: 13, color: "var(--dim)", fontStyle: "italic", margin: 0 }}>
        {tone === "good" ? "Nothing clearly working yet — early days." : "Nothing obviously broken in this window."}
      </p>
    );
  }
  return (
    <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 10 }}>
      {items.map((t, i) => (
        <li key={i} className="serif" style={{ fontSize: 13.5, color: "var(--ink)", lineHeight: 1.4, paddingLeft: 18, position: "relative" }}>
          <span className="mono" style={{ position: "absolute", left: 0, top: 1, fontSize: 10, color: mark }}>
            {tone === "good" ? "▲" : "▼"}
          </span>
          {t}
        </li>
      ))}
    </ul>
  );
}

// --- the ranked action list (the star of the Plan view) ----------------------

function PlayCard({ play, index }: { play: SeoPlay; index: number }) {
  return (
    <li style={{ display: "flex", gap: 16, padding: "18px 0", borderBottom: "1px solid var(--rule)" }}>
      <div className="display" style={{ fontSize: 26, lineHeight: 1, color: "var(--dim)", width: 28, flexShrink: 0, textAlign: "right" }}>
        {index + 1}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", gap: 9, alignItems: "baseline", flexWrap: "wrap", marginBottom: 6 }}>
          <span className="serif" style={{ fontSize: 16, color: "var(--ink)", fontWeight: 600, lineHeight: 1.3 }}>
            {play.action}
          </span>
          {play.perWeekClicks > 0 ? (
            <span className="mono" style={{ fontSize: 11, color: "var(--onAccent)", background: "var(--accent)", padding: "2px 7px", whiteSpace: "nowrap" }}>
              +{play.perWeekClicks}/wk est.
            </span>
          ) : null}
          <span className="mono" style={{ fontSize: 9.5, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--dim)", border: "1px solid var(--rule)", padding: "2px 6px" }}>
            {play.effort}
          </span>
        </div>
        <p className="serif" style={{ fontSize: 13.5, color: "var(--muted)", lineHeight: 1.5, margin: 0 }}>
          {play.why}
          {play.targetUrl ? (
            <>
              {" "}
              <a href={play.targetUrl} target="_blank" rel="noreferrer" className="mono" style={{ fontSize: 12, color: "var(--accent)", textDecoration: "none", whiteSpace: "nowrap" }}>
                open ↗
              </a>
            </>
          ) : null}
        </p>
      </div>
    </li>
  );
}

// --- "what changed" columns --------------------------------------------------

function ChangeCol({ title, hint, items, tone }: { title: string; hint: string; items: SeoDelta[]; tone: "up" | "down" }) {
  const mark = tone === "up" ? "var(--accent)" : "var(--dim)";
  return (
    <div style={{ border: "1px solid var(--rule)", padding: "14px 16px" }}>
      <div className="mono" style={{ ...label, marginBottom: 3 }}>
        {title}
      </div>
      <div className="serif" style={{ fontSize: 12, color: "var(--muted)", marginBottom: 10, lineHeight: 1.35 }}>
        {hint}
      </div>
      {items.length === 0 ? (
        <p className="serif" style={{ fontSize: 13, color: "var(--dim)", fontStyle: "italic", margin: 0 }}>
          None this period.
        </p>
      ) : (
        <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 8 }}>
          {items.slice(0, 5).map((it, i) => (
            <li key={`${it.name}-${i}`} style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "baseline" }}>
              <span
                className="mono"
                style={{ fontSize: 12.5, color: "var(--ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                title={it.url ?? it.name}
              >
                <span style={{ color: mark, marginRight: 6 }}>{tone === "up" ? "+" : "–"}</span>
                {it.name}
              </span>
              <span className="mono" style={{ fontSize: 11, color: "var(--dim)", flexShrink: 0, whiteSpace: "nowrap" }}>
                {fmtNum(it.impressions)} impr
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// A compact "gained / lost clicks" mover row.
function MoverList({ title, rows, tone }: { title: string; rows: { query: string; clicks: number; prevClicks: number | null }[]; tone: "up" | "down" }) {
  const mark = tone === "up" ? "var(--accent)" : "var(--dim)";
  if (rows.length === 0) return null;
  return (
    <div style={{ flex: 1, minWidth: 220 }}>
      <div className="mono" style={{ ...label, marginBottom: 8 }}>
        {title}
      </div>
      <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 6 }}>
        {rows.slice(0, 5).map((r, i) => {
          const delta = r.clicks - (r.prevClicks ?? 0);
          return (
            <li key={`${r.query}-${i}`} style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
              <span className="mono" style={{ fontSize: 12.5, color: "var(--ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={r.query}>
                {r.query}
              </span>
              <span className="mono" style={{ fontSize: 12, color: mark, flexShrink: 0 }}>
                {delta > 0 ? "+" : ""}
                {delta} clk
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// --- tab nav -----------------------------------------------------------------

function TabNav({ range, view }: { range: SeoRange; view: ViewKey }) {
  return (
    <nav style={{ display: "flex", gap: 4, flexWrap: "wrap", borderBottom: "1px solid var(--rule)", marginBottom: 28 }}>
      {VIEWS.map((v) => {
        const on = v.key === view;
        return (
          <a
            key={v.key}
            href={`/admin/seo?range=${range}&view=${v.key}`}
            className="mono"
            style={{
              fontSize: 11.5,
              letterSpacing: "0.04em",
              padding: "9px 14px",
              textDecoration: "none",
              color: on ? "var(--ink)" : "var(--dim)",
              borderBottom: `2px solid ${on ? "var(--accent)" : "transparent"}`,
              marginBottom: -1,
              fontWeight: on ? 600 : 400,
            }}
          >
            {v.label}
          </a>
        );
      })}
    </nav>
  );
}

// --- health strip (Plan view one-liner) --------------------------------------

function HealthStrip({ o, range }: { o: SeoOverview; range: SeoRange }) {
  const h = o.health;
  const sitemap = !h.sitemapsReadable
    ? "sitemap status needs Owner access"
    : h.sitemapOk
      ? "sitemap read cleanly"
      : (h.sitemaps?.length ?? 0) > 0
        ? "sitemap has issues"
        : "no sitemap submitted";
  return (
    <a href={`/admin/seo?range=${range}&view=indexing`} style={{ textDecoration: "none", display: "block" }}>
      <div style={{ border: "1px solid var(--rule)", padding: "12px 16px", display: "flex", gap: 16, flexWrap: "wrap", alignItems: "center", justifyContent: "space-between" }}>
        <span className="serif" style={{ fontSize: 13.5, color: "var(--muted)" }}>
          <b style={{ color: "var(--ink)" }}>{fmtNum(h.pagesIndexedSeen)}</b> pages show in Google search ·{" "}
          <b style={{ color: "var(--ink)" }}>{fmtNum(o.reach.keywords)}</b> searches you rank for · {sitemap}
        </span>
        <span className="mono" style={{ fontSize: 11, color: "var(--accent)", whiteSpace: "nowrap" }}>
          indexing details →
        </span>
      </div>
    </a>
  );
}

// --- the views ---------------------------------------------------------------

function PlanView({ o, range, latestBrief }: { o: SeoOverview; range: SeoRange; latestBrief: Awaited<ReturnType<typeof getLatestReadyBrief>> }) {
  const wc = o.whatChanged;
  const changed =
    wc.newQueries.length + wc.lostQueries.length + wc.newPages.length + wc.gainers.length + wc.fallers.length > 0;
  const clickTrend = o.dailyTrend.map((d) => ({ date: d.date, value: d.clicks }));
  const trendMetric = o.kpis.clicks.value > 0 ? "clicks" : "impressions";
  const imprTrend = o.dailyTrend.map((d) => ({ date: d.date, value: d.impressions }));

  return (
    <>
      {/* Verdict — the bottom line */}
      <p className="serif" style={{ fontSize: 20, lineHeight: 1.5, color: "var(--ink)", margin: "0 0 24px", maxWidth: 780 }}>
        {o.verdict}
      </p>

      {/* KPIs */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12, marginBottom: 20 }}>
        <StatCard label="Clicks" kpi={o.kpis.clicks} />
        <StatCard label="Impressions" kpi={o.kpis.impressions} />
        <StatCard label="Click rate" kpi={o.kpis.ctr} format="pct" />
        <StatCard label="Avg position" kpi={o.kpis.position} format="position" lowerIsBetter hint="Lower is better" />
      </div>

      {o.hasData ? (
        <div style={{ border: "1px solid var(--rule)", padding: "16px 18px", marginBottom: 36 }}>
          <div className="mono" style={{ ...label, marginBottom: 12 }}>
            {trendMetric === "clicks" ? "Clicks" : "Impressions"}, last {range} days
          </div>
          <Sparkline points={trendMetric === "clicks" ? clickTrend : imprTrend} />
        </div>
      ) : null}

      {/* THE PLAYS — what to do, biggest payoff first */}
      <section style={{ marginBottom: 40 }}>
        <Kicker>Do this next</Kicker>
        <Title>This week&rsquo;s plays</Title>
        {o.plays.length === 0 ? (
          <Notice>No specific plays surfaced yet — keep publishing.</Notice>
        ) : (
          <>
            <ul style={{ listStyle: "none", margin: 0, padding: 0, borderTop: "1px solid var(--rule)" }}>
              {o.plays.map((p, i) => (
                <PlayCard key={`${p.target}-${i}`} play={p} index={i} />
              ))}
            </ul>
            <p className="mono" style={{ fontSize: 10, color: "var(--dim)", margin: "10px 0 0", letterSpacing: "0.04em" }}>
              &ldquo;est.&rdquo; = a conservative estimate of extra weekly clicks if the fix lands, from your impressions × the typical click-rate at a better rank.
            </p>
          </>
        )}
      </section>

      {/* WHAT CHANGED */}
      <section style={{ marginBottom: 40 }}>
        <Kicker>Since last period</Kicker>
        <Title>What changed</Title>
        {changed ? (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))", gap: 16, marginBottom: 16 }}>
              <ChangeCol title="New keywords" hint="Searches you started showing up for" items={wc.newQueries} tone="up" />
              <ChangeCol title="Lost keywords" hint="Searches you dropped out of" items={wc.lostQueries} tone="down" />
              <ChangeCol title="New pages" hint="Pages that began getting seen" items={wc.newPages} tone="up" />
            </div>
            {wc.gainers.length + wc.fallers.length > 0 ? (
              <div style={{ border: "1px solid var(--rule)", padding: "14px 16px", display: "flex", gap: 24, flexWrap: "wrap" }}>
                <MoverList title="Gained clicks" rows={wc.gainers} tone="up" />
                <MoverList title="Lost clicks" rows={wc.fallers} tone="down" />
              </div>
            ) : null}
          </>
        ) : (
          <Notice>Nothing notable changed vs the previous {range} days — same keywords and pages.</Notice>
        )}
      </section>

      {/* THE READ — what's working / not (kept plain-English) */}
      {o.hasData ? (
        <section style={{ marginBottom: 40 }}>
          <Kicker>The read</Kicker>
          <Title>What&rsquo;s working, what&rsquo;s not</Title>
          <div style={twoCol}>
            <div style={{ border: "1px solid var(--rule)", padding: "16px 18px" }}>
              <div className="mono" style={{ ...label, marginBottom: 12 }}>
                Working
              </div>
              <InsightList items={o.insights.working} tone="good" />
            </div>
            <div style={{ border: "1px solid var(--rule)", padding: "16px 18px" }}>
              <div className="mono" style={{ ...label, marginBottom: 12 }}>
                Not working
              </div>
              <InsightList items={o.insights.notWorking} tone="bad" />
            </div>
          </div>
        </section>
      ) : (
        <Notice>
          Barely any Search Console data in this window yet — Wortins is still early in Google&rsquo;s index. The plays and the
          read fill in as more pages get crawled and ranked.
        </Notice>
      )}

      {/* HEALTH one-liner */}
      <section style={{ marginBottom: 40 }}>
        <HealthStrip o={o} range={range} />
      </section>

      {/* AI action plan (deep dive, on your subscription) */}
      <section>
        <Brief key={range} range={range} enabled={seoBriefConfigured} initial={latestBrief} />
      </section>
    </>
  );
}

function QueriesView({ o }: { o: SeoOverview }) {
  return (
    <>
      <p className="serif" style={{ fontSize: 14, color: "var(--muted)", margin: "0 0 28px", maxWidth: 720, lineHeight: 1.5 }}>
        You show up for <b style={{ color: "var(--ink)" }}>{fmtNum(o.reach.keywords)}</b> searches —{" "}
        <b style={{ color: "var(--ink)" }}>{o.reach.page1}</b> on page 1, <b style={{ color: "var(--ink)" }}>{o.reach.page2}</b> on page 2.
        The lists below are the ones worth acting on.
      </p>

      <section style={{ marginBottom: 40 }}>
        <SectionTitle kicker="On the cusp" title="Keywords within reach" note="You rank in positions ~5–20 for these — near the top, with real demand. A little more depth + internal links can lift them into the clicks." />
        <QueryTable rows={o.opportunities.strikingDistance} emptyLabel="No page-2 keywords with demand yet." />
      </section>

      <section style={{ marginBottom: 40 }}>
        <SectionTitle kicker="Good rank, poor click" title="Ranking but not clicked" note="These rank in the top ~10 but earn far fewer clicks than the rank deserves — a title/description rewrite is the fix." />
        <QueryTable rows={o.opportunities.lowCtrWinners} emptyLabel="No obvious title/description problems in this window." />
      </section>

      <section>
        <SectionTitle kicker="Your biggest searches" title="Top queries" note="Ranked by clicks, then impressions. The ▲/▼ next to position shows rank movement vs the previous period." />
        <QueryTable rows={o.topQueries} emptyLabel="No query data yet." />
      </section>
    </>
  );
}

function PagesView({ o }: { o: SeoOverview }) {
  return (
    <>
      <p className="serif" style={{ fontSize: 14, color: "var(--muted)", margin: "0 0 28px", maxWidth: 720, lineHeight: 1.5 }}>
        Of <b style={{ color: "var(--ink)" }}>{o.reach.pagesSeen}</b> pages Google is showing,{" "}
        <b style={{ color: "var(--ink)" }}>{o.reach.pagesClicked}</b> earn any clicks.
      </p>

      <section style={{ marginBottom: 40 }}>
        <SectionTitle kicker="Needs work" title="Underperforming pages" note="Real demand, but Google is either burying them (page 2+) or they rank well yet earn no clicks. This is your fix list." />
        <PageTable rows={o.pages.underperforming} emptyLabel="Nothing clearly underperforming in this window." />
      </section>

      <section>
        <SectionTitle kicker="Your best pages" title="Top pages" note="Ranked by clicks. The ▲/▼ next to position shows rank movement vs the previous period." />
        <PageTable rows={o.pages.top} emptyLabel="No page data yet." />
      </section>
    </>
  );
}

function TrafficView({ o }: { o: SeoOverview }) {
  const metric: "clicks" | "impressions" = o.kpis.clicks.value > 0 ? "clicks" : "impressions";
  const app = o.health.searchAppearances;
  return (
    <>
      <p className="serif" style={{ fontSize: 14, color: "var(--muted)", margin: "0 0 28px", maxWidth: 720, lineHeight: 1.5 }}>
        {`Where your ${metric} come from — by the kind of page, the device people search on, and the country they’re in.`}
      </p>

      <section style={{ marginBottom: 40 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))", gap: 16 }}>
          <BarGroup title="By page type" items={o.traffic.contentTypes} metric={metric} />
          <BarGroup title="By device" items={o.traffic.devices} metric={metric} />
          <BarGroup title="By country" items={o.traffic.countries} metric={metric} />
        </div>
      </section>

      <section>
        <SectionTitle kicker="How you appear" title="Search appearances" note="Special result types (rich results, top stories, etc.). Most sites have none until they add structured data." />
        {app.length === 0 ? (
          <Notice>No special search appearances yet — you show up as standard blue-link results. Adding structured data (article, FAQ) can unlock richer listings.</Notice>
        ) : (
          <div style={{ maxWidth: 420 }}>
            <BarGroup title="Appearance types" items={app} metric={metric} />
          </div>
        )}
      </section>
    </>
  );
}

function SitemapRow({ s }: { s: Sitemap }) {
  const status = s.errors > 0 ? "errors" : s.isPending || !s.lastDownloaded ? "pending" : "OK";
  const statusColor = status === "OK" ? "var(--accent)" : status === "errors" ? "var(--dim)" : "var(--muted)";
  const path = s.path.replace(/^https?:\/\/[^/]+/, "") || s.path;
  return (
    <li style={{ padding: "12px 0", borderBottom: "1px solid var(--rule)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "baseline", flexWrap: "wrap" }}>
        <a href={s.path} target="_blank" rel="noreferrer" className="mono" style={{ fontSize: 13, color: "var(--ink)", textDecoration: "none", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={s.path}>
          {path}
        </a>
        <span className="mono" style={{ fontSize: 11, color: statusColor, textTransform: "uppercase", letterSpacing: "0.08em", flexShrink: 0 }}>
          {status}
        </span>
      </div>
      <div className="mono" style={{ fontSize: 11, color: "var(--dim)", marginTop: 4 }}>
        {s.submitted > 0 ? `${fmtNum(s.submitted)} URLs · ` : ""}last read {fmtDate(s.lastDownloaded)}
        {s.warnings > 0 ? ` · ${s.warnings} warnings` : ""}
        {s.errors > 0 ? ` · ${s.errors} errors` : ""}
      </div>
    </li>
  );
}

function IndexingView({ o }: { o: SeoOverview }) {
  const h = o.health;
  return (
    <>
      <p className="serif" style={{ fontSize: 14, color: "var(--muted)", margin: "0 0 28px", maxWidth: 720, lineHeight: 1.5 }}>
        What Google has actually crawled, indexed and shown — plus your sitemaps.
      </p>

      {/* Inferred-indexed count (from real search data — trustworthy) */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12, marginBottom: 32 }}>
        <div style={{ border: "1px solid var(--rule)", padding: "16px 18px" }}>
          <div className="display" style={{ fontSize: 32, lineHeight: 1, color: "var(--ink)" }}>
            {fmtNum(h.pagesIndexedSeen)}
          </div>
          <div className="mono" style={{ ...label, marginTop: 10 }}>
            Pages shown in search
          </div>
          <div className="serif" style={{ fontSize: 11.5, color: "var(--muted)", marginTop: 6, lineHeight: 1.35 }}>
            Confirmed indexed — they appeared in Google results this period.
          </div>
        </div>
        <div style={{ border: "1px solid var(--rule)", padding: "16px 18px" }}>
          <div className="display" style={{ fontSize: 32, lineHeight: 1, color: "var(--ink)" }}>
            {h.pagesSubmitted !== null ? fmtNum(h.pagesSubmitted) : "—"}
          </div>
          <div className="mono" style={{ ...label, marginTop: 10 }}>
            URLs in sitemaps
          </div>
          <div className="serif" style={{ fontSize: 11.5, color: "var(--muted)", marginTop: 6, lineHeight: 1.35 }}>
            {h.pagesSubmitted !== null ? "Submitted for Google to crawl." : "Google doesn't report a submitted count for these sitemaps."}
          </div>
        </div>
      </div>

      {/* Owner-access caveat */}
      {h.note ? <div style={{ marginBottom: 28 }}><Notice tone="accent">{h.note}</Notice></div> : null}

      {/* Sitemaps list */}
      <section>
        <SectionTitle kicker="Submitted sitemaps" title="Sitemaps" note="A healthy sitemap is read regularly with no errors. That's how Google discovers your new pages." />
        {!h.sitemapsReadable ? (
          <Notice>
            Couldn&rsquo;t read the sitemaps list — a &ldquo;Full&rdquo; service account is often denied here. To see full sitemap
            + per-URL indexing detail, add this property&rsquo;s service account as an <b>Owner</b> in Search Console settings.
          </Notice>
        ) : (h.sitemaps?.length ?? 0) === 0 ? (
          <Notice tone="accent">
            No sitemap submitted for this property. Submit <span className="mono">https://wortins.com/sitemap.xml</span> in Search
            Console → Sitemaps so Google can find every page.
          </Notice>
        ) : (
          <ul style={{ listStyle: "none", margin: 0, padding: 0, borderTop: "1px solid var(--rule)" }}>
            {h.sitemaps!.map((s, i) => (
              <SitemapRow key={`${s.path}-${i}`} s={s} />
            ))}
          </ul>
        )}
      </section>
    </>
  );
}

// --- page --------------------------------------------------------------------

export default async function SeoPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string; view?: string }>;
}) {
  if (!(await isAdmin())) {
    return <AdminLogin notConfigured={!adminConfigured} />;
  }

  const sp = await searchParams;
  const range: SeoRange = normalizeRange(sp.range);
  const view: ViewKey = normalizeView(sp.view);
  const o = await getSeoOverview(range);
  const latestBrief = view === "plan" ? await getLatestReadyBrief(range) : null;

  return (
    <AdminShell subtitle="Search Console" active="search">
      {/* Range selector + freshness */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 6 }}>
        <div style={{ display: "flex", gap: 8 }}>
          {SEO_RANGES.map((r) => {
            const on = r === range;
            return (
              <a
                key={r}
                href={`/admin/seo?range=${r}&view=${view}`}
                className="mono"
                style={{
                  fontSize: 11,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  padding: "7px 13px",
                  textDecoration: "none",
                  border: `1px solid ${on ? "var(--accent)" : "var(--rule)"}`,
                  background: on ? "var(--accent)" : "transparent",
                  color: on ? "var(--onAccent)" : "var(--muted)",
                }}
              >
                {r} days
              </a>
            );
          })}
        </div>
        <span className="mono" style={{ fontSize: 10, letterSpacing: "0.06em", color: "var(--dim)" }}>
          as of {fmtIstUtc(o.generatedAt)}
        </span>
      </div>
      <p className="mono" style={{ fontSize: 10, letterSpacing: "0.04em", color: "var(--dim)", margin: "0 0 22px" }}>
        {o.property} · Google finalizes data ~2–3 days late, so this covers {o.range.currentStart} → {o.range.currentEnd}.
      </p>

      {!o.configured ? (
        <Notice>
          Search Console isn&rsquo;t connected on this deployment. Add{" "}
          <span className="mono">GSC_SERVICE_ACCOUNT_B64</span> (base64 of the service-account JSON) to light this up.
        </Notice>
      ) : o.error ? (
        <Notice tone="accent">Search Console request failed: {o.error}</Notice>
      ) : (
        <>
          <TabNav range={range} view={view} />
          {view === "plan" ? (
            <PlanView o={o} range={range} latestBrief={latestBrief} />
          ) : view === "queries" ? (
            <QueriesView o={o} />
          ) : view === "pages" ? (
            <PagesView o={o} />
          ) : view === "traffic" ? (
            <TrafficView o={o} />
          ) : (
            <IndexingView o={o} />
          )}
        </>
      )}
    </AdminShell>
  );
}
