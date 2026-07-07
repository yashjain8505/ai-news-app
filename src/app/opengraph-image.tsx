import { SITE } from "@/lib/seo";
import { renderOgImage, OG_SIZE, OG_CONTENT_TYPE } from "@/lib/og";

// Default site share card (home + any segment without its own image).
export const alt = `${SITE.name} · ${SITE.tagline}`;
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default function Image() {
  return renderOgImage({
    title: "AI news worth reading",
    subtitle:
      "Emerging startups, real product launches, applied AI, and genuine breakthroughs · beyond the usual giants.",
  });
}
