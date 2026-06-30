import type { MetadataRoute } from "next";
import { SITE } from "@/lib/seo";

// PWA web manifest — installable, themed, branded with the W mark.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: `${SITE.name} — ${SITE.tagline}`,
    short_name: SITE.name,
    description: SITE.description,
    start_url: "/",
    display: "standalone",
    background_color: "#f3ecda",
    theme_color: "#f3ecda",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml" }],
  };
}
