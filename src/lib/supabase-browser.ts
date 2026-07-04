import { createBrowserClient } from "@supabase/ssr";

const URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ??
  "https://zrjbzowohsgjbrhsldfi.supabase.co";
const KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
  "sb_publishable_lYVDODp76VQg7WHKwi8WSA_jj8kyMtw";

// Browser Supabase client for Client Components — used to start the Google
// OAuth flow (signInWithOAuth) and to sign out.
export function createSupabaseBrowser() {
  return createBrowserClient(URL, KEY);
}
