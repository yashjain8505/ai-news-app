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
