import { ImageResponse } from "next/og";
import { INSTRUMENT_SERIF_REGULAR, INSTRUMENT_SERIF_ITALIC, fontData } from "@/lib/fonts";
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

// ---------------------------------------------------------------------------
// Shareable "ticket" card — a downloadable IMAGE the reader posts natively on
// LinkedIn/X instead of a link redirect (image posts far out-reach link posts;
// the owner wants collectible-artifact energy, YC-ticket style). Portrait 4:5
// (1080x1350), LinkedIn's optimal image ratio. Fixed brand hexes (bitmap).
// ---------------------------------------------------------------------------
export const TICKET_SIZE = { width: 1080, height: 1350 };

const T = {
  frame: "#17130e", // near-black mat around the ticket
  paper: "#f3ecda", // cream ticket stock
  ink: "#1b1712",
  dim: "#6a6052",
  rust: "#9c2b1d",
  rustHi: "#b8392a",
  onRust: "#f3ecda",
};

export type TicketFields = {
  title: string;
  quote?: string | null; // one pull-line (summary), rendered as the quote block
  highlight?: string | null;
  source?: string | null;
  dateLabel: string; // e.g. "08 SEP 2026"
  serial: string; // e.g. "No 0421"
};

export function renderShareTicket({ title, quote, highlight, source, dateLabel, serial }: TicketFields): ImageResponse {
  const cleanTitle = clamp(title, 108);
  const fs = cleanTitle.length > 74 ? 60 : cleanTitle.length > 46 ? 70 : 82;
  const chips = titleChips(cleanTitle, highlight);
  const gap = Math.round(fs * 0.24);
  const q = quote ? clamp(quote, 150) : null;
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", backgroundColor: "#17130e", padding: 40 }}>
        <div
          style={{
            display: "flex",
            flex: 1,
            borderRadius: 30,
            overflow: "hidden",
            // Saturated warm gradient with a light bloom, the "collectible
            // ticket" look: bold enough to stop a scroll, still brand rust.
            backgroundColor: T.rust,
            backgroundImage:
              "radial-gradient(circle at 26% 22%, rgba(255,225,190,0.62) 0%, rgba(255,205,150,0.16) 34%, rgba(255,190,130,0) 60%), linear-gradient(135deg, #d4623a 0%, #b8392a 42%, #8d2317 100%)",
          }}
        >
          {/* main body */}
          <div style={{ display: "flex", flexDirection: "column", flex: 1, padding: "54px 46px 44px 58px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 15 }}>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    width: 52,
                    height: 52,
                    backgroundColor: "#17130e",
                    color: "#f7ecd7",
                    fontSize: 36,
                    fontWeight: 800,
                  }}
                >
                  W
                </div>
                <div style={{ display: "flex", flexDirection: "column" }}>
                  <div style={{ fontSize: 24, fontWeight: 800, letterSpacing: 7, color: "#231007" }}>WORTINS</div>
                  <div style={{ fontSize: 14, letterSpacing: 4, color: "rgba(35,16,7,0.62)" }}>THE DAILY AI BRIEFING</div>
                </div>
              </div>
              <div style={{ display: "flex", fontSize: 16, letterSpacing: 3, color: "rgba(35,16,7,0.62)" }}>{serial}</div>
            </div>

            <div style={{ display: "flex", height: 2, backgroundColor: "rgba(35,16,7,0.28)", marginTop: 30 }} />

            {/* headline — the focal point */}
            <div style={{ display: "flex", flexWrap: "wrap", marginTop: 48, rowGap: Math.round(gap * 0.72) }}>
              {chips.map((c, i) => (
                <span
                  key={i}
                  style={{
                    fontSize: fs,
                    lineHeight: 1.04,
                    fontWeight: 800,
                    color: c.hl ? "#f7ecd7" : "#231007",
                    backgroundColor: c.hl ? "#17130e" : "transparent",
                    padding: c.hl ? `1px ${Math.round(fs * 0.15)}px 7px` : "1px 0 7px",
                    marginRight: gap,
                  }}
                >
                  {c.text}
                </span>
              ))}
            </div>

            {q ? (
              <div style={{ display: "flex", marginTop: 40 }}>
                <div style={{ display: "flex", width: 6, backgroundColor: "rgba(35,16,7,0.42)", marginRight: 22 }} />
                <div style={{ display: "flex", fontSize: 29, lineHeight: 1.4, color: "rgba(35,16,7,0.82)", flex: 1 }}>{q}</div>
              </div>
            ) : null}

            <div style={{ display: "flex", marginTop: "auto", justifyContent: "space-between", alignItems: "flex-end" }}>
              <div style={{ display: "flex", flexDirection: "column" }}>
                {source ? (
                  <div style={{ display: "flex", fontSize: 15, letterSpacing: 3, color: "rgba(35,16,7,0.6)" }}>
                    {`SOURCE · ${source.toUpperCase().slice(0, 26)}`}
                  </div>
                ) : null}
                <div style={{ display: "flex", fontSize: 19, letterSpacing: 3, color: "rgba(35,16,7,0.72)", marginTop: 7 }}>
                  {dateLabel}
                </div>
              </div>
              <div style={{ display: "flex", fontSize: 25, fontWeight: 800, letterSpacing: 2, color: "#231007" }}>
                wortins.com
              </div>
            </div>
          </div>

          {/* perforation + stub */}
          <div style={{ display: "flex", width: 0, borderLeft: "5px dashed rgba(23,19,14,0.4)" }} />
          <div
            style={{
              display: "flex",
              width: 116,
              backgroundColor: "#17130e",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <div
              style={{
                display: "flex",
                transform: "rotate(90deg)",
                fontSize: 38,
                fontWeight: 800,
                letterSpacing: 15,
                color: "#f7ecd7",
                whiteSpace: "nowrap",
              }}
            >
              AI BRIEFING
            </div>
          </div>
        </div>
      </div>
    ),
    TICKET_SIZE
  );
}

// ---------------------------------------------------------------------------
// The share card: a newspaper clipping pinned on the brand rust.
//
// Satori only does flexbox and a CSS subset, so two things from the design
// mockup are built differently here: the deckled top edge is a row of small
// squares rather than a CSS mask (masks are unsupported), and every text node
// names its fontFamily explicitly rather than relying on inheritance.
//
// Inset-clipping-on-colour is also what fixes the old card's dead space: the
// frame is filled by the coloured field no matter how short the headline is.
const CLIP = {
  field: "#b8391f", // rust field behind the clipping
  paper: "#faf7f0", // the cutting
  ink: "#17130f",
  muted: "#9b8f7c",
  rule: "#d8cfbd",
  deck: "#5a5044",
};

// clamp() cuts at an exact character count, which lands mid-word on the long
// curator titles that have no plain-English rewrite yet ("...with its cam…").
// Cut back to the last word boundary instead.
function clampWords(s: string, max: number): string {
  const t = s.trim().replace(/\s+/g, " ");
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  const at = cut.lastIndexOf(" ");
  return (at > max * 0.6 ? cut.slice(0, at) : cut).replace(/[,;:.\s]+$/, "") + "…";
}

let serifCache: { regular: ArrayBuffer; italic: ArrayBuffer } | null = null;
function loadSerif() {
  if (!serifCache) {
    serifCache = {
      regular: fontData(INSTRUMENT_SERIF_REGULAR),
      italic: fontData(INSTRUMENT_SERIF_ITALIC),
    };
  }
  return serifCache;
}

// Instrument Serif is narrow, so it fits more per line than a normal serif.
// Sized against the clipping's ~796px of usable width.
function clipHeadlineSize(title: string): number {
  const n = title.trim().length;
  if (n <= 34) return 112;
  if (n <= 46) return 100;
  if (n <= 60) return 88;
  if (n <= 78) return 76;
  if (n <= 100) return 66;
  return 58;
}

export type ClippingFields = {
  title: string;
  quote?: string | null;
  source?: string | null;
  dateLabel?: string;
  serial?: string;
  kicker?: string | null;
};

export async function renderClippingCard({
  title,
  quote,
  source,
  dateLabel,
  serial,
  kicker,
}: ClippingFields): Promise<ImageResponse> {
  const fonts = loadSerif();
  const h = clampWords(title, 118);
  const q = quote ? clampWords(quote, 190) : "";
  const fs = clipHeadlineSize(h);
  const serifBase = { fontFamily: "Instrument Serif" as const };
  const metaBase = { ...serifBase, letterSpacing: 3, color: CLIP.muted, fontSize: 17 };

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: CLIP.field,
          backgroundImage: `radial-gradient(120% 90% at 20% 10%, rgba(255,255,255,0.13), rgba(255,255,255,0) 55%)`,
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            width: 920,
            backgroundColor: CLIP.paper,
            padding: "62px 62px 52px",
            transform: "rotate(-1.4deg)",
            boxShadow: "0 34px 80px rgba(0,0,0,0.34)",
            position: "relative",
          }}
        >
          {/* deckled top edge: squares, because Satori has no mask support */}
          <div style={{ position: "absolute", top: -7, left: 0, display: "flex" }}>
            {Array.from({ length: 33 }).map((_, i) => (
              <div
                key={i}
                style={{ width: 14, height: 14, marginRight: 14, backgroundColor: CLIP.paper }}
              />
            ))}
          </div>

          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "baseline",
              borderBottom: `1px solid ${CLIP.ink}`,
              paddingBottom: 16,
            }}
          >
            <div style={{ ...serifBase, fontSize: 29, letterSpacing: 7, color: CLIP.ink }}>WORTINS</div>
            <div style={{ ...metaBase, fontSize: 15 }}>THE DAILY AI BRIEFING</div>
          </div>

          <div style={{ ...serifBase, fontSize: 16, letterSpacing: 4, color: CLIP.field, marginTop: 42 }}>
            {[kicker || "AI BRIEFING", serial].filter(Boolean).join("  ·  ").toUpperCase()}
          </div>

          <div
            style={{
              ...serifBase,
              fontSize: fs,
              lineHeight: 0.98,
              letterSpacing: -1,
              color: CLIP.ink,
              marginTop: 22,
            }}
          >
            {h}
          </div>

          {q ? (
            <div
              style={{
                ...serifBase,
                fontStyle: "italic",
                fontSize: 30,
                lineHeight: 1.44,
                color: CLIP.deck,
                marginTop: 34,
              }}
            >
              {q}
            </div>
          ) : null}

          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "baseline",
              borderTop: `1px solid ${CLIP.rule}`,
              marginTop: 48,
              paddingTop: 22,
            }}
          >
            <div style={metaBase}>
              {[source ? `SOURCE · ${source.toUpperCase()}` : null, dateLabel].filter(Boolean).join("  ·  ")}
            </div>
            <div style={{ ...serifBase, fontSize: 26, letterSpacing: 1, color: CLIP.field }}>wortins.com</div>
          </div>
        </div>
      </div>
    ),
    {
      width: 1080,
      height: 1350,
      fonts: [
        { name: "Instrument Serif", data: fonts.regular, weight: 400, style: "normal" },
        { name: "Instrument Serif", data: fonts.italic, weight: 400, style: "italic" },
      ],
    }
  );
}
