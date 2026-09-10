import { createClient } from "@supabase/supabase-js";

// Publishable (anon) key, safe to expose in the client; all access is gated by RLS.
const url =
  process.env.NEXT_PUBLIC_SUPABASE_URL ??
  "https://zrjbzowohsgjbrhsldfi.supabase.co";
const key =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
  "sb_publishable_lYVDODp76VQg7WHKwi8WSA_jj8kyMtw";

// Reads go straight to Supabase, NEVER through Next's fetch cache. The old
// `next: { revalidate: 1800 }` wrapper was the great feed-freeze of Sep 2026:
// on OpenNext/Workers those fetch-cache entries were served as fresh forever
// (some seeded from the persisted build cache), so every list query returned
// a 1-to-26-day-old snapshot while the curator kept publishing — the site
// looked abandoned. Caching belongs at the PAGE layer (ISR `revalidate` on the
// public routes, the per-isolate memo in FeedPage), where staleness is visible
// and bounded; the data read itself must always be live.
// This client is server-only (the browser uses supabase-browser.ts).
export const supabase = createClient(url, key, {
  auth: { persistSession: false },
  global: {
    fetch: (input, init) =>
      fetch(input, { ...init, cache: "no-store" }),
  },
});

// How long a prerendered story page stays fresh. Exported so the page's
// `export const revalidate` and this client's fetch cache can never drift apart
// — if they disagree, the page silently stops being prerendered.
export const STORY_REVALIDATE = 1800; // 30 min

// STORY-PAGE READS use a plain fetch, NOT supabase-js.
//
// `export const revalidate = 1800` on the story page was dead code, and the
// first fix - a second supabase-js client whose fetch set `next.revalidate` -
// did not revive it: measured on prod, story pages still rendered dynamically
// at 1.3-2.9s TTFB with no edge cache, for content that should be a ~20ms hit.
//
// Ruled out first, with evidence: no request-time API anywhere in the story
// render tree (the root layout only MENTIONS cookies() in a comment); Next's
// own patch-fetch only auto-disables caching for an Authorization header when
// `revalidate === 0`, and this route sets 1800; and it is not a
// prerendered-vs-on-demand difference, since a story from today behaves exactly
// like one from August.
//
// That leaves supabase-js's own fetch layer - it wraps the call and passes a
// `signal`, among other things - as the only remaining variable. So these reads
// bypass it entirely. A plain `fetch` with `next.revalidate` is something Next
// can unambiguously cache, and PostgREST is a simple enough HTTP API that the
// query builder buys us very little here.
//
// The FEED still uses the client above with `no-store`, deliberately: a stale
// LIST is the Sep 2026 feed-freeze, because a list's whole job is to show what
// arrived since you last looked. A published story does not change.
export async function sbSelect<T>(
  table: string,
  params: Record<string, string>,
  revalidate: number = STORY_REVALIDATE
): Promise<T[]> {
  const qs = new URLSearchParams(params).toString();
  try {
    const res = await fetch(`${url}/rest/v1/${table}?${qs}`, {
      headers: {
        apikey: key,
        authorization: `Bearer ${key}`,
        accept: "application/json",
      },
      next: { revalidate },
    });
    if (!res.ok) {
      console.log(`sbSelect ${table} failed: HTTP ${res.status}`);
      return [];
    }
    return (await res.json()) as T[];
  } catch (e) {
    console.log(`sbSelect ${table} threw: ${e instanceof Error ? e.message : e}`);
    return [];
  }
}
