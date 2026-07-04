import "server-only";

// Service-role Supabase client for server-only writes that must bypass RLS —
// e.g. creating a user's profile row in `users`, a deliberately private table
// that has no SELECT policy (only the admin reads it, via the service key), so
// the public anon key cannot write it. The `server-only` import makes importing
// this from a Client Component a build error, so the key never reaches the
// browser. Same project URL as the public client; only the key differs.

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ??
  "https://zrjbzowohsgjbrhsldfi.supabase.co";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Lazy singleton — never constructed at module load, so a missing key can't
// throw during the build. Returns null when the key isn't configured, letting
// callers degrade gracefully instead of crashing.
let _svc: SupabaseClient | null = null;
export function supabaseService(): SupabaseClient | null {
  if (!SERVICE_KEY) return null;
  if (!_svc) {
    _svc = createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return _svc;
}
