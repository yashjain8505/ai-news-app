"use server";

// Server action behind the "Generate action plan" button. The auth gate lives
// HERE (never trust the client), and the SEO snapshot is recomputed server-side
// from just the range — the client sends nothing but which window to analyze.

import { isAdmin } from "@/lib/adminData";
import { getSeoOverview, normalizeRange } from "@/lib/seoData";
import { generateSeoBrief, type SeoBriefResult } from "@/lib/seoBrief";

export async function generateSeoBriefAction(
  _prev: SeoBriefResult | null,
  formData: FormData,
): Promise<SeoBriefResult> {
  if (!(await isAdmin())) {
    return { ok: false, error: "Not authorized." };
  }
  const range = normalizeRange(formData.get("range")?.toString());
  const overview = await getSeoOverview(range);
  return generateSeoBrief(overview);
}
