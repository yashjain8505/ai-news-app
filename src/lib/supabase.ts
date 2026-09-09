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

// SECOND CLIENT, for story pages only.
//
// `cache: "no-store"` above does more than skip the cache: per Next's own docs
// it makes the route DYNAMICALLY RENDERED. So `export const revalidate = 1800`
// on the story page was silently dead — every story was a full Worker
// invocation plus a Supabase round-trip, measured at 0.52-1.38s TTFB for a page
// that should be a ~20ms edge hit.
//
// Why it's safe here and NOT for the feed: a published story does not change.
// The feed is a LIST whose whole job is to show what arrived since you last
// looked, so a stale list is the bug (that was the Sep 2026 feed-freeze). A
// stale story page would at worst show slightly older "related coverage", and
// revalidation now actually runs since open-next.config.ts got its queue
// override, which the freeze predates.
//
// Do NOT use this for anything the feed renders.
export const supabaseStatic = createClient(url, key, {
  auth: { persistSession: false },
  global: {
    fetch: (input, init) =>
      fetch(input, { ...init, next: { revalidate: STORY_REVALIDATE } }),
  },
});
