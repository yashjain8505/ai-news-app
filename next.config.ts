import type { NextConfig } from "next";

// HSTS is already set upstream; add the other standard hardening headers.
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), browsing-topics=()",
  },
];

const nextConfig: NextConfig = {
  // Optimize the (external) story images: resize to the display size + serve
  // AVIF/WebP instead of the giant source JPEG/PNGs.
  images: {
    remotePatterns: [{ protocol: "https", hostname: "**" }],
    formats: ["image/avif", "image/webp"],
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
  // Old /section/<x> URLs now live at clean, SEO-friendly slugs.
  async redirects() {
    return [
      { source: "/section/daily", destination: "/daily-ai", permanent: true },
      { source: "/section/tools", destination: "/new-tools", permanent: true },
      { source: "/section/articles", destination: "/articles", permanent: true },
      { source: "/section/funding", destination: "/funding", permanent: true },
    ];
  },
};

export default nextConfig;
