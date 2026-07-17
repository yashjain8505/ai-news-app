import "server-only";

// Reads the AI analyst brief that the analytics-brief GitHub workflow generates
// (via the `claude` CLI + CLAUDE_CODE_OAUTH_TOKEN) and stores in analytics_briefs.
// The app no longer calls any LLM itself — it just displays the latest stored
// brief. Same server-only + service-role contract as adminData.ts.

import { supabaseService } from "@/lib/supabase-service";

export type Brief = {
  headline: string;
  working: string[];
  notWorking: string[];
  doNext: { action: string; why: string }[];
  caveat?: string;
};

export type StoredBrief = {
  brief: Brief;
  model: string | null;
  generatedAt: string;
  range: number;
};

// Latest brief for a range. Falls back to the 28-day brief (the one the workflow
// always generates) so the panel still shows something on the 7/90 views.
// Returns null when nothing has been generated yet.
export async function getStoredBrief(range: number): Promise<StoredBrief | null> {
  const db = supabaseService();
  if (!db) return null;
  try {
    const { data } = await db
      .from("analytics_briefs")
      .select("range, brief, model, generated_at")
      .in("range", [range, 28]);
    const rows = (data ?? []) as Array<{
      range: number;
      brief: Brief | null;
      model: string | null;
      generated_at: string | null;
    }>;
    const row =
      rows.find((r) => r.range === range) ?? rows.find((r) => r.range === 28);
    if (!row || !row.brief) return null;
    return {
      brief: row.brief,
      model: row.model ?? null,
      generatedAt: row.generated_at ?? "",
      range: row.range,
    };
  } catch {
    return null;
  }
}
