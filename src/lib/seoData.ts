import "server-only";

// SEO aggregation layer — the "brain" behind /admin/seo.
//
// It turns raw Google Search Console rows (via src/lib/gsc.ts) into one typed
// SeoOverview: headline KPIs with period-over-period deltas, a daily trend, the
// top queries, and — the parts that actually drive action — ranked OPPORTUNITY
// lists (page-2 "striking distance" keywords, good-rank-but-no-click queries),
// PAGE diagnostics (winners + buried underperformers), and MOVERS (queries whose
// rank rose or fell). This is the evidence the dashboard renders and the AI brief
// (src/lib/seoBrief.ts) reasons over.
//
// Mirrors analyticsData.ts's shapes on purpose (Kpi, TrendPoint, current-vs-prev
// windows, graceful degradation) so /admin/seo is a true sibling of
// /admin/analytics. Callers MUST verify isAdmin() first — same contract.

import { searchAnalytics, gscConfigured, gscProperty, isoDay, type GscRow } from "@/lib/gsc";

// --- shared shapes (kept identical to analyticsData.ts) ----------------------

export type Kpi = {
  value: number;
  prev: number;
  // Percent change vs the previous period, rounded. null = no prior baseline
  // (prev was 0) — render as "new" rather than a bogus ∞%.
  deltaPct: number | null;
};

function kpi(cur: number, prev: number): Kpi {
  const deltaPct =
    prev > 0 ? Math.round(((cur - prev) / prev) * 100) : cur > 0 ? null : 0;
  return { value: cur, prev, deltaPct };
}

// A daily point carries both series so the UI can draw clicks + impressions.
export type SeoTrendPoint = {
  date: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
};

// A query row, enriched with its previous-window counterparts so we can show
// movement (rank up/down, click delta) without a second lookup at the UI.
export type SeoQuery = {
  query: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
  prevPosition: number | null;
  prevClicks: number | null;
  // How far this query sits from where it "should" click, given its rank —
  // used to flag good-rank/poor-CTR winners. null when N is too small to judge.
  ctrGap: number | null;
};

export type SeoPage = {
  path: string; // origin-stripped ("/blog/…"); "/" for home
  url: string; // full url as GSC returns it
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
  prevPosition: number | null;
  prevClicks: number | null;
};

// A traffic source — a device, a country, or a content-type bucket.
export type NamedMetric = { name: string; clicks: number; impressions: number };
export type ContentBucket = NamedMetric & { key: string; pages: number };

// "Where your clicks come from" — bucketed by page type, plus device + country.
export type SeoTraffic = {
  contentTypes: ContentBucket[];
  devices: NamedMetric[];
  countries: NamedMetric[];
};

// A few glanceable, plain-English counts.
export type SeoReach = {
  keywords: number; // distinct searches you appear for (>=3 impressions)
  page1: number; // ...ranking on page 1 (position <= 10)
  page2: number; // ...ranking on page 2 (position 11–20) — within reach
  pagesSeen: number; // pages that got any impressions
  pagesClicked: number; // ...that earned at least one click
};

// Deterministic, always-present analysis. The AI plan goes deeper on demand.
export type SeoInsights = {
  working: string[];
  notWorking: string[];
  nextBestThing: string | null;
};

export type SeoOverview = {
  configured: boolean;
  property: string;
  error: string | null;
  range: {
    days: number;
    label: string;
    currentStart: string;
    currentEnd: string;
  };
  generatedAt: string;
  hasData: boolean;
  // NOTE: for `position`, LOWER is better — a negative deltaPct is an IMPROVEMENT.
  // The UI/brief invert the coloring for this one KPI.
  kpis: { clicks: Kpi; impressions: Kpi; ctr: Kpi; position: Kpi };
  dailyTrend: SeoTrendPoint[];
  topQueries: SeoQuery[];
  opportunities: {
    // Position ~5–20 with real demand: one nudge could reach page 1. Ranked by
    // impressions (existing demand) so the highest-leverage work floats up.
    strikingDistance: SeoQuery[];
    // Ranking well (top ~10) but earning far fewer clicks than the rank deserves
    // → a title/description problem you can fix today.
    lowCtrWinners: SeoQuery[];
  };
  pages: {
    top: SeoPage[];
    // High demand (impressions) but buried (poor position) OR top-ranked yet
    // click-starved. The "why isn't this working" list.
    underperforming: SeoPage[];
  };
  movers: {
    risingQueries: SeoQuery[];
    decayingQueries: SeoQuery[];
  };
  traffic: SeoTraffic;
  reach: SeoReach;
  insights: SeoInsights;
};

// --- expected-CTR curve ------------------------------------------------------

// Rough industry-average organic CTR by whole-number position (index 1..10).
// Used only to FLAG relative under-performance, never presented as truth.
const CTR_BY_POS = [
  0, 0.28, 0.15, 0.11, 0.08, 0.07, 0.055, 0.045, 0.038, 0.032, 0.028,
];

function expectedCtr(pos: number): number {
  if (pos < 1) pos = 1;
  if (pos <= 10) {
    const lo = Math.floor(pos);
    const hi = Math.min(10, Math.ceil(pos));
    const a = CTR_BY_POS[lo] ?? 0.02;
    const b = CTR_BY_POS[hi] ?? 0.02;
    return a + (b - a) * (pos - lo);
  }
  if (pos <= 20) return Math.max(0.005, 0.015 - (pos - 10) * 0.001);
  return 0.004;
}

// --- windows -----------------------------------------------------------------

// GSC finalizes data ~2–3 days back, so we anchor the "current" window a few
// days in the past to avoid comparing a half-finished day against a whole one.
const FINALIZATION_LAG_DAYS = 3;

function windows(days: number) {
  const now = new Date();
  const currentEnd = new Date(now);
  currentEnd.setUTCDate(currentEnd.getUTCDate() - FINALIZATION_LAG_DAYS);
  const currentStart = new Date(currentEnd);
  currentStart.setUTCDate(currentStart.getUTCDate() - (days - 1));

  const previousEnd = new Date(currentStart);
  previousEnd.setUTCDate(previousEnd.getUTCDate() - 1);
  const previousStart = new Date(previousEnd);
  previousStart.setUTCDate(previousStart.getUTCDate() - (days - 1));

  return {
    current: { startDate: isoDay(currentStart), endDate: isoDay(currentEnd) },
    previous: { startDate: isoDay(previousStart), endDate: isoDay(previousEnd) },
  };
}

// --- helpers -----------------------------------------------------------------

const stripOrigin = (url: string): string =>
  url.replace(/^https?:\/\/[^/]+/, "") || "/";

const sum = (rows: GscRow[], key: "clicks" | "impressions"): number =>
  rows.reduce((acc, r) => acc + (r[key] ?? 0), 0);

// Weighted-average position across rows (weight by impressions, the honest way).
function avgPosition(rows: GscRow[]): number {
  let imp = 0;
  let weighted = 0;
  for (const r of rows) {
    imp += r.impressions;
    weighted += r.position * r.impressions;
  }
  return imp > 0 ? weighted / imp : 0;
}

// Bucket a page path into a human content-type. Wortins' surfaces: /blog posts,
// /story pages, /section landing pages, /edition archives, the home page.
function contentBucket(path: string): { key: string; label: string } {
  if (path === "/") return { key: "home", label: "Home page" };
  if (path.startsWith("/blog")) return { key: "blog", label: "Blog posts" };
  if (path.startsWith("/story")) return { key: "story", label: "Story pages" };
  if (path.startsWith("/section")) return { key: "section", label: "Section pages" };
  if (path.startsWith("/edition") || path.startsWith("/daily")) return { key: "edition", label: "Daily editions" };
  return { key: "other", label: "Other pages" };
}

const titleCase = (s: string): string =>
  s ? s.charAt(0).toUpperCase() + s.slice(1).toLowerCase() : s;

// GSC's country dimension is an ISO-3166-1 alpha-3 code ("ind", "usa"). Name the
// common ones; fall back to the upper-cased code.
const COUNTRY_NAMES: Record<string, string> = {
  ind: "India", usa: "United States", gbr: "United Kingdom", can: "Canada",
  aus: "Australia", deu: "Germany", fra: "France", nld: "Netherlands",
  sgp: "Singapore", are: "UAE", pak: "Pakistan", bgd: "Bangladesh",
  bra: "Brazil", esp: "Spain", ita: "Italy", jpn: "Japan", kor: "South Korea",
  idn: "Indonesia", phl: "Philippines", nga: "Nigeria", zaf: "South Africa",
  irl: "Ireland", che: "Switzerland", swe: "Sweden", isr: "Israel",
};
const countryName = (code: string): string =>
  COUNTRY_NAMES[(code || "").toLowerCase()] ?? (code || "Unknown").toUpperCase();

const pctOf = (part: number, whole: number): number =>
  whole > 0 ? Math.round((part / whole) * 100) : 0;

// Deterministic "what's working / what's not / next best thing" — always present,
// grounded strictly in this window's numbers (the AI plan goes deeper on demand).
function deriveInsights(a: {
  days: number;
  kpis: { clicks: Kpi; impressions: Kpi; ctr: Kpi; position: Kpi };
  totalClicks: number;
  totalImpr: number;
  contentTypes: ContentBucket[];
  topPages: SeoPage[];
  pages: SeoPage[];
  strikingDistance: SeoQuery[];
  decayingQueries: SeoQuery[];
}): SeoInsights {
  const { days, kpis, totalClicks, totalImpr, contentTypes, topPages, pages, strikingDistance, decayingQueries } = a;
  const n = (x: number) => Math.round(x).toLocaleString("en-US");
  const working: string[] = [];
  const notWorking: string[] = [];

  // --- what's working ---
  if (kpis.impressions.deltaPct !== null && kpis.impressions.deltaPct >= 15)
    working.push(`Visibility is climbing — you showed up ${kpis.impressions.deltaPct}% more often than the previous ${days} days.`);
  if (kpis.clicks.deltaPct !== null && kpis.clicks.deltaPct >= 15)
    working.push(`Clicks are growing — up ${kpis.clicks.deltaPct}% vs the previous period.`);
  if (kpis.position.deltaPct !== null && kpis.position.deltaPct <= -5)
    working.push(`Your average rank is improving — from position ${kpis.position.prev} to ${kpis.position.value}.`);
  const topCT = contentTypes.find((c) => c.clicks > 0);
  if (topCT)
    working.push(`Your ${topCT.name.toLowerCase()} pull the most traffic — ${n(topCT.clicks)} of ${n(totalClicks)} clicks (${pctOf(topCT.clicks, totalClicks)}%).`);
  const topPage = topPages.find((p) => p.clicks > 0);
  if (topPage && working.length < 4)
    working.push(`${topPage.path} is your single biggest click source (${n(topPage.clicks)} clicks at position ${topPage.position.toFixed(1)}).`);

  // --- what's not working ---
  const ctr = kpis.ctr.value;
  if (totalImpr >= 100 && ctr < 0.02)
    notWorking.push(`You're seen far more than you're clicked — a ${(ctr * 100).toFixed(1)}% click rate turns ${n(totalImpr)} impressions into just ${n(totalClicks)} clicks.`);
  const buried = pages
    .filter((p) => p.impressions >= 20 && p.position > 15)
    .sort((x, y) => y.impressions - x.impressions)[0];
  if (buried)
    notWorking.push(`${buried.path} has real demand (${n(buried.impressions)} impressions) but ranks around position ${buried.position.toFixed(0)} — Google is burying it.`);
  const zeroClick = pages.filter((p) => p.position <= 10 && p.clicks === 0 && p.impressions >= 20);
  if (zeroClick.length)
    notWorking.push(`${zeroClick.length} page${zeroClick.length === 1 ? "" : "s"} rank on page 1 but earn no clicks — each is a title/description you can rewrite today.`);
  const decay = decayingQueries.find((q) => q.prevPosition !== null && q.position - (q.prevPosition as number) >= 3);
  if (decay && notWorking.length < 4)
    notWorking.push(`"${decay.query}" is slipping — from position ${(decay.prevPosition as number).toFixed(0)} to ${decay.position.toFixed(0)}.`);

  // --- the one next best thing ---
  let nextBestThing: string | null = null;
  if (strikingDistance.length >= 4) {
    const eg = strikingDistance.slice(0, 2).map((q) => `"${q.query}"`).join(" and ");
    nextBestThing = `Push your page-2 keywords onto page 1. You rank just short of the first page for ${strikingDistance.length} searches (like ${eg}) — a little more depth on those pages plus internal links could move several up to where the clicks actually are.`;
  } else if (zeroClick.length >= 2) {
    nextBestThing = `Rewrite your titles. ${zeroClick.length} pages already rank on page 1 but get no clicks — more specific, clickable titles and descriptions are the single fastest win.`;
  } else if (buried) {
    nextBestThing = `Rescue ${buried.path}. It has your most untapped demand (${n(buried.impressions)} impressions) but sits on page ${Math.ceil(buried.position / 10)} — beef it up and link to it from your best posts.`;
  } else if (totalImpr > 0 && totalClicks === 0) {
    nextBestThing = `Keep publishing and building links. You're getting indexed and seen, but nothing ranks high enough to click yet — consistency is the play.`;
  }

  return { working: working.slice(0, 4), notWorking: notWorking.slice(0, 4), nextBestThing };
}

const EMPTY: Omit<SeoOverview, "range" | "generatedAt" | "property"> = {
  configured: false,
  error: null,
  hasData: false,
  kpis: {
    clicks: { value: 0, prev: 0, deltaPct: 0 },
    impressions: { value: 0, prev: 0, deltaPct: 0 },
    ctr: { value: 0, prev: 0, deltaPct: 0 },
    position: { value: 0, prev: 0, deltaPct: 0 },
  },
  dailyTrend: [],
  topQueries: [],
  opportunities: { strikingDistance: [], lowCtrWinners: [] },
  pages: { top: [], underperforming: [] },
  movers: { risingQueries: [], decayingQueries: [] },
  traffic: { contentTypes: [], devices: [], countries: [] },
  reach: { keywords: 0, page1: 0, page2: 0, pagesSeen: 0, pagesClicked: 0 },
  insights: { working: [], notWorking: [], nextBestThing: null },
};

// --- ranges + orchestration --------------------------------------------------

export const SEO_RANGES = [7, 28, 90] as const;
export type SeoRange = (typeof SEO_RANGES)[number];

export function normalizeRange(input: string | number | undefined): SeoRange {
  const n = typeof input === "string" ? parseInt(input, 10) : input;
  // Test `n` itself — NOT `n ?? 28`. The old `.includes(n ?? 28)` was true for the
  // default (undefined) case but then returned `n` (undefined), which flowed into
  // windows() → setUTCDate(NaN) → Invalid Date → toISOString() → a 500 on bare
  // /admin/seo (no ?range=). Same bug the analytics page hit; keep them in sync.
  return (SEO_RANGES as readonly number[]).includes(n as number)
    ? (n as SeoRange)
    : 28;
}

export async function getSeoOverview(days: SeoRange): Promise<SeoOverview> {
  const { current, previous } = windows(days);
  const range = {
    days,
    label: `Last ${days} days`,
    currentStart: current.startDate,
    currentEnd: current.endDate,
  };
  const base = { ...EMPTY, property: gscProperty, generatedAt: new Date().toISOString(), range };

  if (!gscConfigured) return { ...base, configured: false };

  const BIG = 25000;
  try {
    // GSC has no batch endpoint, so fan out the seven queries in parallel.
    const [
      curTotals,
      prevTotals,
      curQueries,
      prevQueries,
      curPages,
      prevPages,
      byDate,
      byCountry,
      byDevice,
    ] = await Promise.all([
      searchAnalytics({ ...current, dataState: "final" }),
      searchAnalytics({ ...previous, dataState: "final" }),
      searchAnalytics({ ...current, dimensions: ["query"], rowLimit: BIG, dataState: "final" }),
      searchAnalytics({ ...previous, dimensions: ["query"], rowLimit: BIG, dataState: "final" }),
      searchAnalytics({ ...current, dimensions: ["page"], rowLimit: BIG, dataState: "final" }),
      searchAnalytics({ ...previous, dimensions: ["page"], rowLimit: BIG, dataState: "final" }),
      searchAnalytics({ ...current, dimensions: ["date"], rowLimit: 1000, dataState: "final" }),
      searchAnalytics({ ...current, dimensions: ["country"], rowLimit: 250, dataState: "final" }),
      searchAnalytics({ ...current, dimensions: ["device"], rowLimit: 10, dataState: "final" }),
    ]);

    const ct = curTotals[0];
    const pt = prevTotals[0];
    const kpis = {
      clicks: kpi(ct?.clicks ?? 0, pt?.clicks ?? 0),
      impressions: kpi(ct?.impressions ?? 0, pt?.impressions ?? 0),
      ctr: kpi(ct?.ctr ?? 0, pt?.ctr ?? 0),
      position: kpi(
        Number((ct?.position ?? 0).toFixed(1)),
        Number((pt?.position ?? 0).toFixed(1)),
      ),
    };

    // Previous-window lookups for movement.
    const prevQByKey = new Map(prevQueries.map((r) => [r.keys[0], r]));
    const prevPByKey = new Map(prevPages.map((r) => [r.keys[0], r]));

    const toQuery = (r: GscRow): SeoQuery => {
      const prev = prevQByKey.get(r.keys[0]);
      const exp = expectedCtr(r.position);
      return {
        query: r.keys[0],
        clicks: r.clicks,
        impressions: r.impressions,
        ctr: r.ctr,
        position: r.position,
        prevPosition: prev ? prev.position : null,
        prevClicks: prev ? prev.clicks : null,
        ctrGap: r.impressions >= 10 ? r.ctr - exp : null,
      };
    };

    const queries = curQueries.map(toQuery);

    const topQueries = [...queries]
      .sort((a, b) => b.clicks - a.clicks || b.impressions - a.impressions)
      .slice(0, 15);

    // Striking distance: page-2-ish with real demand, best demand first.
    const strikingDistance = queries
      .filter((q) => q.position >= 5 && q.position <= 20 && q.impressions >= 3)
      .sort((a, b) => b.impressions - a.impressions)
      .slice(0, 15);

    // Good rank, poor CTR: ranks in the top ~10 but clicks well below the curve.
    const lowCtrWinners = queries
      .filter(
        (q) =>
          q.position <= 10 &&
          q.impressions >= 10 &&
          q.ctrGap !== null &&
          q.ctr < expectedCtr(q.position) * 0.5,
      )
      .sort((a, b) => b.impressions - a.impressions)
      .slice(0, 12);

    // Pages.
    const toPage = (r: GscRow): SeoPage => {
      const prev = prevPByKey.get(r.keys[0]);
      return {
        path: stripOrigin(r.keys[0]),
        url: r.keys[0],
        clicks: r.clicks,
        impressions: r.impressions,
        ctr: r.ctr,
        position: r.position,
        prevPosition: prev ? prev.position : null,
        prevClicks: prev ? prev.clicks : null,
      };
    };
    const pages = curPages.map(toPage);
    const topPages = [...pages]
      .sort((a, b) => b.clicks - a.clicks || b.impressions - a.impressions)
      .slice(0, 12);
    // Underperformers: demand but buried (pos > 15), or top-ranked yet starved.
    const underperforming = pages
      .filter(
        (p) =>
          p.impressions >= 10 &&
          (p.position > 15 || (p.position <= 10 && p.clicks === 0)),
      )
      .sort((a, b) => b.impressions - a.impressions)
      .slice(0, 12);

    // Movers: queries present in both windows, ranked by rank change. Require a
    // little demand so noise doesn't dominate. Lower position = better, so a
    // NEGATIVE positionChange is a RISE.
    const withChange = queries
      .filter((q) => q.prevPosition !== null && (q.impressions >= 5 || (q.prevClicks ?? 0) >= 1))
      .map((q) => ({ q, change: q.position - (q.prevPosition as number) }));
    const risingQueries = withChange
      .filter((x) => x.change <= -1)
      .sort((a, b) => a.change - b.change)
      .slice(0, 8)
      .map((x) => x.q);
    const decayingQueries = withChange
      .filter((x) => x.change >= 1)
      .sort((a, b) => b.change - a.change)
      .slice(0, 8)
      .map((x) => x.q);

    const dailyTrend: SeoTrendPoint[] = byDate
      .map((r) => ({
        date: r.keys[0],
        clicks: r.clicks,
        impressions: r.impressions,
        ctr: r.ctr,
        position: r.position,
      }))
      .sort((a, b) => a.date.localeCompare(b.date));

    // --- traffic: where the clicks come from ---------------------------------
    const buckets = new Map<string, ContentBucket>();
    for (const p of pages) {
      const b = contentBucket(p.path);
      const cur = buckets.get(b.key) ?? { key: b.key, name: b.label, clicks: 0, impressions: 0, pages: 0 };
      cur.clicks += p.clicks;
      cur.impressions += p.impressions;
      cur.pages += 1;
      buckets.set(b.key, cur);
    }
    const byClicks = (a: NamedMetric, b: NamedMetric) => b.clicks - a.clicks || b.impressions - a.impressions;
    const traffic: SeoTraffic = {
      contentTypes: [...buckets.values()].sort(byClicks),
      devices: byDevice
        .map((r) => ({ name: titleCase(r.keys[0]), clicks: r.clicks, impressions: r.impressions }))
        .sort(byClicks),
      countries: byCountry
        .map((r) => ({ name: countryName(r.keys[0]), clicks: r.clicks, impressions: r.impressions }))
        .sort(byClicks)
        .slice(0, 5),
    };

    // --- reach: glanceable counts --------------------------------------------
    const seenQueries = queries.filter((q) => q.impressions >= 3);
    const reach: SeoReach = {
      keywords: seenQueries.length,
      page1: seenQueries.filter((q) => q.position <= 10).length,
      page2: seenQueries.filter((q) => q.position > 10 && q.position <= 20).length,
      pagesSeen: pages.filter((p) => p.impressions > 0).length,
      pagesClicked: pages.filter((p) => p.clicks > 0).length,
    };

    // --- insights: what's working / not / next -------------------------------
    const insights = deriveInsights({
      days,
      kpis,
      totalClicks: ct?.clicks ?? 0,
      totalImpr: ct?.impressions ?? 0,
      contentTypes: traffic.contentTypes,
      topPages,
      pages,
      strikingDistance,
      decayingQueries,
    });

    const hasData = (ct?.impressions ?? 0) > 0 || queries.length > 0;

    return {
      ...base,
      configured: true,
      hasData,
      kpis,
      dailyTrend,
      topQueries,
      opportunities: { strikingDistance, lowCtrWinners },
      pages: { top: topPages, underperforming },
      movers: { risingQueries, decayingQueries },
      traffic,
      reach,
      insights,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "GSC request failed";
    return { ...base, configured: true, error: message };
  }
}
