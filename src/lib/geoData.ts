import "server-only";

// Read side for the /admin/geo panel: the latest AI-visibility check per query,
// rolled up into "are we cited" stats + the winning/losing lists. Service-role
// only (the table has RLS on, no policy). Degrades to an empty overview when the
// key isn't configured, so the page renders regardless.

import { supabaseService } from "@/lib/supabase-service";

export type VisRow = {
  query: string;
  cited: boolean;
  best_position: number | null;
  wortins_url: string | null;
  notes: string | null;
  checked_at: string;
};

export type VisOverview = {
  configured: boolean;
  total: number;
  cited: number;
  citedPct: number;
  latestAt: string | null;
  winning: VisRow[]; // cited, best position first
  losing: VisRow[]; // not cited — the robots' target list
};

const EMPTY: VisOverview = {
  configured: false,
  total: 0,
  cited: 0,
  citedPct: 0,
  latestAt: null,
  winning: [],
  losing: [],
};

export async function getVisibilityOverview(): Promise<VisOverview> {
  const db = supabaseService();
  if (!db) return EMPTY;

  const { data } = await db
    .from("ai_visibility")
    .select("query,cited,best_position,wortins_url,notes,checked_at")
    .order("checked_at", { ascending: false })
    .limit(1000);

  const rows = (data ?? []) as VisRow[];
  if (rows.length === 0) return { ...EMPTY, configured: true };

  // Keep only the newest check per query.
  const seen = new Set<string>();
  const latest: VisRow[] = [];
  for (const r of rows) {
    const k = r.query.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    latest.push(r);
  }

  const cited = latest.filter((r) => r.cited);
  return {
    configured: true,
    total: latest.length,
    cited: cited.length,
    citedPct: latest.length ? cited.length / latest.length : 0,
    latestAt: rows[0]?.checked_at ?? null,
    winning: cited
      .slice()
      .sort((a, b) => (a.best_position ?? 99) - (b.best_position ?? 99)),
    losing: latest.filter((r) => !r.cited),
  };
}
