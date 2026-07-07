import type { NextRequest } from "next/server";
import { renderMarkdown } from "@/lib/markdown";
import { absoluteUrl } from "@/lib/seo";

// The Markdown-twin endpoint. `proxy.ts` rewrites both `<path>.md` requests and
// AI-client content-negotiated requests here. It serves clean markdown plus the
// AEO delivery/conformance headers the report asks for:
//   X-Robots-Tag: noindex        — the twin must not compete with the HTML canonical
//   Vary: Accept                 — caches keep HTML and markdown variants apart
//   X-Markdown-Tokens            — token budget hint for AI clients
//   X-Content-Type-Options       — nosniff, so it's always read as markdown
//   X-AEO-Version                — advertises AEO conformance
//   Link: rel="canonical"        — points back at the indexable HTML page

export const dynamic = "force-dynamic";

const AEO_VERSION = "1.0";

export async function GET(request: NextRequest) {
  // proxy.ts passes the target via headers (rewrites drop the query string); the
  // query params are a fallback for a direct hit on this route.
  const path =
    request.headers.get("x-twin-path") ??
    request.nextUrl.searchParams.get("path") ??
    "/";
  // Negotiated hits are served on the canonical HTML URL, so they must not be
  // publicly cached (a human on the same URL must never get a cached twin).
  const negotiated =
    (request.headers.get("x-twin-neg") ??
      request.nextUrl.searchParams.get("neg")) === "1";
  const twin = await renderMarkdown(path);

  if (!twin) {
    return new Response("Not found\n", {
      status: 404,
      headers: {
        "Content-Type": "text/markdown; charset=utf-8",
        "X-Robots-Tag": "noindex",
        "X-Content-Type-Options": "nosniff",
        "X-AEO-Version": AEO_VERSION,
      },
    });
  }

  return new Response(twin.body, {
    status: 200,
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "X-Robots-Tag": "noindex",
      Vary: negotiated ? "Accept, User-Agent" : "Accept",
      "X-Markdown-Tokens": String(twin.tokens),
      "X-Content-Type-Options": "nosniff",
      "X-AEO-Version": AEO_VERSION,
      Link: `<${absoluteUrl(path)}>; rel="canonical"`,
      // Direct .md hits ride the CDN at the pages' ISR cadence; negotiated hits
      // on the canonical URL must stay private so a human never gets the twin.
      "Cache-Control": negotiated
        ? "private, no-store"
        : "public, max-age=0, s-maxage=1800, stale-while-revalidate=3600",
    },
  });
}
