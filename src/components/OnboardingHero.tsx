"use client";

import { useEffect, useState } from "react";

// First-visit personalization modal for logged-out visitors.
//
// SEO-CRITICAL: this renders IDENTICAL HTML for everyone (nothing on the
// server / first client paint). Visibility is decided purely on the client
// via useState + a mounted guard — never a server redirect or bot detection.
// The full public edition always ships in the server-rendered HTML underneath;
// this component only layers an overlay on top after hydration.
const STORAGE_KEY = "wortins_hero_seen";

export default function OnboardingHero() {
  // Nothing renders until we've mounted on the client. This avoids any
  // server/client hydration mismatch (the modal is absent from server HTML)
  // and keeps the server response identical for crawlers and humans.
  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setMounted(true);
    let seen = false;
    try {
      seen = localStorage.getItem(STORAGE_KEY) === "1";
    } catch {
      // localStorage unavailable (private mode, blocked) — just skip the modal.
      seen = true;
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

  // Close on Escape while open. Registered only after mount.
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

  if (!mounted || !open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="wortins-hero-title"
      aria-describedby="wortins-hero-desc"
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
          onClick={dismiss}
          aria-label="Close"
          className="mono"
          style={{
            position: "absolute",
            top: 12,
            right: 14,
            background: "transparent",
            border: 0,
            color: "var(--dim)",
            fontSize: 20,
            lineHeight: 1,
            cursor: "pointer",
            padding: 4,
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
          Answer six quick questions and we&#8217;ll build an edition around your taste &mdash; the labs, tools and stories you follow, nothing you don&#8217;t.
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
          Personalize &mdash; 6 quick questions &rarr;
        </a>

        <button
          type="button"
          onClick={dismiss}
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
  );
}
