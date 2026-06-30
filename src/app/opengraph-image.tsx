import { ImageResponse } from "next/og";

// Default social / answer-engine share card (1200x630).
export const alt = "Wortins — The daily AI briefing";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          height: "100%",
          width: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-start",
          justifyContent: "center",
          backgroundColor: "#efe9da",
          padding: "84px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center" }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: "108px",
              height: "108px",
              backgroundColor: "#9c2b1d",
              color: "#f3efe6",
              fontSize: "78px",
              fontWeight: 700,
              marginRight: "30px",
            }}
          >
            W
          </div>
          <div style={{ display: "flex", fontSize: "94px", fontWeight: 700, color: "#1a1a1a", letterSpacing: "6px" }}>
            WORTINS
          </div>
        </div>
        <div style={{ display: "flex", fontSize: "42px", color: "#4a4a4a", marginTop: "44px" }}>
          The daily AI briefing
        </div>
        <div style={{ display: "flex", fontSize: "27px", color: "#9c2b1d", marginTop: "22px" }}>
          startups · products · applied AI · breakthroughs
        </div>
      </div>
    ),
    size
  );
}
