"use server";

// Server actions behind the "Generate action plan" button.
//
// The brief runs on the Claude *subscription* via GitHub Actions (no API key), so
// this doesn't call an LLM. Instead it: recomputes the GSC snapshot server-side
// (we hold the key), stashes it as a `seo_briefs` job row, and fires the
// `seo-brief.yml` workflow — mirroring requestFreshNews() for the curator. The
// client then polls `pollSeoBriefAction` until the CI job flips the row to
// ready/error. The auth gate lives HERE; the client sends only the range.

import { isAdmin } from "@/lib/adminData";
import { getSeoOverview, normalizeRange } from "@/lib/seoData";
import {
  summarizeForBrief,
  createSeoBriefJob,
  getSeoBriefRow,
  type SeoBriefRow,
} from "@/lib/seoBrief";

const GH_REPO = "yashjain8505/ai-news-app";
const GH_WORKFLOW = "seo-brief.yml";

type RequestBriefResult =
  | { ok: true; briefId: string }
  | { ok: false; error: string };

export async function requestSeoBriefAction(rangeInput: number): Promise<RequestBriefResult> {
  if (!(await isAdmin())) return { ok: false, error: "Not authorized." };

  const token = process.env.GITHUB_DISPATCH_TOKEN;
  if (!token) return { ok: false, error: "GITHUB_DISPATCH_TOKEN is not set on this deployment." };

  const range = normalizeRange(rangeInput);
  const overview = await getSeoOverview(range);
  if (!overview.configured) {
    return { ok: false, error: "Search Console isn't connected (GSC_SERVICE_ACCOUNT_B64)." };
  }
  if (overview.error) return { ok: false, error: `Search Console error: ${overview.error}` };
  if (!overview.hasData) {
    return { ok: false, error: "Not enough Search Console data yet to brief on." };
  }

  // Stash the evidence as a pending job for the CI worker to pick up.
  const briefId = await createSeoBriefJob(range, summarizeForBrief(overview));
  if (!briefId) {
    return { ok: false, error: "Could not queue the brief (service role not configured)." };
  }

  // Fire the workflow — same shape as requestFreshNews().
  try {
    const res = await fetch(
      `https://api.github.com/repos/${GH_REPO}/actions/workflows/${GH_WORKFLOW}/dispatches`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
          "User-Agent": "wortins-seo",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ ref: "main", inputs: { brief_id: briefId } }),
        cache: "no-store",
      },
    );
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      return { ok: false, error: `Workflow dispatch failed (${res.status}): ${detail.slice(0, 160)}` };
    }
    return { ok: true, briefId };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Workflow dispatch failed." };
  }
}

// Poll a specific job row (called in a loop by the client after triggering).
export async function pollSeoBriefAction(briefId: string): Promise<SeoBriefRow | null> {
  if (!(await isAdmin())) return null;
  return getSeoBriefRow(briefId);
}
