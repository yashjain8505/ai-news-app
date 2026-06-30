import { ImageResponse } from "next/og";

// Apple touch icon (home-screen bookmark on iOS) — the oxblood W mark as PNG,
// since Safari ignores SVG favicons for touch icons.
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#9c2b1d",
          color: "#f3efe6",
          fontSize: 128,
          fontWeight: 700,
        }}
      >
        W
      </div>
    ),
    { ...size }
  );
}
