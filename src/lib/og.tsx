import { ImageResponse } from "next/og";
import { SITE } from "@/lib/seo";

// Shared Open Graph / Twitter card renderer. next/og uses Satori, which supports
// flexbox + a subset of CSS only (no grid, no `display: block`).
//
// A bold, high-contrast "colour-block" card built to be SHARED: near-black
// background, big cream headline with a rust marker-highlight on the key phrase,
// a short description, the Wortins name top-left, and wortins.com bottom-left.
export const OG_SIZE = { width: 1200, height: 630 };
export const OG_CONTENT_TYPE = "image/png";

const C = {
  bg: "#17130e", // near-black
  cream: "#f3ecda", // headline + name
  accent: "#9c2b1d", // rust: W mark + highlight
  dek: "#b3aa9b", // description
  footer: "#8a8074", // wortins.com
};

function clamp(s: string, max: number): string {
  const t = s.trim().replace(/\s+/g, " ");
  return t.length > max ? t.slice(0, max - 1).trimEnd() + "…" : t;
}

function headlineSize(title: string): number {
  const n = title.length;
  if (n <= 26) return 82;
  if (n <= 42) return 72;
  if (n <= 64) return 60;
  if (n <= 90) return 50;
  return 42;
}

export type OgFields = {
  kicker?: string; // accepted for caller compatibility; unused in this card
  title: string;
  subtitle?: string | null; // short description
  highlight?: string | null; // exact substring of the title to marker-highlight
  footerRight?: string; // accepted for caller compatibility; unused
};

// Break the title into word chips, but keep the run that matches `highlight` as a
// SINGLE chip so it renders as one continuous rust box (not one box per word).
// Word-level chips give reliable wrapping in Satori.
function titleChips(title: string, highlight?: string | null): { text: string; hl: boolean }[] {
  const hl = (highlight ?? "").trim();
  const idx = hl ? title.toLowerCase().indexOf(hl.toLowerCase()) : -1;
  if (idx < 0) return title.split(" ").map((w) => ({ text: w, hl: false }));
  const before = title.slice(0, idx).trim();
  const mid = title.slice(idx, idx + hl.length).trim();
  const after = title.slice(idx + hl.length).trim();
  const chips: { text: string; hl: boolean }[] = [];
  if (before) before.split(" ").forEach((w) => chips.push({ text: w, hl: false }));
  if (mid) chips.push({ text: mid, hl: true });
  if (after) after.split(" ").forEach((w) => chips.push({ text: w, hl: false }));
  return chips.length ? chips : title.split(" ").map((w) => ({ text: w, hl: false }));
}

export function renderOgImage({ title, subtitle, highlight }: OgFields): ImageResponse {
  const cleanTitle = clamp(title, 96);
  const fs = headlineSize(cleanTitle);
  const gap = Math.round(fs * 0.26);
  const chips = titleChips(cleanTitle, highlight);
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          backgroundColor: C.bg,
          padding: "58px 72px",
        }}
      >
        {/* Name — top-left */}
        <div style={{ display: "flex", alignItems: "center" }}>
          <div
            style={{
              width: 54,
              height: 54,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: C.accent,
              color: C.cream,
              fontSize: 36,
              fontWeight: 700,
              borderRadius: 10,
            }}
          >
            W
          </div>
          <div style={{ marginLeft: 16, fontSize: 30, fontWeight: 700, letterSpacing: 1, color: C.cream }}>
            Wortins
          </div>
        </div>

        {/* Headline — word chips wrap; the highlighted run is one rust box */}
        <div style={{ flexGrow: 1, display: "flex", flexDirection: "column", justifyContent: "center" }}>
          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-start" }}>
            {chips.map((c, i) => (
              <div
                key={i}
                style={{
                  fontSize: fs,
                  fontWeight: 800,
                  lineHeight: 1.14,
                  color: C.cream,
                  marginRight: gap,
                  ...(c.hl ? { backgroundColor: C.accent, padding: "2px 16px" } : {}),
                }}
              >
                {c.text}
              </div>
            ))}
          </div>
          {subtitle ? (
            <div style={{ marginTop: 30, fontSize: 27, lineHeight: 1.34, color: C.dek, maxWidth: 960 }}>
              {clamp(subtitle, 120)}
            </div>
          ) : null}
        </div>

        {/* Footer — wortins.com only */}
        <div style={{ display: "flex" }}>
          <div style={{ fontSize: 24, color: C.footer, fontWeight: 700, letterSpacing: 1 }}>wortins.com</div>
        </div>
      </div>
    ),
    { ...OG_SIZE }
  );
}
