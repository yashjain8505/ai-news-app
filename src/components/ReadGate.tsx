"use client";

import { useEffect, useState } from "react";
import posthog from "posthog-js";
import { subscribeNewsletter } from "@/app/actions";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const KEY = "wortins_readgate";
const SNOOZE_MS = 3 * 24 * 3600 * 1000; // "Not now" quiets the gate for 3 days

// Soft subscribe gate over the story body (Latestly-style, but honest):
//   - "Not now" ALWAYS unlocks the full text — nothing is ever truly locked.
//   - Subscribing unlocks it permanently on this browser.
//   - Default state is OPEN and the gate only mounts after hydration, so
//     crawlers and no-JS readers always get the full article (no cloaking,
//     no SEO risk); dismissals are remembered so it never nags.
export default function ReadGate({ children }: { children: React.ReactNode }) {
  const [gated, setGated] = useState(false);
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw === "subscribed") return;
      if (raw && Date.now() < Number(raw)) return;
      setGated(true);
    } catch {
      // storage unavailable -> never gate
    }
  }, []);

  function notNow() {
    posthog.capture("read_gate_dismissed");
    try {
      localStorage.setItem(KEY, String(Date.now() + SNOOZE_MS));
    } catch {}
    setGated(false);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (state === "loading") return;
    const value = email.trim();
    if (!EMAIL_RE.test(value)) {
      setState("error");
      setMsg("Enter a valid email address.");
      return;
    }
    setState("loading");
    setMsg(null);
    const res = await subscribeNewsletter(value);
    if (res.ok) {
      posthog.capture("newsletter_subscribed", { placement: "read_gate" });
      setState("done");
      try {
        localStorage.setItem(KEY, "subscribed");
      } catch {}
      // Brief beat so the reader sees the confirmation, then reveal the story.
      setTimeout(() => setGated(false), 900);
    } else {
      setState("error");
      setMsg(res.error === "invalid" ? "Enter a valid email address." : "Something went wrong, please try again.");
    }
  }

  return (
    <div style={{ position: "relative" }}>
      <div
        aria-hidden={gated || undefined}
        style={
          gated
            ? {
                filter: "blur(5px)",
                userSelect: "none",
                pointerEvents: "none",
                maskImage: "linear-gradient(180deg, rgba(0,0,0,0.55) 0%, transparent 82%)",
                WebkitMaskImage: "linear-gradient(180deg, rgba(0,0,0,0.55) 0%, transparent 82%)",
              }
            : undefined
        }
      >
        {children}
      </div>

      {gated && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "flex-end",
            justifyContent: "center",
            paddingBottom: 4,
          }}
        >
          <div
            style={{
              width: "100%",
              maxWidth: 460,
              border: "1px solid var(--ruleStrong)",
              background: "var(--bg)",
              padding: "22px 24px",
              textAlign: "center",
              boxShadow: "0 18px 40px rgba(20,15,8,0.18)",
            }}
          >
            <div className="mono" style={{ fontSize: 10, letterSpacing: "0.22em", textTransform: "uppercase", color: "var(--accent)" }}>
              Free · one email each morning
            </div>
            <h2 className="display" style={{ fontSize: 24, lineHeight: 1.15, color: "var(--ink)", margin: "8px 0 0" }}>
              Subscribe to keep reading
            </h2>
            <p className="serif" style={{ fontSize: 14.5, lineHeight: 1.5, color: "var(--dim)", margin: "8px 0 0" }}>
              The daily AI briefing, tuned for humans. Unsubscribe anytime.
            </p>
            {state === "done" ? (
              <p className="serif" style={{ margin: "14px 0 0", fontSize: 15, color: "var(--ink)" }}>
                You&rsquo;re in. Enjoy the story.
              </p>
            ) : (
              <form onSubmit={onSubmit} noValidate style={{ marginTop: 14 }}>
                <div style={{ display: "flex", gap: 8 }}>
                  <input
                    className="nl-input"
                    type="email"
                    inputMode="email"
                    autoComplete="email"
                    placeholder="you@example.com"
                    aria-label="Email address"
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      if (state === "error") {
                        setState("idle");
                        setMsg(null);
                      }
                    }}
                    disabled={state === "loading"}
                    style={{ flex: 1, minWidth: 0, boxSizing: "border-box", background: "var(--bg)", border: "1px solid var(--ruleStrong)", color: "var(--ink)", padding: "10px 12px", fontFamily: "inherit", fontSize: 14 }}
                  />
                  <button
                    type="submit"
                    disabled={state === "loading"}
                    className="mono bs-tap"
                    style={{ flexShrink: 0, background: "var(--accent)", color: "var(--onAccent)", border: 0, padding: "10px 16px", fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase", cursor: state === "loading" ? "default" : "pointer", opacity: state === "loading" ? 0.6 : 1 }}
                  >
                    {state === "loading" ? "Joining…" : "Subscribe"}
                  </button>
                </div>
                {state === "error" && msg && (
                  <p className="mono" style={{ margin: "8px 0 0", fontSize: 10, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--accent)" }}>
                    {msg}
                  </p>
                )}
              </form>
            )}
            <button
              type="button"
              onClick={notNow}
              className="mono"
              style={{ marginTop: 12, background: "none", border: 0, padding: 6, fontSize: 11, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--dim)", textDecoration: "underline", cursor: "pointer" }}
            >
              Not now
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
