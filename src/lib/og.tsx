import { ImageResponse } from "next/og";
import { SITE } from "@/lib/seo";

// Shared Open Graph / Twitter card renderer. Used by the route-segment
// `opengraph-image.tsx` files (home, section, edition). next/og uses Satori,
// which only supports flexbox + a subset of CSS — no grid, no `display: block`.
export const OG_SIZE = { width: 1200, height: 630 };
export const OG_CONTENT_TYPE = "image/png";

// Brand palette (light theme — mirrors globals.css).
const C = {
  bg: "#f3ecda",
  ink: "#1b1712",
  muted: "#4a4338",
  dim: "#6a6052",
  accent: "#9c2b1d",
  onAccent: "#f3ecda",
  rule: "#c9bda4",
};

function clamp(s: string, max: number): string {
  const t = s.trim().replace(/\s+/g, " ");
  return t.length > max ? t.slice(0, max - 1).trimEnd() + "…" : t;
}

function headlineSize(title: string): number {
  const n = title.length;
  if (n <= 26) return 76;
  if (n <= 42) return 64;
  if (n <= 64) return 54;
  if (n <= 90) return 44;
  return 38;
}

export type OgFields = {
  kicker?: string;
  title: string;
  subtitle?: string | null;
  footerRight?: string;
};

export function renderOgImage({
  kicker,
  title,
  subtitle,
  footerRight,
}: OgFields): ImageResponse {
  const cleanTitle = clamp(title, 110);
  const fs = headlineSize(cleanTitle);
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          backgroundColor: C.bg,
          color: C.ink,
          padding: "60px 70px",
        }}
      >
        {/* Masthead */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div style={{ display: "flex", alignItems: "center" }}>
            <div
              style={{
                width: 58,
                height: 58,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: C.accent,
                color: C.onAccent,
                fontSize: 40,
                fontWeight: 700,
                lineHeight: 1,
              }}
            >
              W
            </div>
            <div
              style={{
                marginLeft: 18,
                fontSize: 30,
                letterSpacing: 8,
                color: C.ink,
                fontWeight: 700,
              }}
            >
              WORTINS
            </div>
          </div>
          {kicker ? (
            <div
              style={{
                fontSize: 21,
                letterSpacing: 3,
                color: C.dim,
                textTransform: "uppercase",
              }}
            >
              {clamp(kicker, 38)}
            </div>
          ) : null}
        </div>

        {/* Double rule (newspaper style) */}
        <div style={{ display: "flex", flexDirection: "column", marginTop: 22 }}>
          <div style={{ height: 3, backgroundColor: C.ink }} />
          <div style={{ height: 1, backgroundColor: C.ink, marginTop: 4 }} />
        </div>

        {/* Headline + subtitle */}
        <div
          style={{
            flexGrow: 1,
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
          }}
        >
          <div
            style={{ fontSize: fs, lineHeight: 1.07, color: C.ink, fontWeight: 700 }}
          >
            {cleanTitle}
          </div>
          {subtitle ? (
            <div
              style={{
                marginTop: 24,
                fontSize: 26,
                lineHeight: 1.32,
                color: C.muted,
              }}
            >
              {clamp(subtitle, 165)}
            </div>
          ) : null}
        </div>

        {/* Footer */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            paddingTop: 18,
            borderTopWidth: 1,
            borderTopStyle: "solid",
            borderTopColor: C.rule,
          }}
        >
          <div
            style={{
              fontSize: 25,
              color: C.accent,
              fontWeight: 700,
              letterSpacing: 1,
            }}
          >
            wortins.com
          </div>
          <div
            style={{
              fontSize: 19,
              color: C.dim,
              letterSpacing: 3,
              textTransform: "uppercase",
            }}
          >
            {footerRight ?? SITE.tagline}
          </div>
        </div>
      </div>
    ),
    { ...OG_SIZE }
  );
}
