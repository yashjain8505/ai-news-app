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
  const cleanTitle = clamp(title, 110);
  const fs = cleanTitle.length > 70 ? 62 : cleanTitle.length > 44 ? 72 : 84;
  const chips = titleChips(cleanTitle, highlight);
  const gap = Math.round(fs * 0.24);
  const q = quote ? clamp(quote, 170) : null;
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          backgroundColor: T.frame,
          padding: 44,
        }}
      >
        {/* the ticket */}
        <div
          style={{
            display: "flex",
            flex: 1,
            borderRadius: 28,
            overflow: "hidden",
            backgroundColor: T.paper,
            backgroundImage: "linear-gradient(160deg, #f7f1e2 0%, #f3ecda 46%, #eadfc5 100%)",
          }}
        >
          {/* main body */}
          <div style={{ display: "flex", flexDirection: "column", flex: 1, padding: "58px 54px 48px 62px" }}>
            {/* kicker row */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    width: 54,
                    height: 54,
                    backgroundColor: T.rust,
                    color: T.onRust,
                    fontSize: 38,
                    fontWeight: 800,
                  }}
                >
                  W
                </div>
                <div style={{ display: "flex", flexDirection: "column" }}>
                  <div style={{ fontSize: 25, fontWeight: 800, letterSpacing: 6, color: T.ink }}>WORTINS</div>
                  <div style={{ fontSize: 15, letterSpacing: 4, color: T.dim }}>THE DAILY AI BRIEFING</div>
                </div>
              </div>
              <div style={{ display: "flex", fontSize: 17, letterSpacing: 3, color: T.dim }}>{serial}</div>
            </div>

            {/* rule */}
            <div style={{ display: "flex", height: 3, backgroundColor: T.ink, marginTop: 34, opacity: 0.9 }} />
            <div style={{ display: "flex", height: 1, backgroundColor: T.ink, marginTop: 4, opacity: 0.5 }} />

            {/* headline with marker highlight */}
            <div style={{ display: "flex", flexWrap: "wrap", marginTop: 52, rowGap: Math.round(gap * 0.7) }}>
              {chips.map((c, i) => (
                <span
                  key={i}
                  style={{
                    fontSize: fs,
                    lineHeight: 1.06,
                    fontWeight: 800,
                    color: c.hl ? T.onRust : T.ink,
                    backgroundColor: c.hl ? T.rust : "transparent",
                    padding: c.hl ? `2px ${Math.round(fs * 0.16)}px 6px` : "2px 0 6px",
                    marginRight: gap,
                  }}
                >
                  {c.text}
                </span>
              ))}
            </div>

            {/* quote */}
            {q ? (
              <div style={{ display: "flex", marginTop: 46 }}>
                <div style={{ display: "flex", width: 7, backgroundColor: T.rust, marginRight: 26 }} />
                <div style={{ display: "flex", fontSize: 31, lineHeight: 1.42, color: T.dim, flex: 1 }}>{q}</div>
              </div>
            ) : null}

            {/* footer */}
            <div style={{ display: "flex", marginTop: "auto", justifyContent: "space-between", alignItems: "flex-end" }}>
              <div style={{ display: "flex", flexDirection: "column" }}>
                {source ? (
                  <div style={{ display: "flex", fontSize: 16, letterSpacing: 3, color: T.dim }}>
                    {`SOURCE · ${source.toUpperCase().slice(0, 28)}`}
                  </div>
                ) : null}
                <div style={{ display: "flex", fontSize: 20, letterSpacing: 3, color: T.dim, marginTop: 8 }}>
                  {`CLIPPED · ${dateLabel}`}
                </div>
              </div>
              <div style={{ display: "flex", fontSize: 26, fontWeight: 800, letterSpacing: 3, color: T.rust }}>
                wortins.com
              </div>
            </div>
          </div>

          {/* perforation + stub */}
          <div style={{ display: "flex", width: 0, borderLeft: `5px dashed rgba(23,19,14,0.35)` }} />
          <div
            style={{
              display: "flex",
              width: 130,
              backgroundColor: T.rust,
              backgroundImage: `linear-gradient(180deg, ${T.rustHi} 0%, ${T.rust} 55%, #7d2013 100%)`,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <div
              style={{
                display: "flex",
                transform: "rotate(90deg)",
                fontSize: 42,
                fontWeight: 800,
                letterSpacing: 16,
                color: T.onRust,
                whiteSpace: "nowrap",
              }}
            >
              READ ME FIRST
            </div>
          </div>
        </div>
      </div>
    ),
    TICKET_SIZE
  );
}
