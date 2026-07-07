"use client";

import { useState } from "react";

// One-tap share for a Wortins story link. Native share sheet on mobile, clipboard
// copy on desktop (with a last-ditch prompt if the clipboard API is blocked).
// `url` may be relative (e.g. "/story/foo") — it's resolved against the current
// origin at click time. `compact` renders a small inline text button for feeds.
export default function ShareButton({
  url,
  title,
  compact = false,
}: {
  url: string;
  title: string;
  compact?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  // Quick tactile press-pop on every click, independent of what the click does.
  const [pressed, setPressed] = useState(false);

  function pop() {
    setPressed(true);
    setTimeout(() => setPressed(false), 120);
  }

  async function share() {
    pop();
    const abs =
      url.startsWith("http") || typeof window === "undefined"
        ? url
        : `${window.location.origin}${url}`;
    if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
      try {
        await navigator.share({ title, url: abs });
        return;
      } catch {
        // user dismissed the sheet, or it failed, fall through to copy
      }
    }
    try {
      await navigator.clipboard.writeText(abs);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt("Copy this link:", abs);
    }
  }

  if (compact) {
    return (
      <button
        onClick={share}
        aria-label="Share this story"
        className="mono"
        style={{
          fontSize: 11,
          letterSpacing: "0.06em",
          textTransform: "uppercase",
          border: 0,
          background: "transparent",
          color: copied ? "var(--accent)" : "var(--dim)",
          cursor: "pointer",
          padding: 0,
          transform: pressed ? "scale(0.94)" : "scale(1)",
          transition: "transform 120ms ease-out, color 400ms ease-out",
        }}
      >
        <span aria-live="polite">{copied ? "Copied ✓" : "Share ↗"}</span>
      </button>
    );
  }

  return (
    <button
      onClick={share}
      className="mono bs-tap"
      style={{
        fontSize: 13,
        letterSpacing: "0.04em",
        textTransform: "uppercase",
        padding: "12px 18px",
        border: "1px solid var(--sep)",
        background: copied ? "var(--accent)" : "transparent",
        color: copied ? "var(--onAccent)" : "var(--ink)",
        cursor: "pointer",
        transform: pressed ? "scale(0.94)" : "scale(1)",
        transition:
          "transform 120ms ease-out, background 1200ms ease-out, color 1200ms ease-out",
      }}
    >
      <span aria-live="polite">{copied ? "Link copied ✓" : "Share ↗"}</span>
    </button>
  );
}
