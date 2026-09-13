import { ImageResponse } from "next/og";
import { fontData } from "@/lib/fonts";
import { SPACE_GROTESK_BOLD, SPACE_GROTESK_MEDIUM } from "@/lib/fonts-grotesk";

// The "photo card": the story's real photo with the headline set over a dark
// gradient, the way the insta-news covers do it (the design the user asked
// for: "real images and text over them", "in the image I should get some
// context"). Portrait 1080x1350, same canvas as the clipping card, so both
// sit the same in an X or LinkedIn feed.
//
// Satori rules that shape this file: every text node sets its own fontFamily
// (no inheritance), only flex layout, no box-decoration-break, so the
// highlighted phrase is rendered as a wrapped row of word boxes rather than
// an inline span.

export const PHOTO_CARD_SIZE = { width: 1080, height: 1350 };

export type PhotoCardFields = {
  title: string;
  /** One plain line of context under the headline. */
  line?: string | null;
  /** Data URL or absolute URL of the photo. */
  photo: string;
  kicker: string; // e.g. "AI · 13 SEP 2026"
  tag: string; // e.g. "NEWS" | "FUNDING" | "READ"
  credit?: string | null;
};

// The phrase to set in the rust box: the first number-led phrase in the
// headline ("$1.5 billion", "188%", "20 billion payments"), else nothing.
function highlightSpan(title: string): [number, number] | null {
  const m = title.match(/(?:[$£€₹]\s?)?\d[\d,.]*\s?(?:%|percent|billion|million|trillion|bn|m|k|x)?(?![a-z])/i);
  if (!m || m.index === undefined) return null;
  // Only when the match actually carries a number worth boxing.
  if (!/\d/.test(m[0]) || m[0].trim().length < 2) return null;
  return [m.index, m.index + m[0].trimEnd().length];
}

function headlineSize(t: string): number {
  const n = t.length;
  if (n <= 40) return 88;
  if (n <= 60) return 78;
  if (n <= 80) return 68;
  if (n <= 100) return 60;
  return 54;
}

export function renderPhotoCard({ title, line, photo, kicker, tag, credit }: PhotoCardFields): ImageResponse {
  const S = PHOTO_CARD_SIZE;
  const t = title.length > 120 ? title.slice(0, 117).replace(/\s+\S*$/, "") + "…" : title;
  const fs = headlineSize(t);
  const hl = highlightSpan(t);
  const bold = "Space Grotesk";
  const cream = "#F3ECDA";
  const rust = "#9C2B1D";

  // Words laid out as a wrapping flex row; the highlighted phrase is ONE box
  // (its words joined), so "$1.5 billion" reads as a single rust block.
  const words: { w: string; hi: boolean }[] = [];
  let pos = 0;
  for (const w of t.split(/\s+/)) {
    const start = t.indexOf(w, pos);
    const end = start + w.length;
    const hi = !!hl && start >= hl[0] && end <= hl[1];
    const last = words[words.length - 1];
    if (hi && last?.hi) last.w += ` ${w}`;
    else words.push({ w, hi });
    pos = end;
  }
  const ctx = line ? (line.length > 150 ? line.slice(0, 147).replace(/\s+\S*$/, "") + "…" : line) : "";

  return new ImageResponse(
    (
      <div
        style={{
          width: S.width, height: S.height, display: "flex", flexDirection: "column",
          justifyContent: "space-between", position: "relative", backgroundColor: "#1B1712",
          padding: "72px 64px 64px", fontFamily: bold, color: cream,
        }}
      >
        {/* photo */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={photo}
          alt=""
          style={{ position: "absolute", top: 0, left: 0, width: S.width, height: S.height, objectFit: "cover", objectPosition: "center 30%" }}
        />
        {/* gradient */}
        <div
          style={{
            position: "absolute", top: 0, left: 0, width: S.width, height: S.height, display: "flex",
            backgroundImage: "linear-gradient(180deg, rgba(27,23,18,0.15) 0%, rgba(27,23,18,0.32) 38%, rgba(27,23,18,0.90) 72%, rgba(27,23,18,0.98) 100%)",
          }}
        />

        {/* masthead */}
        <div style={{ display: "flex", alignItems: "center" }}>
          <div style={{ display: "flex", alignItems: "center", backgroundColor: cream, padding: "8px 14px 8px 8px" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 40, height: 40, backgroundColor: rust, color: cream, fontFamily: bold, fontSize: 30, fontWeight: 700 }}>W</div>
            <div style={{ display: "flex", marginLeft: 10, color: "#1B1712", fontFamily: bold, fontSize: 30, fontWeight: 700, letterSpacing: 4 }}>WORTINS</div>
          </div>
        </div>

        {/* block */}
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", alignItems: "center", marginBottom: 30 }}>
            <div style={{ display: "flex", backgroundColor: rust, color: cream, fontFamily: bold, fontSize: 24, fontWeight: 700, letterSpacing: 2, padding: "12px 20px" }}>{tag}</div>
            <div style={{ display: "flex", marginLeft: 22, fontFamily: bold, fontSize: 23, fontWeight: 500, letterSpacing: 4, color: "rgba(243,236,218,0.85)" }}>{kicker}</div>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-start" }}>
            {words.map((x, i) => (
              <div
                key={i}
                style={{
                  display: "flex", fontFamily: bold, fontSize: fs, fontWeight: 700, lineHeight: 1.18,
                  marginRight: Math.round(fs * 0.24), marginBottom: 6,
                  ...(x.hi ? { backgroundColor: rust, color: cream, padding: "0 14px" } : {}),
                }}
              >
                {x.w}
              </div>
            ))}
          </div>
          {ctx ? (
            <div style={{ display: "flex", marginTop: 26, fontFamily: bold, fontSize: 31, fontWeight: 500, lineHeight: 1.35, color: "rgba(243,236,218,0.86)", maxWidth: 940 }}>{ctx}</div>
          ) : null}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginTop: 44 }}>
            <div style={{ display: "flex", flexDirection: "column" }}>
              <div style={{ display: "flex", fontFamily: bold, fontSize: 24, fontWeight: 500, color: "rgba(243,236,218,0.68)" }}>wortins.com</div>
              {credit ? <div style={{ display: "flex", marginTop: 8, fontFamily: bold, fontSize: 17, fontWeight: 500, color: "rgba(243,236,218,0.42)" }}>Photo: {credit}</div> : null}
            </div>
          </div>
        </div>
      </div>
    ),
    {
      ...S,
      fonts: [
        { name: bold, data: fontData(SPACE_GROTESK_BOLD), weight: 700, style: "normal" },
        { name: bold, data: fontData(SPACE_GROTESK_MEDIUM), weight: 500, style: "normal" },
      ],
    }
  );
}
