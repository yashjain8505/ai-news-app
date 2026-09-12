import { createBrowserClient } from "@supabase/ssr";
import posthog from "posthog-js";

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

export async function identifyCurrentUser() {
  const supabase = createSupabaseBrowser();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  const metadata = user.user_metadata as Record<string, unknown>;
  const name = metadata.full_name ?? metadata.name;
  posthog.identify(user.id, {
    ...(user.email ? { email: user.email } : {}),
    ...(typeof name === "string" ? { name } : {}),
  });
}
