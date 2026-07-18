import "server-only";

// Lean data layer for the simplified /admin/analytics — a clean mirror of the
// Google Analytics basics (numbers, where-from, countries/cities, pages, devices)
// for the periods that matter (today / yesterday / 7d / 28d), plus the top
// organic search queries from Search Console. No product/engagement tables.
//
// Kept separate from analyticsData.ts (which still powers the AI-brief pipeline)
// so this page stays simple and the brief keeps working untouched.

import {
  batchRunReports,
  gaConfigured,
  type GaDateRange,
  type GaReportRequest,
} from "@/lib/ga";
import { searchAnalytics, gscConfigured, isoDaysAgo } from "@/lib/gsc";

// --- ranges ------------------------------------------------------------------

export const RANGE_PRESETS = [
  { key: "today", label: "Today" },
  { key: "yesterday", label: "Yesterday" },
  { key: "7d", label: "7 days" },
  { key: "28d", label: "28 days" },
] as const;

export type RangeKey = (typeof RANGE_PRESETS)[number]["key"];

export function normalizeRangeKey(input: string | undefined): RangeKey {
  return RANGE_PRESETS.some((r) => r.key === input) ? (input as RangeKey) : "7d";
}

// Current window + the equally-long prior window (for % change). Today compares
// to yesterday; note "today" is a partial day, so the view hides its delta.
function windows(key: RangeKey): { current: GaDateRange; previous: GaDateRange } {
  switch (key) {
    case "today":
      return {
        current: { startDate: "today", endDate: "today" },
        previous: { startDate: "yesterday", endDate: "yesterday" },
      };
    case "yesterday":
      return {
        current: { startDate: "yesterday", endDate: "yesterday" },
        previous: { startDate: "2daysAgo", endDate: "2daysAgo" },
      };
    case "7d":
      return {
        current: { startDate: "6daysAgo", endDate: "today" },
        previous: { startDate: "13daysAgo", endDate: "7daysAgo" },
      };
    case "28d":
      return {
        current: { startDate: "27daysAgo", endDate: "today" },
        previous: { startDate: "55daysAgo", endDate: "28daysAgo" },
      };
  }
}

// --- shapes ------------------------------------------------------------------

export type Stat = { value: number; prev: number; deltaPct: number | null };
export type NamedCount = { name: string; value: number };
export type QueryRow = { query: string; clicks: number; impressions: number };

export type GaBlock = {
  configured: boolean;
  error: string | null;
  users: Stat;
  sessions: Stat;
  newUsers: Stat;
  avgEngagementSec: Stat;
  channels: NamedCount[];
  countries: NamedCount[];
  cities: NamedCount[];
  pages: { path: string; views: number }[];
  devices: NamedCount[];
};

export type QueriesBlock = {
  configured: boolean;
  error: string | null;
  windowLabel: string;
  rows: QueryRow[];
};

export type SimpleAnalytics = {
  rangeKey: RangeKey;
  rangeLabel: string;
  generatedAt: string;
  ga: GaBlock;
  queries: QueriesBlock;
};

function kpi(cur: number, prev: number): Stat {
  const deltaPct =
    prev > 0 ? Math.round(((cur - prev) / prev) * 100) : cur > 0 ? null : 0;
  return { value: cur, prev, deltaPct };
}

const EMPTY_STAT: Stat = { value: 0, prev: 0, deltaPct: 0 };

function emptyGa(configured: boolean, error: string | null): GaBlock {
  return {
    configured,
    error,
    users: EMPTY_STAT,
    sessions: EMPTY_STAT,
    newUsers: EMPTY_STAT,
    avgEngagementSec: EMPTY_STAT,
    channels: [],
    countries: [],
    cities: [],
    pages: [],
    devices: [],
  };
}

const KPI_METRICS = ["activeUsers", "sessions", "newUsers", "averageSessionDuration"];

// --- Google Analytics --------------------------------------------------------

async function getGa(key: RangeKey): Promise<GaBlock> {
  if (!gaConfigured) return emptyGa(false, null);
  const { current, previous } = windows(key);
  const desc = (m: string) => [{ metric: { metricName: m }, desc: true }];

  const batchA: GaReportRequest[] = [
    { dateRanges: [current], metrics: KPI_METRICS },
    { dateRanges: [previous], metrics: KPI_METRICS },
    {
      dateRanges: [current],
      dimensions: ["sessionDefaultChannelGroup"],
      metrics: ["sessions"],
      orderBys: desc("sessions"),
      limit: 6,
    },
    {
      dateRanges: [current],
      dimensions: ["country"],
      metrics: ["activeUsers"],
      orderBys: desc("activeUsers"),
      limit: 6,
    },
    {
      dateRanges: [current],
      dimensions: ["city"],
      metrics: ["activeUsers"],
      orderBys: desc("activeUsers"),
      limit: 6,
    },
  ];
  const batchB: GaReportRequest[] = [
    {
      dateRanges: [current],
      dimensions: ["pagePath"],
      metrics: ["screenPageViews"],
      orderBys: desc("screenPageViews"),
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
    const [kc, kp, ch, co, ci] = a;
    const [pg, dv] = b;
    const cm = kc.rows[0]?.metrics ?? [0, 0, 0, 0];
    const pm = kp.rows[0]?.metrics ?? [0, 0, 0, 0];
    const named = (r: (typeof a)[number], fallback: string): NamedCount[] =>
      r.rows.map((row) => ({ name: row.dims[0] || fallback, value: row.metrics[0] ?? 0 }));

    return {
      configured: true,
      error: null,
      users: kpi(cm[0] ?? 0, pm[0] ?? 0),
      sessions: kpi(cm[1] ?? 0, pm[1] ?? 0),
      newUsers: kpi(cm[2] ?? 0, pm[2] ?? 0),
      avgEngagementSec: kpi(Math.round(cm[3] ?? 0), Math.round(pm[3] ?? 0)),
      channels: named(ch, "Unassigned"),
      countries: named(co, "(unknown)"),
      cities: named(ci, "(unknown)").filter((c) => c.name !== "(not set)"),
      pages: pg.rows.map((row) => ({ path: row.dims[0] || "/", views: row.metrics[0] ?? 0 })),
      devices: named(dv, "(unknown)"),
    };
  } catch (err) {
    return emptyGa(true, err instanceof Error ? err.message : "GA request failed");
  }
}

// --- Search Console queries --------------------------------------------------

// GSC data is finalized on a ~2-day lag, so we always show a stable 28-day
// window ending 2 days ago rather than tying it to the GA toggle (today/yesterday
// would be empty). Labelled clearly in the UI.
async function getQueries(): Promise<QueriesBlock> {
  const windowLabel = "last 28 days · Search Console";
  if (!gscConfigured) return { configured: false, error: null, windowLabel, rows: [] };
  try {
    const rows = await searchAnalytics({
      startDate: isoDaysAgo(30),
      endDate: isoDaysAgo(2),
      dimensions: ["query"],
      rowLimit: 25,
      dataState: "final",
    });
    const top = rows
      .map((r) => ({ query: r.keys[0] ?? "", clicks: r.clicks, impressions: r.impressions }))
      .filter((r) => r.query)
      .sort((a, b) => b.clicks - a.clicks || b.impressions - a.impressions)
      .slice(0, 8);
    return { configured: true, error: null, windowLabel, rows: top };
  } catch (err) {
    return {
      configured: true,
      error: err instanceof Error ? err.message : "GSC request failed",
      windowLabel,
      rows: [],
    };
  }
}

// --- orchestration -----------------------------------------------------------

export async function getSimpleAnalytics(key: RangeKey): Promise<SimpleAnalytics> {
  const rangeLabel = RANGE_PRESETS.find((r) => r.key === key)?.label ?? "7 days";
  const [ga, queries] = await Promise.all([getGa(key), getQueries()]);
  return {
    rangeKey: key,
    rangeLabel,
    generatedAt: new Date().toISOString(),
    ga,
    queries,
  };
}
