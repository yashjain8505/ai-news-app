"use client";

import { useEffect, useState } from "react";

// "Personalize" button + modal for visitors who haven't personalized yet.
//
// The modal AUTO-OPENS once on first landing (gated by localStorage so it never
// nags on every reload), and can be reopened any time from the "Personalize"
// button. The full news edition is always readable underneath — this is an
// overlay, not a redirect. Its CTA goes to /welcome, which signs the visitor in
// (if needed) and then runs onboarding.
const STORAGE_KEY = "wortins_personalize_seen";

export default function OnboardingHero({ signedIn = false }: { signedIn?: boolean }) {
  const [open, setOpen] = useState(false);

  // Auto-open once per browser on first visit. Runs only on the client so the
  // server HTML stays identical for crawlers.
  useEffect(() => {
    let seen = false;
    try {
      seen = localStorage.getItem(STORAGE_KEY) === "1";
    } catch {
      seen = true; // storage blocked (private mode) — just skip the auto-open.
    }
    if (!seen) setOpen(true);
  }, []);

  function dismiss() {
    setOpen(false);
    try {
      localStorage.setItem(STORAGE_KEY, "1");
    } catch {
      // ignore — a returning visitor may see it again, which is acceptable.
    }
  }

  // Close on Escape while open.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") dismiss();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  // Lock background scroll while the modal is open.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mono"
        style={{ fontSize: 13, fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase", padding: "9px 20px", border: "1px solid var(--accent)", background: "var(--accent)", color: "var(--onAccent)", cursor: "pointer" }}
      >
        Personalize
      </button>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="wortins-hero-title"
          onClick={dismiss}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 1000,
            background: "rgba(27,23,18,0.62)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 20,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              position: "relative",
              width: "100%",
              maxWidth: 420,
              background: "var(--bg)",
              border: "1px solid var(--ruleStrong)",
              boxShadow: "0 24px 60px rgba(27,23,18,0.35)",
              padding: "34px 30px 28px",
              boxSizing: "border-box",
            }}
          >
            <button
              type="button"
              onClick={dismiss}
              aria-label="Close"
              className="mono"
              style={{ position: "absolute", top: 8, right: 8, width: 34, height: 34, display: "flex", alignItems: "center", justifyContent: "center", background: "transparent", border: 0, color: "var(--dim)", fontSize: 22, lineHeight: 1, cursor: "pointer" }}
            >
              &times;
            </button>

            <div className="mono" style={{ fontSize: 10, letterSpacing: "0.22em", textTransform: "uppercase", color: "var(--accent)" }}>
              Wortins
            </div>

            <h2 id="wortins-hero-title" className="display" style={{ fontSize: "clamp(24px,4.5vw,30px)", lineHeight: 1.1, color: "var(--ink)", margin: "10px 0 8px" }}>
              AI news, tuned to you.
            </h2>

            <p className="serif" style={{ fontSize: 15, lineHeight: 1.5, color: "var(--muted)", margin: "0 0 20px" }}>
              {signedIn
                ? "Pick the topics you want, skip the ones you don’t."
                : "Sign in and pick your topics — we’ll build your daily edition."}
            </p>

            <a
              href="/welcome"
              className="mono"
              style={{ display: "block", textAlign: "center", fontSize: 13, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", padding: "14px 20px", background: "var(--accent)", color: "var(--onAccent)", textDecoration: "none" }}
            >
              {signedIn ? "Personalize" : "Sign in & personalize"} &rarr;
            </a>

            <button
              type="button"
              onClick={dismiss}
              className="mono"
              style={{ display: "block", width: "100%", marginTop: 12, background: "transparent", border: 0, color: "var(--dim)", fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase", cursor: "pointer", padding: "4px 0" }}
            >
              Just read today&#8217;s edition
            </button>
          </div>
        </div>
      )}
    </>
  );
}
