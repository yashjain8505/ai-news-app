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
