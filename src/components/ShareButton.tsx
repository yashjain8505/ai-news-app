"use client";

import { useState } from "react";

// One-tap share for a Wortins story link. Uses the native share sheet on mobile,
// falls back to copying the link to the clipboard on desktop (with a last-ditch
// prompt if the clipboard API is blocked).
export default function ShareButton({ url, title }: { url: string; title: string }) {
  const [copied, setCopied] = useState(false);

  async function share() {
    if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
      try {
        await navigator.share({ title, url });
        return;
      } catch {
        // user dismissed the sheet, or it failed — fall through to copy
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt("Copy this link:", url);
    }
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
