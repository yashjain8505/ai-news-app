import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

const URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ??
  "https://zrjbzowohsgjbrhsldfi.supabase.co";
const KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
  "sb_publishable_lYVDODp76VQg7WHKwi8WSA_jj8kyMtw";

// Cookie-aware Supabase client for Server Components, Server Actions, and Route
// Handlers. Used ONLY to read the current authenticated session/user; all data
// reads/writes stay on the plain anon client in lib/supabase.ts.
export async function createSupabaseServer() {
  const cookieStore = await cookies();
  return createServerClient(URL, KEY, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Called from a Server Component (cookies are read-only there); the
          // middleware refreshes the session cookie instead.
        }
      },
    },
  });
}

// Convenience: the current authenticated user, or null. Never throws.
export async function getSessionUser() {
  try {
    const supabase = await createSupabaseServer();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    return user ?? null;
  } catch {
    return null;
  }
}
