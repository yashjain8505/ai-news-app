import type { Metadata } from "next";
import { isAdmin, adminConfigured } from "@/lib/adminData";
import { AdminShell, AdminLogin } from "../AdminShell";
import {
  getSeoOverview,
  normalizeRange,
  SEO_RANGES,
  type SeoRange,
} from "@/lib/seoData";
import { seoBriefConfigured } from "@/lib/seoBrief";
import { Brief } from "./Brief";
import {
  StatCard,
  Sparkline,
  SectionTitle,
  Panel,
  Notice,
  QueryTable,
  PageTable,
} from "./charts";

// Reads request cookies + live data on every hit — never cache or prerender.
export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata: Metadata = {
  title: "Search",
  robots: { index: false, follow: false },
};

const twoCol: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
  gap: 16,
};

// Times in IST + UTC (operator is in India). Mirrors the analytics page.
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

  const clicksTrend = o.dailyTrend.map((d) => ({ date: d.date, value: d.clicks }));
  const imprTrend = o.dailyTrend.map((d) => ({ date: d.date, value: d.impressions }));

  return (
    <AdminShell subtitle="Search Console" active="search">
      {/* Range selector + freshness */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 12,
          flexWrap: "wrap",
          marginBottom: 10,
        }}
      >
        <div style={{ display: "flex", gap: 8 }}>
          {SEO_RANGES.map((r) => {
            const activeR = r === range;
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
                  border: `1px solid ${activeR ? "var(--accent)" : "var(--rule)"}`,
                  background: activeR ? "var(--accent)" : "transparent",
                  color: activeR ? "var(--onAccent)" : "var(--muted)",
                }}
              >
                {r}d
              </a>
            );
          })}
        </div>
        <span className="mono" style={{ fontSize: 10, letterSpacing: "0.06em", color: "var(--dim)" }}>
          as of {fmtIstUtc(o.generatedAt)}
        </span>
      </div>

      {/* Data window / latency note */}
      <p className="mono" style={{ fontSize: 10, letterSpacing: "0.04em", color: "var(--dim)", marginTop: 0, marginBottom: 22 }}>
        {o.property} · Google finalizes Search data ~2–3 days late, so this window covers{" "}
        {o.range.currentStart} → {o.range.currentEnd}. Position: lower is better (1 = top of page 1).
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
          {/* AI action plan */}
          <div style={{ marginBottom: 40 }}>
            <Brief range={range} enabled={seoBriefConfigured} />
          </div>

          {!o.hasData ? (
            <div style={{ marginBottom: 32 }}>
              <Notice>
                Barely any Search Console data in this window yet — Wortins is still early in Google&rsquo;s index.
                Impressions will build as more pages get crawled and ranked; check back as the numbers grow.
              </Notice>
            </div>
          ) : null}

          {/* ---------------- PERFORMANCE ---------------- */}
          <section style={{ marginBottom: 44 }}>
            <SectionTitle
              kicker="Search performance"
              title="How you show up on Google"
              note="Clicks are visits from search; impressions are times you appeared; CTR is clicks ÷ impressions; position is your average rank."
            />
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
                gap: 12,
                marginBottom: 20,
              }}
            >
              <StatCard label="Clicks" kpi={o.kpis.clicks} />
              <StatCard label="Impressions" kpi={o.kpis.impressions} />
              <StatCard label="CTR" kpi={o.kpis.ctr} format="pct" />
              <StatCard label="Avg position" kpi={o.kpis.position} format="position" lowerIsBetter hint="Lower is better" />
            </div>
            <div style={twoCol}>
              <Panel title="Clicks per day">
                <Sparkline points={clicksTrend} height={80} emptyLabel="No clicks in this window yet." />
              </Panel>
              <Panel title="Impressions per day">
                <Sparkline points={imprTrend} height={80} emptyLabel="Not enough data for a trend yet." />
              </Panel>
            </div>
          </section>

          {/* ---------------- OPPORTUNITIES ---------------- */}
          <section style={{ marginBottom: 44 }}>
            <SectionTitle
              kicker="Opportunities · highest leverage"
              title="The quickest wins"
              note="Where a small change should pay off fastest — ranked by existing demand."
            />
            <div style={twoCol}>
              <Panel
                title="Striking distance (page 2 → page 1)"
                hint="You rank ~5–20 with real impressions. A content/internal-link nudge can reach page 1, where clicks actually happen."
              >
                <QueryTable rows={o.opportunities.strikingDistance} emptyLabel="No page-2 keywords with demand yet." />
              </Panel>
              <Panel
                title="Good rank, poor CTR"
                hint="You rank in the top ~10 but earn far fewer clicks than the rank deserves — usually a weak title or description you can rewrite today."
              >
                <QueryTable rows={o.opportunities.lowCtrWinners} emptyLabel="No obvious title/description problems flagged." />
              </Panel>
            </div>
          </section>

          {/* ---------------- PAGES ---------------- */}
          <section style={{ marginBottom: 44 }}>
            <SectionTitle
              kicker="Pages"
              title="Which pages earn — and which are stuck"
              note="Your best performers, and the ones with demand that Google is burying."
            />
            <div style={twoCol}>
              <Panel title="Top pages">
                <PageTable rows={o.pages.top} emptyLabel="No pages with search data yet." />
              </Panel>
              <Panel
                title="Underperforming pages"
                hint="High impressions but buried (poor rank), or ranking well yet getting no clicks."
              >
                <PageTable rows={o.pages.underperforming} emptyLabel="Nothing obviously underperforming." />
              </Panel>
            </div>
          </section>

          {/* ---------------- MOVERS ---------------- */}
          <section>
            <SectionTitle
              kicker="Momentum"
              title="What's moving"
              note="Queries whose average rank rose or fell vs the previous period."
            />
            <div style={twoCol}>
              <Panel title="Rising queries">
                <QueryTable rows={o.movers.risingQueries} emptyLabel="No clear risers yet." />
              </Panel>
              <Panel title="Falling queries">
                <QueryTable rows={o.movers.decayingQueries} emptyLabel="No clear decliners — nothing slipping." />
              </Panel>
            </div>
          </section>
        </>
      )}
    </AdminShell>
  );
}
