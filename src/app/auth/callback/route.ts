import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase-server";

// OAuth callback: Google -> Supabase -> here with a `code`. Exchange it for a
// session (sets the auth cookies), then send the user on to onboarding/feed.
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/welcome";

  if (code) {
    const supabase = await createSupabaseServer();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
  }
  return NextResponse.redirect(`${origin}/welcome?authError=1`);
}
