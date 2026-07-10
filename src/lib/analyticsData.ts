import "server-only";

// Analytics aggregation layer — the "brain" behind /admin/analytics.
//
// It fuses two very different data sources into one typed AnalyticsOverview:
//   • Google Analytics (via src/lib/ga.ts) — how people ARRIVE: users, sessions,
//     channels, landing pages, geography, device.
//   • Supabase (via the service-role client) — what people DO once here:
//     interactions (like/less/click/dwell), per-section engagement, which
//     sources & tech levels land, referral attribution, subscribers.
//
// Every function degrades gracefully: GA panels empty out (with an error string)
// when GA isn't configured or errors; Supabase panels empty out when the service
// role key is unset. The page stays up regardless. The caller MUST verify
// isAdmin() before invoking any of this — same contract as adminData.ts.

import { supabaseService } from "@/lib/supabase-service";
import {
  batchRunReports,
  gaConfigured,
  type GaReportRequest,
} from "@/lib/ga";
import { SECTIONS, type Section } from "@/lib/types";

// --- shared shapes -----------------------------------------------------------

export type Kpi = {
  value: number;
  prev: number;
  // Percent change vs the previous period, rounded. null = no prior baseline
  // (prev was 0) — render as "new" rather than a bogus ∞%.
  deltaPct: number | null;
};

export type TrendPoint = { date: string; value: number };
export type NamedCount = { name: string; value: number };

export type SectionEngagement = {
  section: Section;
  label: string;
  interactions: number;
  clicks: number;
  likes: number;
  less: number;
  dwellAvgSec: number | null;
  // Share of like-vs-less signal that is positive (0..100). null when there is
  // no like/less signal yet.
  positivity: number | null;
};

export type ItemPerf = {
  id: string;
  title: string;
  section: Section | null;
  source: string | null;
  clicks: number;
  likes: number;
  less: number;
  score: number;
};

export type SourcePerf = {
  source: string;
  items: number;
  clicks: number;
  likes: number;
  less: number;
};

export type TechLevelPerf = {
  level: number;
  items: number;
  clicks: number;
  likes: number;
  less: number;
};

export type GaSection = {
  configured: boolean;
  error: string | null;
  kpis: {
    users: Kpi;
    sessions: Kpi;
    newUsers: Kpi;
    engagementRate: Kpi; // 0..1
    avgSessionSec: Kpi;
  };
  sessionsTrend: TrendPoint[];
  channels: NamedCount[];
  landingPages: { path: string; sessions: number }[];
  countries: NamedCount[];
  devices: NamedCount[];
};

export type ProductSection = {
  configured: boolean;
  totalUsers: number;
  activeThisWeek: number;
  newUsersTrend: TrendPoint[];
  referralSources: NamedCount[];
  interactionsByAction: NamedCount[];
  sections: SectionEngagement[];
  topItems: ItemPerf[];
  bottomItems: ItemPerf[];
  topSources: SourcePerf[];
  techLevels: TechLevelPerf[];
};

export type NewsletterSection = {
  subscribers: number;
  confirmed: number;
  bySource: NamedCount[];
  newInRange: number;
  growthTrend: TrendPoint[];
  recentSends: { date: string; recipients: number; provider: string }[];
};

export type AnalyticsOverview = {
  range: { days: number; label: string };
  generatedAt: string;
  ga: GaSection;
  product: ProductSection;
  newsletter: NewsletterSection;
};

// --- helpers -----------------------------------------------------------------

const SECTION_LABEL: Record<Section, string> = {
  daily: "Daily AI Updates",
  tools: "New Tools",
  articles: "Interesting Articles",
  funding: "Funding",
};
// Prefer the app's own labels where defined; fall back to the map above.
for (const s of SECTIONS) SECTION_LABEL[s.key] = s.label;

const ALL_SECTIONS: Section[] = ["daily", "tools", "articles", "funding"];

function kpi(cur: number, prev: number): Kpi {
  const deltaPct =
    prev > 0 ? Math.round(((cur - prev) / prev) * 100) : cur > 0 ? null : 0;
  return { value: cur, prev, deltaPct };
}

// GA `date` dimension comes back as "YYYYMMDD"; make it "YYYY-MM-DD".
function fmtGaDate(raw: string): string {
  if (raw.length !== 8) return raw;
  return `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`;
}

function dayKey(iso: string | null): string | null {
  if (!iso) return null;
  return iso.slice(0, 10); // YYYY-MM-DD
}

// --- Google Analytics --------------------------------------------------------

const EMPTY_KPI: Kpi = { value: 0, prev: 0, deltaPct: 0 };

function emptyGa(configured: boolean, error: string | null): GaSection {
  return {
    configured,
    error,
    kpis: {
      users: EMPTY_KPI,
      sessions: EMPTY_KPI,
      newUsers: EMPTY_KPI,
      engagementRate: EMPTY_KPI,
      avgSessionSec: EMPTY_KPI,
    },
    sessionsTrend: [],
    channels: [],
    landingPages: [],
    countries: [],
    devices: [],
  };
}

// Current window is the last `days` days incl. today; previous window is the
// equally-long span immediately before it, so %-change compares like with like.
function gaWindows(days: number) {
  return {
    current: { startDate: `${days}daysAgo`, endDate: "today" },
    previous: {
      startDate: `${days * 2 + 1}daysAgo`,
      endDate: `${days + 1}daysAgo`,
    },
  };
}

const KPI_METRICS = [
  "activeUsers",
  "sessions",
  "newUsers",
  "engagementRate",
  "averageSessionDuration",
];

async function getGa(days: number): Promise<GaSection> {
  if (!gaConfigured) return emptyGa(false, null);

  const { current, previous } = gaWindows(days);
  const desc = (metric: string) => [{ metric: { metricName: metric }, desc: true }];

  // Five reports fit in one batchRunReports call; the last two go in a second.
  const batchA: GaReportRequest[] = [
    { dateRanges: [current], metrics: KPI_METRICS },
    { dateRanges: [previous], metrics: KPI_METRICS },
    {
      dateRanges: [current],
      dimensions: ["date"],
      metrics: ["sessions"],
      orderBys: [{ dimension: { dimensionName: "date" } }],
      keepEmptyRows: true,
      limit: 200,
    },
    {
      dateRanges: [current],
      dimensions: ["sessionDefaultChannelGroup"],
      metrics: ["sessions"],
      orderBys: desc("sessions"),
      limit: 8,
    },
    {
      dateRanges: [current],
      dimensions: ["landingPage"],
      metrics: ["sessions"],
      orderBys: desc("sessions"),
      limit: 10,
    },
  ];
  const batchB: GaReportRequest[] = [
    {
      dateRanges: [current],
      dimensions: ["country"],
      metrics: ["activeUsers"],
      orderBys: desc("activeUsers"),
      limit: 8,
    },
    {
      dateRanges: [current],
      dimensions: ["deviceCategory"],
      metrics: ["sessions"],
      orderBys: desc("sessions"),
    },
  ];

  try {
    const [a, b] = await Promise.all([
      batchRunReports(batchA),
      batchRunReports(batchB),
    ]);
    const [kpiCur, kpiPrev, trend, channels, landing] = a;
    const [countries, devices] = b;

    const curM = kpiCur.rows[0]?.metrics ?? [0, 0, 0, 0, 0];
    const prevM = kpiPrev.rows[0]?.metrics ?? [0, 0, 0, 0, 0];

    return {
      configured: true,
      error: null,
      kpis: {
        users: kpi(curM[0] ?? 0, prevM[0] ?? 0),
        sessions: kpi(curM[1] ?? 0, prevM[1] ?? 0),
        newUsers: kpi(curM[2] ?? 0, prevM[2] ?? 0),
        engagementRate: kpi(curM[3] ?? 0, prevM[3] ?? 0),
        avgSessionSec: kpi(
          Math.round(curM[4] ?? 0),
          Math.round(prevM[4] ?? 0)
        ),
      },
      sessionsTrend: trend.rows.map((r) => ({
        date: fmtGaDate(r.dims[0] ?? ""),
        value: r.metrics[0] ?? 0,
      })),
      channels: channels.rows.map((r) => ({
        name: r.dims[0] || "Unassigned",
        value: r.metrics[0] ?? 0,
      })),
      landingPages: landing.rows.map((r) => ({
        path: r.dims[0] || "(not set)",
        sessions: r.metrics[0] ?? 0,
      })),
      countries: countries.rows.map((r) => ({
        name: r.dims[0] || "(unknown)",
        value: r.metrics[0] ?? 0,
      })),
      devices: devices.rows.map((r) => ({
        name: r.dims[0] || "(unknown)",
        value: r.metrics[0] ?? 0,
      })),
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "GA request failed";
    return emptyGa(true, message);
  }
}

// --- Supabase product data ---------------------------------------------------

type InterRow = {
  user_id: string | null;
  item_id: string | null;
  action: string | null;
  dwell_ms: number | null;
  created_at: string | null;
};
type ItemRow = {
  id: string;
  section: Section | null;
  source: string | null;
  tech_level: number | null;
  title: string | null;
};

const EMPTY_PRODUCT: ProductSection = {
  configured: false,
  totalUsers: 0,
  activeThisWeek: 0,
  newUsersTrend: [],
  referralSources: [],
  interactionsByAction: [],
  sections: [],
  topItems: [],
  bottomItems: [],
  topSources: [],
  techLevels: [],
};

function topN(map: Map<string, number>, n: number): NamedCount[] {
  return [...map.entries()]
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, n);
}

async function getProduct(days: number): Promise<ProductSection> {
  const db = supabaseService();
  if (!db) return EMPTY_PRODUCT;

  const sinceISO = new Date(
    Date.now() - days * 24 * 60 * 60 * 1000
  ).toISOString();
  const weekAgoISO = new Date(
    Date.now() - 7 * 24 * 60 * 60 * 1000
  ).toISOString();

  const [usersRes, interRes, itemsRes] = await Promise.all([
    db.from("users").select("id, created_at, referral_source"),
    // Range-scoped so this stays bounded as interactions grow. (At larger scale
    // this should paginate past Supabase's default 1000-row cap.)
    db
      .from("interactions")
      .select("user_id, item_id, action, dwell_ms, created_at")
      .gte("created_at", sinceISO)
      .limit(5000),
    db.from("items").select("id, section, source, tech_level, title"),
  ]);

  const users = (usersRes.data ?? []) as Array<{
    id: string;
    created_at: string | null;
    referral_source: string | null;
  }>;
  const inter = (interRes.data ?? []) as InterRow[];
  const items = (itemsRes.data ?? []) as ItemRow[];

  const itemById = new Map<string, ItemRow>();
  for (const it of items) itemById.set(it.id, it);

  // New-user signups per day within the range, + referral attribution.
  const signupsByDay = new Map<string, number>();
  const referral = new Map<string, number>();
  for (const u of users) {
    const day = dayKey(u.created_at);
    if (day && u.created_at && u.created_at >= sinceISO) {
      signupsByDay.set(day, (signupsByDay.get(day) ?? 0) + 1);
    }
    const ref = (u.referral_source || "").trim() || "direct / unknown";
    referral.set(ref, (referral.get(ref) ?? 0) + 1);
  }

  // Interaction rollups.
  const actionCount = new Map<string, number>();
  const activeUsers = new Set<string>();

  type Agg = { clicks: number; likes: number; less: number };
  const bySection = new Map<Section, Agg & { interactions: number; dwellSum: number; dwellN: number }>();
  const byItem = new Map<string, Agg>();
  const bySource = new Map<string, Agg & { items: Set<string> }>();
  const byTech = new Map<number, Agg & { items: Set<string> }>();

  const bump = (agg: Agg, action: string) => {
    if (action === "click") agg.clicks += 1;
    else if (action === "like") agg.likes += 1;
    else if (action === "less") agg.less += 1;
  };

  for (const row of inter) {
    const action = row.action ?? "";
    actionCount.set(action, (actionCount.get(action) ?? 0) + 1);
    if (row.user_id && row.created_at && row.created_at >= weekAgoISO) {
      activeUsers.add(row.user_id);
    }

    const item = row.item_id ? itemById.get(row.item_id) : undefined;

    // Section rollup.
    const section = item?.section ?? null;
    if (section) {
      const s =
        bySection.get(section) ??
        { clicks: 0, likes: 0, less: 0, interactions: 0, dwellSum: 0, dwellN: 0 };
      bump(s, action);
      s.interactions += 1;
      if (typeof row.dwell_ms === "number" && row.dwell_ms > 0) {
        s.dwellSum += row.dwell_ms;
        s.dwellN += 1;
      }
      bySection.set(section, s);
    }

    // Per-item rollup.
    if (row.item_id) {
      const a = byItem.get(row.item_id) ?? { clicks: 0, likes: 0, less: 0 };
      bump(a, action);
      byItem.set(row.item_id, a);
    }

    // Source + tech-level rollups (need the item join).
    if (item) {
      const src = (item.source || "").trim() || "(unattributed)";
      const sAgg =
        bySource.get(src) ?? { clicks: 0, likes: 0, less: 0, items: new Set() };
      bump(sAgg, action);
      if (item.id) sAgg.items.add(item.id);
      bySource.set(src, sAgg);

      if (typeof item.tech_level === "number") {
        const tAgg =
          byTech.get(item.tech_level) ??
          { clicks: 0, likes: 0, less: 0, items: new Set() };
        bump(tAgg, action);
        tAgg.items.add(item.id);
        byTech.set(item.tech_level, tAgg);
      }
    }
  }

  // Section engagement, always emitting all sections (0s included) so the UI is
  // stable and comparisons are honest.
  const sections: SectionEngagement[] = ALL_SECTIONS.map((sec) => {
    const s = bySection.get(sec);
    const clicks = s?.clicks ?? 0;
    const likes = s?.likes ?? 0;
    const less = s?.less ?? 0;
    const signal = likes + less;
    return {
      section: sec,
      label: SECTION_LABEL[sec],
      interactions: s?.interactions ?? 0,
      clicks,
      likes,
      less,
      dwellAvgSec:
        s && s.dwellN > 0 ? Math.round(s.dwellSum / s.dwellN / 1000) : null,
      positivity: signal > 0 ? Math.round((likes / signal) * 100) : null,
    };
  });

  // Item leaderboard. Score rewards likes + clicks, penalizes "less".
  const itemPerf: ItemPerf[] = [...byItem.entries()].map(([id, a]) => {
    const it = itemById.get(id);
    return {
      id,
      title: it?.title ?? "(unknown item)",
      section: it?.section ?? null,
      source: it?.source ?? null,
      clicks: a.clicks,
      likes: a.likes,
      less: a.less,
      score: a.likes * 2 + a.clicks - a.less,
    };
  });
  const ranked = [...itemPerf].sort((a, b) => b.score - a.score);
  const topItems = ranked.slice(0, 8);
  // Bottom = genuinely negative/ignored items only (score < top), most-negative first.
  const bottomItems = ranked
    .filter((i) => i.less > 0 || i.score < 0)
    .sort((a, b) => a.score - b.score)
    .slice(0, 5);

  const topSources: SourcePerf[] = [...bySource.entries()]
    .map(([source, a]) => ({
      source,
      items: a.items.size,
      clicks: a.clicks,
      likes: a.likes,
      less: a.less,
    }))
    .sort((a, b) => b.likes * 2 + b.clicks - (a.likes * 2 + a.clicks))
    .slice(0, 10);

  const techLevels: TechLevelPerf[] = [...byTech.entries()]
    .map(([level, a]) => ({
      level,
      items: a.items.size,
      clicks: a.clicks,
      likes: a.likes,
      less: a.less,
    }))
    .sort((a, b) => a.level - b.level);

  const newUsersTrend: TrendPoint[] = [...signupsByDay.entries()]
    .map(([date, value]) => ({ date, value }))
    .sort((a, b) => a.date.localeCompare(b.date));

  return {
    configured: true,
    totalUsers: users.length,
    activeThisWeek: activeUsers.size,
    newUsersTrend,
    referralSources: topN(referral, 8),
    interactionsByAction: [...actionCount.entries()]
      .filter(([name]) => name)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value),
    sections,
    topItems,
    bottomItems,
    topSources,
    techLevels,
  };
}

// --- Newsletter --------------------------------------------------------------

const EMPTY_NEWSLETTER: NewsletterSection = {
  subscribers: 0,
  confirmed: 0,
  bySource: [],
  newInRange: 0,
  growthTrend: [],
  recentSends: [],
};

async function getNewsletter(days: number): Promise<NewsletterSection> {
  const db = supabaseService();
  if (!db) return EMPTY_NEWSLETTER;

  const sinceISO = new Date(
    Date.now() - days * 24 * 60 * 60 * 1000
  ).toISOString();

  const [subsRes, sendsRes] = await Promise.all([
    db.from("subscribers").select("source, status, confirmed, created_at"),
    db
      .from("newsletter_sends")
      .select("edition_date, recipients, provider, sent_at")
      .order("sent_at", { ascending: false })
      .limit(8),
  ]);

  const subs = (subsRes.data ?? []) as Array<{
    source: string | null;
    status: string | null;
    confirmed: boolean | null;
    created_at: string | null;
  }>;
  const sends = (sendsRes.data ?? []) as Array<{
    edition_date: string | null;
    recipients: number | null;
    provider: string | null;
  }>;

  const active = subs.filter((s) => (s.status ?? "active") !== "unsubscribed");
  const bySource = new Map<string, number>();
  const byDay = new Map<string, number>();
  let newInRange = 0;
  for (const s of active) {
    const src = (s.source || "").trim() || "site";
    bySource.set(src, (bySource.get(src) ?? 0) + 1);
    if (s.created_at && s.created_at >= sinceISO) {
      newInRange += 1;
      const day = dayKey(s.created_at);
      if (day) byDay.set(day, (byDay.get(day) ?? 0) + 1);
    }
  }

  return {
    subscribers: active.length,
    confirmed: active.filter((s) => s.confirmed).length,
    bySource: topN(bySource, 8),
    newInRange,
    growthTrend: [...byDay.entries()]
      .map(([date, value]) => ({ date, value }))
      .sort((a, b) => a.date.localeCompare(b.date)),
    recentSends: sends.map((s) => ({
      date: s.edition_date ?? "",
      recipients: s.recipients ?? 0,
      provider: s.provider ?? "—",
    })),
  };
}

// --- top-level orchestration -------------------------------------------------

export const ANALYTICS_RANGES = [7, 28, 90] as const;
export type AnalyticsRange = (typeof ANALYTICS_RANGES)[number];

export function normalizeRange(input: string | number | undefined): AnalyticsRange {
  const n = typeof input === "string" ? parseInt(input, 10) : input;
  // Test n itself — NOT `n ?? 28`. The old `.includes(n ?? 28)` returned true for
  // the default (undefined) case but then returned `n` (undefined), which flowed
  // into `new Date(Date.now() - undefined)` → Invalid Date → toISOString() 500.
  return (ANALYTICS_RANGES as readonly number[]).includes(n as number)
    ? (n as AnalyticsRange)
    : 28;
}

export async function getAnalyticsOverview(
  days: AnalyticsRange
): Promise<AnalyticsOverview> {
  // Each source is isolated: a failure in one degrades that section to empty
  // (with an error note where the type allows) instead of 500-ing the page.
  const [ga, product, newsletter] = await Promise.all([
    getGa(days).catch((e) =>
      emptyGa(true, e instanceof Error ? e.message : "GA request failed")
    ),
    getProduct(days).catch((e) => {
      console.error("analytics getProduct failed", e);
      return { ...EMPTY_PRODUCT, configured: true };
    }),
    getNewsletter(days).catch((e) => {
      console.error("analytics getNewsletter failed", e);
      return EMPTY_NEWSLETTER;
    }),
  ]);

  return {
    range: { days, label: `Last ${days} days` },
    generatedAt: new Date().toISOString(),
    ga,
    product,
    newsletter,
  };
}
