import type { Metadata } from "next";
import { isAdmin, adminConfigured } from "@/lib/adminData";
import { AdminShell, AdminLogin } from "../AdminShell";
import {
  getSeoOverview,
  normalizeRange,
  SEO_RANGES,
  type SeoOverview,
  type SeoRange,
  type NamedMetric,
} from "@/lib/seoData";
import { seoBriefConfigured, getLatestReadyBrief } from "@/lib/seoBrief";
import { Brief } from "./Brief";
import { StatCard, Notice, fmtNum, fmtPct, fmtPos } from "./charts";

// Reads request cookies + live data on every hit — never cache or prerender.
export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata: Metadata = {
  title: "Search",
  robots: { index: false, follow: false },
};

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

// One plain-English sentence about the whole window — the "what's happening".
function plainSummary(o: SeoOverview, days: number): string {
  const clicks = o.kpis.clicks.value;
  const impr = o.kpis.impressions.value;
  const ctr = o.kpis.ctr.value;
  const pos = o.kpis.position.value;
  if (impr === 0) {
    return `Over the last ${days} days Google hasn't shown Wortins in search results yet — there's nothing to report until impressions start building.`;
  }
  const rank =
    pos <= 10
      ? `on page 1 (around position ${pos.toFixed(0)})`
      : pos <= 20
        ? "on page 2"
        : `around position ${pos.toFixed(0)}, which is page ${Math.ceil(pos / 10)}`;
  if (clicks === 0) {
    return `Over the last ${days} days Wortins appeared in Google ${fmtNum(impr)} times but earned no clicks. You're showing up ${rank} — too low, and the snippets aren't compelling enough, to win the click yet.`;
  }
  return `Over the last ${days} days Wortins appeared in Google ${fmtNum(impr)} times and earned ${fmtNum(clicks)} clicks — a ${fmtPct(ctr)} click-through rate. You're getting seen; the job now is turning more of those impressions into clicks. Most pages rank ${rank}.`;
}

function pageReason(p: { impressions: number; position: number; clicks: number }): string {
  if (p.position > 15) {
    return `Seen ${fmtNum(p.impressions)} times but buried around position ${fmtPos(p.position)} — Google isn't ranking it. Strengthen the page (more depth, internal links from your blog).`;
  }
  if (p.clicks === 0) {
    return `Ranks ${fmtPos(p.position)} yet gets no clicks — the title or description isn't pulling. Rewrite it to be more specific and clickable.`;
  }
  return `${fmtNum(p.impressions)} impressions at position ${fmtPos(p.position)}.`;
}

// --- small presentational bits ----------------------------------------------

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
          <span className="mono" style={{ position: "absolute", left: 0, top: 1, fontSize: 10, color: mark }}>{tone === "good" ? "▲" : "▼"}</span>
          {t}
        </li>
      ))}
    </ul>
  );
}

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

function FocusRow({ head, href, body }: { head: string; href?: string; body: string }) {
  const headEl = (
    <span className="mono" style={{ fontSize: 13, color: "var(--ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", display: "block" }} title={head}>
      {head}
    </span>
  );
  return (
    <li style={{ padding: "11px 0", borderBottom: "1px solid var(--rule)" }}>
      {href ? (
        <a href={href} target="_blank" rel="noreferrer" style={{ textDecoration: "none" }}>
          {headEl}
        </a>
      ) : (
        headEl
      )}
      <span className="serif" style={{ fontSize: 13, color: "var(--muted)", lineHeight: 1.4, display: "block", marginTop: 2 }}>
        {body}
      </span>
    </li>
  );
}

function FocusColumn({ title, hint, children, empty }: { title: string; hint: string; children: React.ReactNode; empty: boolean }) {
  return (
    <div style={{ border: "1px solid var(--rule)", padding: "16px 18px" }}>
      <div className="mono" style={label}>
        {title}
      </div>
      <div className="serif" style={{ fontSize: 12.5, color: "var(--muted)", marginTop: 4, marginBottom: empty ? 0 : 6, lineHeight: 1.35 }}>
        {hint}
      </div>
      {empty ? (
        <p className="serif" style={{ fontSize: 13, color: "var(--dim)", fontStyle: "italic", margin: "8px 0 0" }}>
          Nothing to flag in this window yet.
        </p>
      ) : (
        <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>{children}</ul>
      )}
    </div>
  );
}

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

export default async function SeoPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string }>;
}) {
  if (!(await isAdmin())) {
    return <AdminLogin notConfigured={!adminConfigured} />;
  }

  const sp = await searchParams;
  const range: SeoRange = normalizeRange(sp.range);
  const o = await getSeoOverview(range);
  const latestBrief = await getLatestReadyBrief(range);

  const pagesToFix = o.pages.underperforming.slice(0, 4);
  const keywords = o.opportunities.strikingDistance.slice(0, 6);
  const trafficMetric: "clicks" | "impressions" = o.kpis.clicks.value > 0 ? "clicks" : "impressions";

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
                href={`/admin/seo?range=${r}`}
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
      <p className="mono" style={{ fontSize: 10, letterSpacing: "0.04em", color: "var(--dim)", margin: "0 0 26px" }}>
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
          {/* 1 — Plain-English "what's happening" + glanceable reach */}
          <p className="serif" style={{ fontSize: 18, lineHeight: 1.5, color: "var(--ink)", margin: "0 0 14px", maxWidth: 760 }}>
            {plainSummary(o, range)}
          </p>
          {o.hasData ? (
            <p className="serif" style={{ fontSize: 13.5, color: "var(--muted)", margin: "0 0 26px", maxWidth: 760, lineHeight: 1.5 }}>
              You show up for <b style={{ color: "var(--ink)" }}>{fmtNum(o.reach.keywords)}</b> searches —{" "}
              <b style={{ color: "var(--ink)" }}>{o.reach.page1}</b> on page 1 and{" "}
              <b style={{ color: "var(--ink)" }}>{o.reach.page2}</b> on page 2 (within reach). Of{" "}
              {o.reach.pagesSeen} pages Google shows, {o.reach.pagesClicked} earn any clicks.
            </p>
          ) : null}

          {/* 2 — The four numbers */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12, marginBottom: 36 }}>
            <StatCard label="Clicks" kpi={o.kpis.clicks} />
            <StatCard label="Impressions" kpi={o.kpis.impressions} />
            <StatCard label="Click rate" kpi={o.kpis.ctr} format="pct" />
            <StatCard label="Avg position" kpi={o.kpis.position} format="position" lowerIsBetter hint="Lower is better" />
          </div>

          {o.hasData ? (
            <>
              {/* 3 — What's working / not working */}
              <section style={{ marginBottom: 36 }}>
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

              {/* 4 — Where the traffic comes from */}
              <section style={{ marginBottom: 36 }}>
                <Kicker>Where it comes from</Kicker>
                <Title>Your traffic mix {trafficMetric === "impressions" ? "(by impressions)" : "(by clicks)"}</Title>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))", gap: 16 }}>
                  <BarGroup title="By page type" items={o.traffic.contentTypes} metric={trafficMetric} />
                  <BarGroup title="By device" items={o.traffic.devices} metric={trafficMetric} />
                  <BarGroup title="By country" items={o.traffic.countries} metric={trafficMetric} />
                </div>
              </section>

              {/* 5 — The single next best move */}
              {o.insights.nextBestThing ? (
                <section style={{ marginBottom: 36 }}>
                  <div style={{ border: "1px solid var(--accent)", borderLeft: "4px solid var(--accent)", padding: "16px 20px" }}>
                    <div className="mono" style={{ ...label, color: "var(--accent)", marginBottom: 8 }}>
                      The next best thing to do
                    </div>
                    <p className="serif" style={{ fontSize: 15.5, lineHeight: 1.5, color: "var(--ink)", margin: 0 }}>
                      {o.insights.nextBestThing}
                    </p>
                  </div>
                </section>
              ) : null}
            </>
          ) : (
            <Notice>
              Barely any Search Console data in this window yet — Wortins is still early in Google&rsquo;s index. The
              read and the traffic mix fill in as more pages get crawled and ranked.
            </Notice>
          )}

          {/* 6 — The AI action plan (deep dive, on your subscription) */}
          <section style={{ marginBottom: 36 }}>
            <Brief key={range} range={range} enabled={seoBriefConfigured} initial={latestBrief} />
          </section>

          {/* 7 — Concrete shortlist */}
          {o.hasData ? (
            <section>
              <Kicker>Where to focus</Kicker>
              <Title>The specific fixes</Title>
              <div style={twoCol}>
                <FocusColumn title="Pages to fix" hint="Real demand, but Google is either burying them or they're not earning the click." empty={pagesToFix.length === 0}>
                  {pagesToFix.map((p) => (
                    <FocusRow key={p.path} head={p.path} href={p.url} body={pageReason(p)} />
                  ))}
                </FocusColumn>
                <FocusColumn title="Keywords within reach" hint="You already rank on page 2 for these. A nudge gets you to page 1, where the clicks are." empty={keywords.length === 0}>
                  {keywords.map((q) => (
                    <FocusRow key={q.query} head={q.query} body={`Position ${fmtPos(q.position)} · ${fmtNum(q.impressions)} impressions — one step from page 1.`} />
                  ))}
                </FocusColumn>
              </div>
            </section>
          ) : null}
        </>
      )}
    </AdminShell>
  );
}
