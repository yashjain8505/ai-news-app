import { supabase } from "./supabase";
import { Item, Section } from "./types";

// Non-personalized, server-side reads for the PUBLIC (crawlable) pages.
// Uses the anon client; RLS already allows anyone to read active items.

export async function getLatestEditionDate(): Promise<string | null> {
  const { data } = await supabase
    .from("items")
    .select("edition_date")
    .eq("is_active", true)
    .not("edition_date", "is", null)
    .order("edition_date", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data?.edition_date as string | undefined) ?? null;
}

export async function getEditionItems(date: string): Promise<Item[]> {
  const { data } = await supabase
    .from("items")
    .select("*")
    .eq("is_active", true)
    .eq("edition_date", date)
    .order("section", { ascending: true })
    .order("rank", { ascending: true });
  return (data ?? []) as Item[];
}

export async function getSectionItems(
  section: Section,
  limit = 40
): Promise<Item[]> {
  const { data } = await supabase
    .from("items")
    .select("*")
    .eq("is_active", true)
    .eq("section", section)
    .order("edition_date", { ascending: false })
    .order("rank", { ascending: true })
    .limit(limit);
  return (data ?? []) as Item[];
}

export async function getAllEditionDates(): Promise<string[]> {
  const { data } = await supabase
    .from("items")
    .select("edition_date")
    .eq("is_active", true)
    .not("edition_date", "is", null)
    .order("edition_date", { ascending: false });
  const seen = new Set<string>();
  for (const row of (data ?? []) as { edition_date: string | null }[]) {
    if (row.edition_date) seen.add(row.edition_date);
  }
  return [...seen];
}

// Most recent publish time across an item list, for <lastmod> / dateModified.
export function newestPublishedAt(items: Item[]): string | null {
  let max: string | null = null;
  for (const it of items) {
    if (it.published_at && (!max || it.published_at > max)) max = it.published_at;
  }
  return max;
}

// All edition headlines in one query, for the archive list (date -> headline).
export async function getEditionHeadlines(): Promise<Map<string, string>> {
  const { data } = await supabase
    .from("editions")
    .select("edition_date, headline");
  const m = new Map<string, string>();
  for (const r of (data ?? []) as {
    edition_date: string;
    headline: string | null;
  }[]) {
    if (r.headline) m.set(r.edition_date, r.headline);
  }
  return m;
}

// ---- Per-story (per-item) reads for the /story/[slug] page engine ----

// One active story by its stable slug (unique). Null if missing/inactive.
export async function getStoryBySlug(slug: string): Promise<Item | null> {
  const { data } = await supabase
    .from("items")
    .select("*")
    .eq("is_active", true)
    .eq("slug", slug)
    .maybeSingle();
  return (data as Item | null) ?? null;
}

// Recent active stories related to `item` — same section OR sharing a tag —
// excluding the item itself, newest-first. Powers the "Related stories" list
// and internal linking (the SEO crawl graph).
export async function getRelatedStories(
  item: Item,
  limit = 6
): Promise<Item[]> {
  // Supabase PostgREST `.or()` filter: same section, OR tags share a value.
  // `tags` is a JSONB array, so array-overlap (`ov`) doesn't apply — use the
  // JSONB "contains" operator (`cs` -> `@>`) once per tag: a row matches if its
  // tags contain any of this item's tags. Values are wrapped in a single-element
  // JSON array; inner double-quotes are escaped so `.or()` parsing stays intact.
  const orClauses = [`section.eq.${item.section}`];
  if (item.tags && item.tags.length > 0) {
    for (const t of item.tags) {
      const esc = t.replace(/"/g, '\\"');
      orClauses.push(`tags.cs.["${esc}"]`);
    }
  }
  const { data } = await supabase
    .from("items")
    .select("*")
    .eq("is_active", true)
    .neq("id", item.id)
    .or(orClauses.join(","))
    .order("published_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(limit);
  return (data ?? []) as Item[];
}

export type IndexableStorySlug = {
  slug: string;
  section: Section;
  published_at: string | null;
  created_at: string;
};

// Active stories that carry an ORIGINAL editorial take (wortins_take present &
// non-empty) — the only ones thin/duplicate-safe to index. Feeds the sitemap.
// Empty right now (takes not yet backfilled); that's the intended rollout state.
export async function getIndexableStorySlugs(
  limit = 5000
): Promise<IndexableStorySlug[]> {
  const { data } = await supabase
    .from("items")
    .select("slug, section, published_at, created_at")
    .eq("is_active", true)
    .not("wortins_take", "is", null)
    .neq("wortins_take", "")
    .order("published_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(limit);
  return (data ?? []) as IndexableStorySlug[];
}

export type EditionMeta = { headline: string | null; synopsis: string | null };

// Original per-edition synthesis (the curator's "read" of the day) — the
// non-aggregated, citable content that powers GEO.
export async function getEditionSynopsis(
  date: string
): Promise<EditionMeta | null> {
  const { data } = await supabase
    .from("editions")
    .select("headline, synopsis")
    .eq("edition_date", date)
    .maybeSingle();
  return (data as EditionMeta | null) ?? null;
}
