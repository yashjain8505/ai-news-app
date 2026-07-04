import { redirect } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { getSessionUser } from "@/lib/supabase-server";
import { QuizArticle } from "@/lib/types";
import Onboarding from "@/components/Onboarding";
import SignInButton from "@/components/SignInButton";

export const dynamic = "force-dynamic";

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
  const { data: taste } = await supabase
    .from("user_taste")
    .select("user_id")
    .eq("user_id", user.id)
    .maybeSingle();
  if (taste) redirect("/");

  // Signed in, first time → taste calibration.
  const { data } = await supabase
    .from("quiz_articles")
    .select("id,title,url,image_url,summary,tags")
    .eq("is_active", true);

  return (
    <Onboarding
      articles={(data ?? []) as QuizArticle[]}
      name={displayName(user)}
    />
  );
}
