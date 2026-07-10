import "server-only";

// The AI analyst brief. Given a computed AnalyticsOverview, it asks Claude to
// synthesize "what's working / what's not / do next" — grounded strictly in the
// numbers we pass, and explicitly honest about small sample sizes (the app is
// early; N is tiny). No SDK: a plain fetch to the Anthropic Messages API keeps
// the dependency footprint at zero, matching the rest of the app.
//
// Cost control lives at the call site: this only runs when an admin clicks
// "Generate brief". Nothing here executes on page load.

import type { AnalyticsOverview } from "@/lib/analyticsData";

const API_KEY = process.env.ANTHROPIC_API_KEY?.trim();
// On-demand + cached at the UI, so a strong synthesis model is affordable.
// Override with ANALYTICS_BRIEF_MODEL (e.g. claude-haiku-4-5 to cut cost).
const MODEL = process.env.ANALYTICS_BRIEF_MODEL?.trim() || "claude-sonnet-5";

export const briefConfigured = Boolean(API_KEY);

export type Brief = {
  headline: string;
  working: string[];
  notWorking: string[];
  doNext: { action: string; why: string }[];
  caveat?: string;
};

export type BriefResult =
  | { ok: true; brief: Brief; model: string }
  | { ok: false; error: string };

// Trim the overview to just the decision-relevant numbers, so we spend tokens on
// analysis rather than shipping the model a fat object.
function summarize(o: AnalyticsOverview) {
  return {
    range: o.range.label,
    google_analytics: o.ga.configured
      ? {
          error: o.ga.error,
          users: o.ga.kpis.users,
          sessions: o.ga.kpis.sessions,
          new_users: o.ga.kpis.newUsers,
          engagement_rate: o.ga.kpis.engagementRate,
          avg_session_seconds: o.ga.kpis.avgSessionSec,
          sessions_trend_daily: o.ga.sessionsTrend.map((p) => p.value),
          top_channels: o.ga.channels,
          top_landing_pages: o.ga.landingPages,
          countries: o.ga.countries,
          devices: o.ga.devices,
        }
      : "not connected",
    product_supabase: o.product.configured
      ? {
          total_users: o.product.totalUsers,
          active_this_week: o.product.activeThisWeek,
          new_users_in_range: o.product.newUsersTrend.reduce((a, p) => a + p.value, 0),
          referral_sources: o.product.referralSources,
          interactions_by_action: o.product.interactionsByAction,
          section_engagement: o.product.sections,
          top_items: o.product.topItems.map((i) => ({
            title: i.title,
            section: i.section,
            source: i.source,
            clicks: i.clicks,
            likes: i.likes,
            less: i.less,
          })),
          worst_items: o.product.bottomItems.map((i) => ({
            title: i.title,
            section: i.section,
            less: i.less,
            score: i.score,
          })),
          top_sources: o.product.topSources,
          tech_levels: o.product.techLevels,
        }
      : "service role not configured",
    newsletter: {
      subscribers: o.newsletter.subscribers,
      confirmed: o.newsletter.confirmed,
      new_in_range: o.newsletter.newInRange,
      by_source: o.newsletter.bySource,
      recent_sends: o.newsletter.recentSends,
    },
  };
}

const SYSTEM = `You are a sharp, no-fluff growth analyst for Wortins — a personalized AI-news web app with four content sections: "daily" (big-lab AI news), "tools" (new AI tools), "articles" (deeper reads), and "funding" (AI funding rounds). It monetizes attention + a newsletter and is in an early growth/launch phase.

You will receive a JSON snapshot of Google Analytics (acquisition/traffic) and the app's own Supabase product data (engagement: interactions where action is like/less/click/dwell; per-section stats; content source performance; subscribers).

Your job: tell the operator what is working, what is not, and exactly what to do next — with growth as the primary lens, but engagement/retention close behind.

Rules:
- Ground EVERY claim in the numbers provided. Cite the actual figures. Never invent data.
- The sample size is small. Be explicit when a signal is too thin to trust, and say so rather than over-reading noise. Directional reads are fine; false confidence is not.
- "doNext" items must be concrete and specific to Wortins (a channel, a section, a source, a page), ordered by impact. No generic advice like "post more".
- Keep each bullet to one or two tight sentences.

Respond with ONLY a JSON object, no markdown fence, matching exactly:
{
  "headline": "one-sentence bottom line",
  "working": ["..."],
  "notWorking": ["..."],
  "doNext": [{"action": "...", "why": "..."}],
  "caveat": "one sentence on the biggest data-quality/sample caveat"
}`;

function extractJson(text: string): Brief | null {
  // Be forgiving: the model may wrap JSON in prose or a code fence.
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenced ? fenced[1] : text;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  try {
    const obj = JSON.parse(candidate.slice(start, end + 1)) as Partial<Brief>;
    if (!obj.headline || !Array.isArray(obj.working)) return null;
    return {
      headline: String(obj.headline),
      working: (obj.working ?? []).map(String),
      notWorking: (obj.notWorking ?? []).map(String),
      doNext: (obj.doNext ?? [])
        .filter((d): d is { action: string; why: string } => !!d && typeof d === "object")
        .map((d) => ({ action: String(d.action ?? ""), why: String(d.why ?? "") })),
      caveat: obj.caveat ? String(obj.caveat) : undefined,
    };
  } catch {
    return null;
  }
}

export async function generateBrief(o: AnalyticsOverview): Promise<BriefResult> {
  if (!API_KEY) {
    return { ok: false, error: "ANTHROPIC_API_KEY is not set on this deployment." };
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
        max_tokens: 1600,
        system: SYSTEM,
        messages: [
          {
            role: "user",
            content: `Here is the analytics snapshot. Analyze it and return the JSON brief.\n\n${JSON.stringify(
              summarize(o)
            )}`,
          },
        ],
      }),
      signal: AbortSignal.timeout(60_000),
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      return {
        ok: false,
        error: `Anthropic API error (${res.status}): ${detail.slice(0, 200)}`,
      };
    }

    const json = (await res.json()) as {
      content?: { type: string; text?: string }[];
    };
    const text =
      json.content?.find((b) => b.type === "text")?.text ?? "";
    const brief = extractJson(text);
    if (!brief) {
      return { ok: false, error: "Could not parse a brief from the model response." };
    }
    return { ok: true, brief, model: MODEL };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Brief generation failed";
    return { ok: false, error: message };
  }
}
