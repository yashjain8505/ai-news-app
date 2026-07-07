import type { NextConfig } from "next";

// Content-Security-Policy. `'unsafe-inline'` on script-src is required because the
// app ships framework bootstrap, the GA snippet, the theme script, and JSON-LD as
// inline <script>s (no nonce pipeline). img-src allows any https host + our image
// CDN since story thumbnails come from arbitrary publishers.
const csp = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' https://www.googletagmanager.com https://www.google-analytics.com",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  "connect-src 'self' https://*.supabase.co https://*.google-analytics.com https://*.googletagmanager.com https://*.analytics.google.com",
  "frame-ancestors 'self'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
  "upgrade-insecure-requests",
].join("; ");

// HSTS is already set upstream; add the other standard hardening headers.
const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), browsing-topics=()",
  },
];

// Content pages have a Markdown twin, so they vary by Accept: an AI client that
// prefers text/markdown gets the twin, everyone else gets HTML. Set at the
// config layer because the framework overwrites a Vary set in proxy.
const varyAccept = [{ key: "Vary", value: "Accept" }];
const CONTENT_HEADER_SOURCES = [
  "/",
  "/about",
  "/contact",
  "/editions",
  "/daily-ai",
  "/new-tools",
  "/articles",
  "/funding",
  "/story/:slug",
  "/edition/:date",
];

const nextConfig: NextConfig = {
  // Optimize the (external) story images: resize to the display size + serve
  // AVIF/WebP instead of the giant source JPEG/PNGs.
  images: {
    remotePatterns: [{ protocol: "https", hostname: "**" }],
    formats: ["image/avif", "image/webp"],
  },
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      ...CONTENT_HEADER_SOURCES.map((source) => ({ source, headers: varyAccept })),
    ];
  },
  async redirects() {
    return [
      // Canonical host: send the bare apex (wortins.com) to www. www requests
      // have host "www.wortins.com" and don't match, so there's no loop. HTTP is
      // already forced to HTTPS by the platform/HSTS.
      {
        source: "/:path*",
        has: [{ type: "host", value: "wortins.com" }],
        destination: "https://www.wortins.com/:path*",
        permanent: true,
      },
      // Old /section/<x> URLs now live at clean, SEO-friendly slugs.
      { source: "/section/daily", destination: "/daily-ai", permanent: true },
      { source: "/section/tools", destination: "/new-tools", permanent: true },
      { source: "/section/articles", destination: "/articles", permanent: true },
      { source: "/section/funding", destination: "/funding", permanent: true },
    ];
  },
};

export default nextConfig;
