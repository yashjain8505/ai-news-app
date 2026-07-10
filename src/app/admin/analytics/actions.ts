"use server";

// Server action behind the "Generate brief" button. The auth gate lives HERE
// (never trust the client), and the analytics snapshot is recomputed server-side
// from just the range — the client sends nothing but which window to analyze.

import { isAdmin } from "@/lib/adminData";
import { getAnalyticsOverview, normalizeRange } from "@/lib/analyticsData";
import { generateBrief, type BriefResult } from "@/lib/aiBrief";

export async function generateBriefAction(
  _prev: BriefResult | null,
  formData: FormData
): Promise<BriefResult> {
  if (!(await isAdmin())) {
    return { ok: false, error: "Not authorized." };
  }
  const range = normalizeRange(formData.get("range")?.toString());
  const overview = await getAnalyticsOverview(range);
  return generateBrief(overview);
}
