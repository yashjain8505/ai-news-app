"use client";

// "← Back" for story pages — typical-website behavior the feed was missing.
// Uses real history when the reader came from within Wortins, otherwise falls
// back to the home briefing (direct visits from search/social have no
// meaningful history entry).
export default function BackLink() {
  function goBack(e: React.MouseEvent) {
    try {
      const cameFromUs =
        document.referrer && new URL(document.referrer).origin === window.location.origin;
      if (cameFromUs && window.history.length > 1) {
        e.preventDefault();
        window.history.back();
      }
    } catch {
      // fall through to the href
    }
  }
  return (
    <a
      href="/"
      onClick={goBack}
      className="mono bs-ilink"
      style={{
        display: "inline-block",
        fontSize: 12,
        letterSpacing: "0.08em",
        textTransform: "uppercase",
        color: "var(--dim)",
        textDecoration: "none",
        margin: "0 0 18px",
      }}
    >
      &larr; Back to the briefing
    </a>
  );
}
