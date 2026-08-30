import type { NextRequest } from "next/server";
import { searchAnalytics, gscConfigured, isoDaysAgo } from "@/lib/gsc";
import { isBuyerQuery } from "@/lib/searchSegments";

// Buy-intent SEO opportunity feed for the content robots (blog-keywords.yml).
// Returns queries Wortins ALREADY gets Search Console impressions for but ranks
// poorly on (page 2-3) — the highest-ROI things to write next. Guarded by the
// service-role key (the only caller is our own CI). Returns [] (not an error)
// when GSC isn't connected yet, so the robot degrades gracefully.

export const dynamic = "force-dynamic";

// Queries that read like someone close to choosing/paying.
const BUY_INTENT =
  /(\bvs\b|alternative|\bbest\b|pricing|\bcost\b|review|worth|how much|compare|cheapest|\bfree\b|for )/i;

export async function GET(req: NextRequest) {
  const token = req.headers.get("x-seo-token");
  const expected = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!expected || token !== expected) {
    return new Response("unauthorized", { status: 401 });
  }

  if (!gscConfigured) {
    return Response.json([], { headers: { "cache-control": "no-store" } });
  }

  let rows;
  try {
    rows = await searchAnalytics({
      startDate: isoDaysAgo(28),
      endDate: isoDaysAgo(2), // GSC finalizes ~2 days late
      dimensions: ["query"],
      rowLimit: 5000,
      dataState: "final",
    });
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "gsc query failed" },
      { status: 502, headers: { "cache-control": "no-store" } },
    );
  }

  const opps = rows
    // Drop traffic that was never a person before anything is ranked. Alerting
    // tools and research agents issue time-scoped and boolean queries that rank
    // well and never click, so without this the robot commissions posts chasing
    // readers who do not exist — measured at 23% of the topics it was being fed.
    .filter((r) => isBuyerQuery(r.keys[0] ?? ""))
    // Impressions but ranking on page 2-3 (position 4-30) = winnable.
    .filter((r) => r.impressions >= 15 && r.position >= 4 && r.position <= 30)
    .map((r) => ({
      query: r.keys[0] ?? "",
      impressions: r.impressions,
      clicks: r.clicks,
      position: Math.round(r.position * 10) / 10,
      ctr: Math.round(r.ctr * 1000) / 1000,
    }))
    .filter((o) => o.query)
    // Buy-intent queries first, then by impression volume.
    .sort((a, b) => {
      const ai = BUY_INTENT.test(a.query) ? 1 : 0;
      const bi = BUY_INTENT.test(b.query) ? 1 : 0;
      if (ai !== bi) return bi - ai;
      return b.impressions - a.impressions;
    })
    .slice(0, 40);

  return Response.json(opps, { headers: { "cache-control": "no-store" } });
}
