"use client";

import { useState } from "react";
import { createSupabaseBrowser } from "@/lib/supabase-browser";

// "Continue with Google" — starts the Supabase OAuth flow; on return the
// /auth/callback route exchanges the code for a session.
export default function SignInButton({ next = "/welcome" }: { next?: string }) {
  const [loading, setLoading] = useState(false);

  async function signIn() {
    setLoading(true);
    const supabase = createSupabaseBrowser();
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
      },
    });
    if (error) setLoading(false);
  }

  return (
    <button
      onClick={signIn}
      disabled={loading}
      className="mono"
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 10,
        background: "var(--accent)",
        color: "var(--onAccent)",
        border: 0,
        padding: "14px 26px",
        fontSize: 14,
        letterSpacing: "0.06em",
        textTransform: "uppercase",
        cursor: loading ? "default" : "pointer",
        opacity: loading ? 0.6 : 1,
      }}
    >
      {loading ? "Redirecting…" : "Continue with Google"}
    </button>
  );
}
