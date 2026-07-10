import "server-only";

// The AI SEO brief. Given a computed SeoOverview, it asks Claude to synthesize
// "what's working / what's broken / do next" from Search Console data — grounded
// strictly in the numbers, honest about tiny samples, and specific about which
// page to fix and which query to chase. A twin of aiBrief.ts: no SDK, a plain
// fetch to the Anthropic Messages API keeps the dependency footprint at zero.
//
// Cost control lives at the call site: this only runs when an admin clicks
// "Generate action plan". Nothing here executes on page load.

import type { SeoOverview } from "@/lib/seoData";

const API_KEY = process.env.ANTHROPIC_API_KEY?.trim();
// On-demand + cached at the UI, so a strong synthesis model is affordable.
// Override with SEO_BRIEF_MODEL (e.g. claude-haiku-4-5 to cut cost).
const MODEL = process.env.SEO_BRIEF_MODEL?.trim() || "claude-sonnet-5";

export const seoBriefConfigured = Boolean(API_KEY);

// One concrete, ranked action. `impact` is the model's rough estimate of upside
// so the operator can triage; `effort` flags how much work it is.
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

export type SeoBriefResult =
  | { ok: true; brief: SeoBrief; model: string }
  | { ok: false; error: string };

const pct = (x: number) => `${(x * 100).toFixed(1)}%`;

// Trim the overview to just the decision-relevant numbers, formatted so the model
// reads them the way a human would (CTR as %, position to 1dp).
function summarize(o: SeoOverview) {
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
      ctr: { value: pct(o.kpis.ctr.value), prev: pct(o.kpis.ctr.prev), deltaPct: o.kpis.ctr.deltaPct },
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

const SYSTEM = `You are a sharp, no-fluff SEO strategist for Wortins — a personalized AI-news web app (four sections: daily big-lab news, new AI tools, deeper articles, and AI funding rounds). Its deliberate SEO wedge is a file-based /blog plus per-company AI-funding pages targeting long-tail funding/acquisition queries. It is early: organic traffic is just beginning, so sample sizes are tiny.

You will receive a JSON snapshot from Google Search Console: total clicks/impressions/CTR/average-position (with previous-period deltas), daily series, top queries, opportunity lists (page-2 "striking distance" keywords and pages that rank well but earn few clicks), top pages, underperforming pages, and rank movers.

Your job: tell the operator what's working, what's broken, and EXACTLY what to do next to grow organic clicks — ordered by impact.

How to read the data:
- Average position: LOWER is better (1 = top of page 1; ~11+ = page 2). "avg_position.deltaPct" negative = ranking improved.
- CTR too low for a strong position (e.g. ranking 4 but ~0% CTR) is almost always a weak <title>/meta-description or unappealing snippet — a same-day fix.
- "Striking distance" (position ~5–20) with real impressions is the highest-leverage work: small on-page/content/internal-link nudges can reach page 1 where clicks actually happen.

Rules:
- Ground EVERY claim in the numbers provided. Cite actual figures (impressions, position, CTR, the page path or the query). Never invent data.
- The sample is small. Say so plainly when a signal is too thin to trust; give directional reads, not false confidence.
- doNext items must be concrete and specific: name the exact page path or query, say what to change (e.g. rewrite the title of /blog/x to include "y"), and estimate the upside. No generic advice like "improve SEO" or "write more".
- Prefer fixes the operator can ship today (titles, meta descriptions, internal links, content tweaks on an existing ranking page) over long-horizon bets.
- Keep each bullet to one or two tight sentences.

Respond with ONLY a JSON object, no markdown fence, matching exactly:
{
  "headline": "one-sentence bottom line on organic search right now",
  "working": ["..."],
  "broken": ["..."],
  "doNext": [{"action": "specific action naming a page/query", "why": "the numbers + expected upside", "impact": "high|medium|low", "effort": "quick|medium|involved"}],
  "caveat": "one sentence on the biggest data/sample caveat"
}`;

function extractBrief(text: string): SeoBrief | null {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenced ? fenced[1] : text;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  try {
    const obj = JSON.parse(candidate.slice(start, end + 1)) as Partial<SeoBrief>;
    if (!obj.headline || !Array.isArray(obj.working)) return null;
    const oneOf = <T extends string>(v: unknown, allowed: T[]): T | undefined =>
      typeof v === "string" && (allowed as string[]).includes(v) ? (v as T) : undefined;
    return {
      headline: String(obj.headline),
      working: (obj.working ?? []).map(String),
      broken: (obj.broken ?? []).map(String),
      doNext: (obj.doNext ?? [])
        .filter((d): d is SeoAction => !!d && typeof d === "object")
        .map((d) => ({
          action: String(d.action ?? ""),
          why: String(d.why ?? ""),
          impact: oneOf(d.impact, ["high", "medium", "low"]),
          effort: oneOf(d.effort, ["quick", "medium", "involved"]),
        })),
      caveat: obj.caveat ? String(obj.caveat) : undefined,
    };
  } catch {
    return null;
  }
}

export async function generateSeoBrief(o: SeoOverview): Promise<SeoBriefResult> {
  if (!API_KEY) {
    return { ok: false, error: "ANTHROPIC_API_KEY is not set on this deployment." };
  }
  if (!o.hasData) {
    return {
      ok: false,
      error:
        "Not enough Search Console data yet to brief on — impressions are still near zero. Check back once Google has indexed and started ranking more pages.",
    };
  }

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": API_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 2000,
        system: SYSTEM,
        messages: [
          {
            role: "user",
            content: `Here is the Search Console snapshot. Analyze it and return the JSON brief.\n\n${JSON.stringify(
              summarize(o),
            )}`,
          },
        ],
      }),
      signal: AbortSignal.timeout(60_000),
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      return { ok: false, error: `Anthropic API error (${res.status}): ${detail.slice(0, 200)}` };
    }

    const json = (await res.json()) as { content?: { type: string; text?: string }[] };
    const text = json.content?.find((b) => b.type === "text")?.text ?? "";
    const brief = extractBrief(text);
    if (!brief) return { ok: false, error: "Could not parse a brief from the model response." };
    return { ok: true, brief, model: MODEL };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Brief generation failed";
    return { ok: false, error: message };
  }
}
