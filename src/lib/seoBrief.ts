import "server-only";

// AI SEO brief — data layer + job queue.
//
// The brief is NOT generated inline anymore. To run on the Claude *subscription*
// (no API key, no ToS gray area), synthesis happens in GitHub Actions via the
// `claude` CLI + CLAUDE_CODE_OAUTH_TOKEN — exactly how the curator works. This
// module is the dashboard's side of that job queue:
//   • summarizeForBrief() trims a SeoOverview to the evidence Claude reasons over.
//   • createSeoBriefJob() inserts a 'pending' row (the server action then fires
//     `.github/workflows/seo-brief.yml` via workflow_dispatch).
//   • getSeoBriefRow() polls one job; getLatestReadyBrief() loads the last result.
// The CI job flips the row to 'ready' (or 'error'). Rows live in the private
// `seo_briefs` table (RLS on, no policy → service role only, like `users`).

import { supabaseService } from "@/lib/supabase-service";
import type { SeoOverview } from "@/lib/seoData";

// The "Generate" button is available only when we can fire the workflow. Reads
// degrade gracefully when the service role is missing.
export const seoBriefConfigured = Boolean(process.env.GITHUB_DISPATCH_TOKEN?.trim());

// One concrete, ranked action. `impact`/`effort` help the operator triage.
export type SeoAction = {
  action: string;
  why: string;
  impact?: "high" | "medium" | "low";
  effort?: "quick" | "medium" | "involved";
};

export type SeoBrief = {
  headline: string;
  working: string[];
  broken: string[];
  doNext: SeoAction[];
  caveat?: string;
};

export type SeoBriefStatus = "pending" | "ready" | "error";

export type SeoBriefRow = {
  id: string;
  range: number;
  status: SeoBriefStatus;
  brief: SeoBrief | null;
  error: string | null;
  model: string | null;
  requestedAt: string | null;
  generatedAt: string | null;
};

const pct = (x: number) => `${(x * 100).toFixed(1)}%`;

// Trim the overview to just the decision-relevant numbers (CTR as %, position to
// 1dp) — this JSON is the evidence the CI job hands to Claude. Exported so the
// server action can build it and stash it on the job row.
export function summarizeForBrief(o: SeoOverview) {
  const q = (x: {
    query: string;
    clicks: number;
    impressions: number;
    ctr: number;
    position: number;
    prevPosition: number | null;
  }) => ({
    query: x.query,
    clicks: x.clicks,
    impressions: x.impressions,
    ctr: pct(x.ctr),
    position: Number(x.position.toFixed(1)),
    prev_position: x.prevPosition === null ? null : Number(x.prevPosition.toFixed(1)),
  });
  const p = (x: {
    path: string;
    clicks: number;
    impressions: number;
    ctr: number;
    position: number;
  }) => ({
    page: x.path,
    clicks: x.clicks,
    impressions: x.impressions,
    ctr: pct(x.ctr),
    position: Number(x.position.toFixed(1)),
  });

  return {
    range: o.range.label,
    window: `${o.range.currentStart} to ${o.range.currentEnd}`,
    totals_vs_previous_period: {
      clicks: o.kpis.clicks,
      impressions: o.kpis.impressions,
      ctr: {
        value: pct(o.kpis.ctr.value),
        prev: pct(o.kpis.ctr.prev),
        deltaPct: o.kpis.ctr.deltaPct,
      },
      avg_position: o.kpis.position, // NOTE: lower is better
    },
    daily_clicks: o.dailyTrend.map((d) => d.clicks),
    daily_impressions: o.dailyTrend.map((d) => d.impressions),
    top_queries: o.topQueries.map(q),
    opportunities: {
      striking_distance_page2_keywords: o.opportunities.strikingDistance.map(q),
      good_rank_but_low_ctr: o.opportunities.lowCtrWinners.map(q),
    },
    top_pages: o.pages.top.map(p),
    underperforming_pages: o.pages.underperforming.map(p),
    movers: {
      rising_queries: o.movers.risingQueries.map(q),
      falling_queries: o.movers.decayingQueries.map(q),
    },
  };
}

// --- job queue (private seo_briefs table; service role bypasses RLS) ----------

type Raw = {
  id: string;
  range: number;
  status: SeoBriefStatus;
  brief: SeoBrief | null;
  error: string | null;
  model: string | null;
  requested_at: string | null;
  generated_at: string | null;
};

const COLS = "id, range, status, brief, error, model, requested_at, generated_at";

function toRow(r: Raw): SeoBriefRow {
  return {
    id: r.id,
    range: r.range,
    status: r.status,
    brief: r.brief ?? null,
    error: r.error ?? null,
    model: r.model ?? null,
    requestedAt: r.requested_at ?? null,
    generatedAt: r.generated_at ?? null,
  };
}

// Insert a pending job carrying the evidence; the caller fires the workflow with
// the returned id. Returns null when the service role isn't configured.
export async function createSeoBriefJob(
  range: number,
  input: object,
): Promise<string | null> {
  const db = supabaseService();
  if (!db) return null;
  const { data, error } = await db
    .from("seo_briefs")
    .insert({ range, status: "pending", input })
    .select("id")
    .single();
  if (error || !data) return null;
  return (data as { id: string }).id;
}

// Poll one job (the client calls this in a loop after triggering).
export async function getSeoBriefRow(id: string): Promise<SeoBriefRow | null> {
  const db = supabaseService();
  if (!db) return null;
  const { data } = await db.from("seo_briefs").select(COLS).eq("id", id).maybeSingle();
  return data ? toRow(data as Raw) : null;
}

// Latest completed brief for a range — shown on page load.
export async function getLatestReadyBrief(range: number): Promise<SeoBriefRow | null> {
  const db = supabaseService();
  if (!db) return null;
  const { data } = await db
    .from("seo_briefs")
    .select(COLS)
    .eq("range", range)
    .eq("status", "ready")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data ? toRow(data as Raw) : null;
}
