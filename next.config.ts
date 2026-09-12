import type { NextConfig } from "next";

// Content-Security-Policy. `'unsafe-inline'` on script-src is required because the
// app ships framework bootstrap, the GA snippet, the theme script, and JSON-LD as
// inline <script>s (no nonce pipeline). img-src allows any https host + our image
// CDN since story thumbnails come from arbitrary publishers.
const posthogHost = process.env.NEXT_PUBLIC_POSTHOG_HOST;
const posthogCspSource = posthogHost
  ? `https://*.${new URL(posthogHost).hostname.split(".").slice(-2).join(".")}`
  : undefined;

const csp = [
  "default-src 'self'",
  // static.cloudflareinsights.com: Cloudflare auto-injects its Web Analytics
  // beacon into HTML responses at the edge. It was missing from this list, so
  // the browser blocked it on every page load and Cloudflare Analytics recorded
  // nothing at all (confirmed 2026-09-09 from the console: "Loading the script
  // ... violates the following Content Security Policy directive"). The beacon
  // is injected by the edge, not by our HTML, so it never shows up in a curl of
  // the page - only a real browser reveals it.
  `script-src 'self' 'unsafe-inline' https://www.googletagmanager.com https://www.google-analytics.com https://static.cloudflareinsights.com${posthogCspSource ? ` ${posthogCspSource}` : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  // cloudflareinsights.com is where the beacon POSTs its measurements.
  `connect-src 'self' https://*.supabase.co https://*.google-analytics.com https://*.googletagmanager.com https://*.analytics.google.com https://cloudflareinsights.com${posthogCspSource ? ` ${posthogCspSource}` : ""}`,
  "worker-src 'self' blob: data:",
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

// bfcache rescue. The feed pages and story pages are `force-dynamic`, so Next
// emits `private, no-cache, no-store, max-age=0, must-revalidate` for them, and
// `no-store` is the ONE header that disqualifies Chrome's back/forward cache.
// Measured 2026-09-09: Back was 1277-1415ms and re-downloaded the whole 56 KB
// document, ~2x slower than the same navigation forwards; Chrome's
// notRestoredReasons reported exactly `response-cache-control-no-store`.
//
// Dropping `no-store` while KEEPING `no-cache` costs no freshness: bfcache is an
// in-memory snapshot of the page the reader just had, not an HTTP cache, and
// `no-cache` still forces a full revalidation on every real navigation. Only
// Back/Forward changes, and it becomes instant with scroll position restored.
//
// Scoped deliberately: /blog, /about and /daily-ai are edge-cached today
// (`s-maxage`), so a blanket rule here would REPLACE that with a private,
// uncacheable header and make them slower. Only pages that already send
// `no-store` are listed.
// Set at the config layer for the same reason as Vary above: the framework
// overwrites a Cache-Control set in proxy.
const bfcacheFriendly = [
  { key: "Cache-Control", value: "private, no-cache, max-age=0, must-revalidate" },
];
// Story pages are NOT in this list. They are ISR (`revalidate = 1800`), so Next
// emits its own `s-maxage` for them - and an override here would REPLACE that
// with a private, uncacheable header, throwing away the edge caching and making
// them permanently slow. It also masked the diagnosis: story pages kept
// reporting `private, no-cache` and it looked like ISR had failed, when what
// was actually being measured was this rule. ISR's own header carries no
// `no-store`, so bfcache works there without any help from us.
const NO_STORE_SOURCES = ["/", "/articles", "/funding", "/new-tools"];
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
  "/blog",
  "/blog/:slug",
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
      ...NO_STORE_SOURCES.map((source) => ({ source, headers: bfcacheFriendly })),
    ];
  },
  async redirects() {
    return [
      // Canonical host (apex -> www) used to live here as a has:[host] redirect.
      // On Cloudflare Workers, OpenNext misapplies host-conditioned redirects:
      // it matched EVERY host, so www 308-looped onto itself, and the empty
      // path substituted ":path*" literally. The redirect now lives in
      // src/proxy.ts, which reads the real request host. Do not re-add it here.
      // Old /section/<x> URLs now live at clean, SEO-friendly slugs.
      { source: "/section/daily", destination: "/daily-ai", permanent: true },
      { source: "/section/tools", destination: "/new-tools", permanent: true },
      { source: "/section/articles", destination: "/articles", permanent: true },
      { source: "/section/funding", destination: "/funding", permanent: true },
    ];
  },
};

export default nextConfig;
