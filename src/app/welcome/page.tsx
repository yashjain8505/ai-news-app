import { redirect } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { getSessionUser } from "@/lib/supabase-server";
import Onboarding from "@/components/Onboarding";
import SignInButton from "@/components/SignInButton";

export const dynamic = "force-dynamic";

// A thin auth/onboarding utility page — keep it out of the index (it's also
// disallowed in robots.txt). noindex makes a self-canonical moot.
export const metadata = {
  title: "Sign in",
  robots: { index: false, follow: false },
};

function displayName(user: {
  email?: string | null;
  user_metadata?: Record<string, unknown>;
}): string {
  const m = user.user_metadata ?? {};
  return (
    (m.full_name as string) ||
    (m.name as string) ||
    user.email?.split("@")[0] ||
    "Reader"
  );
}

export default async function Welcome() {
  const user = await getSessionUser();

  // Not signed in → Google sign-in gate.
  if (!user) {
    return (
      <main style={{ maxWidth: 560, margin: "0 auto", padding: "72px 24px 80px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 40 }}>
          <span aria-hidden className="display" style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 26, height: 26, background: "var(--accent)", color: "var(--onAccent)", fontSize: 18, lineHeight: 1 }}>
            W
          </span>
          <span className="display" style={{ fontSize: 24, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--ink)" }}>
            Wortins
          </span>
        </div>
        <h1 className="display" style={{ fontSize: 34, lineHeight: 1.12, color: "var(--ink)", margin: 0 }}>
          Build your briefing.
        </h1>
        <p className="serif" style={{ fontSize: 17, fontStyle: "italic", color: "var(--muted)", margin: "12px 0 28px" }}>
          Sign in, answer a few questions, and we&#8217;ll tune the AI news to your taste. Takes two minutes.
        </p>
        <SignInButton next="/welcome" />
        <p className="mono" style={{ fontSize: 11, letterSpacing: "0.04em", color: "var(--faint)", marginTop: 20 }}>
          We use your Google account only to sign you in. No password to remember.
        </p>
      </main>
    );
  }

  // Signed in + already calibrated → straight to the feed.
  const [{ data: taste }, { data: pool }] = await Promise.all([
    supabase.from("user_taste").select("user_id").eq("user_id", user.id).maybeSingle(),
    // Article pool for the "which would you read?" step — recent daily stories
    // with their topic tags, filtered client-side to the topics the reader picks.
    supabase
      .from("items")
      .select("id, title, source, summary, tags")
      .eq("is_active", true)
      .eq("section", "daily")
      .order("published_at", { ascending: false })
      .limit(40),
  ]);
  if (taste) redirect("/");

  // Signed in, first time → taste calibration: level → topics → rate articles.
  return <Onboarding name={displayName(user)} articles={pool ?? []} />;
}
