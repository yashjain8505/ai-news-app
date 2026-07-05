"use client";

import { useEffect, useState } from "react";

// "Personalize" button + opt-in modal for logged-out visitors.
//
// NO auto-popup: a first-time visitor just reads the news. The modal opens ONLY
// when they click "Personalize". From there the CTA goes to /welcome, which
// signs them in with Google and then runs onboarding. The full public edition is
// always readable underneath — this is a pure opt-in overlay.
export default function OnboardingHero() {
  const [open, setOpen] = useState(false);

  // Close on Escape while open.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
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
        style={{ fontSize: 11, letterSpacing: "0.04em", textTransform: "uppercase", padding: "5px 13px", border: "1px solid var(--accent)", background: "var(--accent)", color: "var(--onAccent)", cursor: "pointer" }}
      >
        Personalize
      </button>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="wortins-hero-title"
          aria-describedby="wortins-hero-desc"
          onClick={() => setOpen(false)}
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
              maxWidth: 460,
              background: "var(--bg)",
              border: "1px solid var(--ruleStrong)",
              boxShadow: "0 24px 60px rgba(27,23,18,0.35)",
              padding: "40px 34px 34px",
              boxSizing: "border-box",
            }}
          >
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close"
              className="mono"
              style={{
                position: "absolute",
                top: 8,
                right: 8,
                width: 36,
                height: 36,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                background: "transparent",
                border: 0,
                color: "var(--dim)",
                fontSize: 24,
                lineHeight: 1,
                cursor: "pointer",
              }}
            >
              &times;
            </button>

            <div
              className="mono"
              style={{ fontSize: 10, letterSpacing: "0.22em", textTransform: "uppercase", color: "var(--accent)" }}
            >
              Wortins
            </div>

            <h2
              id="wortins-hero-title"
              className="display"
              style={{ fontSize: "clamp(26px,5vw,34px)", lineHeight: 1.08, color: "var(--ink)", margin: "12px 0 0" }}
            >
              AI news, tuned to what you actually care about.
            </h2>

            <p
              id="wortins-hero-desc"
              className="serif"
              style={{ fontSize: 16, lineHeight: 1.55, color: "var(--muted)", margin: "12px 0 24px" }}
            >
              Sign in, tell us how technical you want it and which topics you like &mdash; and we&#8217;ll build a daily edition around what you care about, nothing you don&#8217;t.
            </p>

            <a
              href="/welcome"
              className="mono"
              style={{
                display: "block",
                textAlign: "center",
                fontSize: 12,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                padding: "14px 20px",
                background: "var(--accent)",
                color: "var(--onAccent)",
                textDecoration: "none",
              }}
            >
              Sign in &amp; personalize &rarr;
            </a>

            <button
              type="button"
              onClick={() => setOpen(false)}
              className="mono"
              style={{
                display: "block",
                width: "100%",
                marginTop: 14,
                background: "transparent",
                border: 0,
                color: "var(--dim)",
                fontSize: 11,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                cursor: "pointer",
                padding: "4px 0",
              }}
            >
              Just read today&#8217;s edition
            </button>
          </div>
        </div>
      )}
    </>
  );
}
