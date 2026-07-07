import { createClient } from "@supabase/supabase-js";

// Publishable (anon) key, safe to expose in the client; all access is gated by RLS.
const url =
  process.env.NEXT_PUBLIC_SUPABASE_URL ??
  "https://zrjbzowohsgjbrhsldfi.supabase.co";
const key =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
  "sb_publishable_lYVDODp76VQg7WHKwi8WSA_jj8kyMtw";

// Cache the public (anon) reads for 30 min so the pages that use them can be
// ISR-rendered and served from the CDN (faster crawling + Core Web Vitals)
// instead of hitting Supabase — and rendering dynamically — on every request.
// This client is server-only (the browser uses supabase-browser.ts); writes are
// POST/PATCH, which Next never caches.
export const supabase = createClient(url, key, {
  auth: { persistSession: false },
  global: {
    fetch: (input, init) =>
      fetch(input, { ...init, next: { revalidate: 1800 } }),
  },
});
