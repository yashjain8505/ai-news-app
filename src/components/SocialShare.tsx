"use client";

import { useEffect, useRef, useState } from "react";
import posthog from "posthog-js";
import ShareButton from "@/components/ShareButton";

// Share a story as an IMAGE, never a link. The ticket card (/story/<slug>/
// card.png) is what gets posted; the caption carries no URL (links hamper
// reach on LinkedIn/X, so people don't post them). The card itself carries
// wortins.com.
//
// Two paths:
//   1. Native share sheet (phones, Safari, Chrome where files are shareable):
//      the PNG is handed to navigator.share, the reader taps LinkedIn/X and
//      the image lands in the composer directly — the Cloudflare-Wallet flow.
//   2. Desktop fallback: save the card to downloads + copy the caption + open
//      the platform's composer with no link, so it's attach-and-post.
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
  const path = url.startsWith("http") ? new URL(url).pathname : url;
  const slug = path.split("/").filter(Boolean).pop() ?? "story";
  const cardHref = `${path}/card.png`;
  const caption = `${title} · via Wortins, the daily AI briefing`;

  const fileRef = useRef<File | null>(null);
  const [busy, setBusy] = useState<"linkedin" | "twitter" | "card" | null>(null);
  const [hint, setHint] = useState<{ text: string; composer?: { href: string; label: string } } | null>(null);

  // Prefetch the card once the page is idle so a click can hand the file to
  // navigator.share synchronously (Safari only honors share inside the tap).
  useEffect(() => {
    let cancelled = false;
    const t = setTimeout(() => {
      loadCard().catch(() => {});
    }, 1500);
    async function loadCard() {
      if (fileRef.current) return fileRef.current;
      const r = await fetch(cardHref);
      if (!r.ok) throw new Error(String(r.status));
      const b = await r.blob();
      if (cancelled) return null;
      fileRef.current = new File([b], `wortins-${slug.slice(0, 40)}.png`, { type: "image/png" });
      return fileRef.current;
    }
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [cardHref, slug]);

  async function getCard(): Promise<File | null> {
    if (fileRef.current) return fileRef.current;
    try {
      const r = await fetch(cardHref);
      if (!r.ok) return null;
      const b = await r.blob();
      fileRef.current = new File([b], `wortins-${slug.slice(0, 40)}.png`, { type: "image/png" });
      return fileRef.current;
    } catch {
      return null;
    }
  }

  function track(method: string) {
    posthog.capture("story_social_shared", {
      sharing_method: method,
      story_id: itemId,
    });
    const g = (globalThis as unknown as { gtag?: (...a: unknown[]) => void }).gtag;
    g?.("event", "share", { method, item_id: itemId, transport_type: "beacon" });
  }

  function saveFile(file: File) {
    const u = URL.createObjectURL(file);
    const a = document.createElement("a");
    a.href = u;
    a.download = file.name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(u), 4000);
  }

  async function copyCaption() {
    try {
      await navigator.clipboard.writeText(caption);
      return true;
    } catch {
      return false;
    }
  }

  const COMPOSER = {
    // LinkedIn: opens "Start a post" with NO url attached (shareActive), so
    // the image the reader just saved is the whole post.
    linkedin: { href: `https://www.linkedin.com/feed/?shareActive=true&text=${encodeURIComponent(caption)}`, label: "Open LinkedIn" },
    // X: text-only compose, no url param.
    twitter: { href: `https://x.com/intent/post?text=${encodeURIComponent(caption)}`, label: "Open X" },
  } as const;

  async function shareTo(platform: "linkedin" | "twitter") {
    if (busy) return;
    setBusy(platform);
    setHint(null);
    // Open the composer tab synchronously (inside the click) so popup blockers
    // allow it; we point it at the composer only on the desktop path.
    const pre = fileRef.current ? null : window.open("", "_blank");
    try {
      const file = await getCard();
      const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
      if (file && nav.canShare?.({ files: [file] })) {
        pre?.close();
        try {
          await nav.share({ files: [file], text: caption });
          track(`${platform}_native_image`);
          return;
        } catch (e) {
          if ((e as { name?: string }).name === "AbortError") return; // reader closed the sheet
          // fall through to desktop path
        }
      }
      if (file) saveFile(file);
      const copied = await copyCaption();
      const composer = COMPOSER[platform];
      if (pre) pre.location.href = composer.href;
      else window.open(composer.href, "_blank", "noopener");
      track(`${platform}_image_download`);
      setHint({
        text: file
          ? `Card saved to your downloads${copied ? ", caption copied" : ""}. Attach the image to the post, no link needed.`
          : "Couldn't build the card, opening the composer instead.",
        composer,
      });
    } finally {
      setBusy(null);
    }
  }

  async function saveCard() {
    if (busy) return;
    setBusy("card");
    setHint(null);
    try {
      const file = await getCard();
      if (file) {
        saveFile(file);
        track("card_download");
        setHint({ text: "Card saved to your downloads." });
      } else {
        setHint({ text: "Couldn't build the card right now, try again in a moment." });
      }
    } finally {
      setBusy(null);
    }
  }

  const btn: React.CSSProperties = {
    display: "inline-block",
    fontSize: 13,
    letterSpacing: "0.04em",
    textTransform: "uppercase",
    padding: "12px 18px",
    border: "1px solid var(--sep)",
    background: "transparent",
    color: "var(--ink)",
    cursor: "pointer",
    fontFamily: "inherit",
  };

  return (
    <>
      <button type="button" onClick={() => shareTo("linkedin")} className="mono bs-tap" style={{ ...btn, opacity: busy === "linkedin" ? 0.6 : 1 }}>
        {busy === "linkedin" ? "Preparing card…" : <>Share card on LinkedIn &#8599;</>}
      </button>
      <button type="button" onClick={() => shareTo("twitter")} className="mono bs-tap" style={{ ...btn, opacity: busy === "twitter" ? 0.6 : 1 }}>
        {busy === "twitter" ? "Preparing card…" : <>Post card on X &#8599;</>}
      </button>
      <button
        type="button"
        onClick={saveCard}
        className="mono bs-tap"
        style={{ ...btn, borderColor: "var(--accent)", color: "var(--accent)", opacity: busy === "card" ? 0.6 : 1 }}
      >
        Save card &#8595;
      </button>
      {showGeneric && <ShareButton url={url} title={title} />}
      {hint && (
        <p className="mono" style={{ flexBasis: "100%", margin: "6px 0 0", fontSize: 11, letterSpacing: "0.04em", color: "var(--dim)" }}>
          {hint.text}
          {hint.composer && (
            <>
              {" "}
              <a href={hint.composer.href} target="_blank" rel="noopener noreferrer" style={{ color: "var(--accent)" }}>
                {hint.composer.label} &#8599;
              </a>
            </>
          )}
        </p>
      )}
    </>
  );
}
