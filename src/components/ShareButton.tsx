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

  async function share() {
    const abs =
      url.startsWith("http") || typeof window === "undefined"
        ? url
        : `${window.location.origin}${url}`;
    if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
      try {
        await navigator.share({ title, url: abs });
        return;
      } catch {
        // user dismissed the sheet, or it failed — fall through to copy
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
          color: "var(--dim)",
          cursor: "pointer",
          padding: 0,
        }}
      >
        {copied ? "Copied ✓" : "Share ↗"}
      </button>
    );
  }

  return (
    <button
      onClick={share}
      className="mono"
      style={{
        fontSize: 13,
        letterSpacing: "0.04em",
        textTransform: "uppercase",
        padding: "12px 18px",
        border: "1px solid var(--sep)",
        background: "transparent",
        color: "var(--ink)",
        cursor: "pointer",
      }}
    >
      {copied ? "Link copied ✓" : "Share ↗"}
    </button>
  );
}
