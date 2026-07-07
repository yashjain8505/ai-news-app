"use client";

import { useEffect, useState } from "react";
import ShareButton from "@/components/ShareButton";

// Dedicated LinkedIn + X share buttons for a Wortins story. Clicking opens the
// platform's composer pre-loaded with the story URL, which renders Wortins's
// branded OG "news card" — the reader adds their own take on top.
//
// `url` may be relative ("/story/slug") or absolute; it's resolved to an
// absolute URL (the intent links need it) once mounted on the client, mirroring
// ShareButton's guard. `showGeneric` also renders the native-share / copy button
// (best on mobile, covers WhatsApp/email/Slack).
export default function SocialShare({
  url,
  title,
  itemId,
  showGeneric = false,
}: {
  url: string;
  title: string;
  itemId?: string;
  showGeneric?: boolean;
}) {
  const [abs, setAbs] = useState(url);
  useEffect(() => {
    setAbs(url.startsWith("http") ? url : `${window.location.origin}${url}`);
  }, [url]);

  // Quick tactile press-pop so the intent links visibly respond on click, even
  // though the real action (opening a new tab) happens elsewhere.
  const [pressed, setPressed] = useState<"twitter" | "linkedin" | null>(null);
  function pop(which: "twitter" | "linkedin") {
    setPressed(which);
    setTimeout(() => setPressed(null), 120);
  }

  const enc = encodeURIComponent;
  // X: blank text + just the link. The card carries the headline; the reader
  // writes their own take. The preview renders from the story page's OG tags.
  const xHref = `https://twitter.com/intent/tweet?url=${enc(abs)}`;
  // LinkedIn: URL ONLY. LinkedIn deprecated pre-filled commentary — title/summary
  // params are ignored; it scrapes the OG card and the user types their take.
  // Do NOT add a text/summary param here.
  const liHref = `https://www.linkedin.com/sharing/share-offsite/?url=${enc(abs)}`;

  function track(method: "twitter" | "linkedin") {
    const g = (globalThis as unknown as { gtag?: (...a: unknown[]) => void }).gtag;
    g?.("event", "share", { method, item_id: itemId, transport_type: "beacon" });
  }

  const linkStyle: React.CSSProperties = {
    display: "inline-block",
    fontSize: 13,
    letterSpacing: "0.04em",
    textTransform: "uppercase",
    padding: "12px 18px",
    border: "1px solid var(--sep)",
    color: "var(--ink)",
    textDecoration: "none",
    transition: "transform 120ms ease-out",
  };

  return (
    <>
      <a
        href={xHref}
        target="_blank"
        rel="noopener noreferrer"
        onClick={() => {
          pop("twitter");
          track("twitter");
        }}
        className="mono bs-tap"
        style={{ ...linkStyle, transform: pressed === "twitter" ? "scale(0.94)" : "scale(1)" }}
      >
        Post on X &#8599;
      </a>
      <a
        href={liHref}
        target="_blank"
        rel="noopener noreferrer"
        onClick={() => {
          pop("linkedin");
          track("linkedin");
        }}
        className="mono bs-tap"
        style={{ ...linkStyle, transform: pressed === "linkedin" ? "scale(0.94)" : "scale(1)" }}
      >
        Share on LinkedIn &#8599;
      </a>
      {showGeneric && <ShareButton url={url} title={title} />}
    </>
  );
}
