import { createClient } from "@supabase/supabase-js";

// Publishable (anon) key — safe to expose in the client; all access is gated by RLS.
const url =
  process.env.NEXT_PUBLIC_SUPABASE_URL ??
  "https://zrjbzowohsgjbrhsldfi.supabase.co";
const key =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
  "sb_publishable_lYVDODp76VQg7WHKwi8WSA_jj8kyMtw";

export const supabase = createClient(url, key, {
  auth: { persistSession: false },
});
