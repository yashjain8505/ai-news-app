import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { SITE } from "@/lib/seo";

// Next.js 16 renamed `middleware` -> `proxy` (Node.js runtime). This file does
// three jobs:
//   1. Serves the Markdown twin for any `<path>.md` request.
//   2. Content negotiation: AI crawlers / markdown-preferring clients get the
//      twin on the canonical HTML URL.
//   3. Refreshes the Supabase auth cookie on the personalized surfaces (its
//      original job), and advertises the twin (Vary + Link) on content HTML.

const URL_ENV =
  process.env.NEXT_PUBLIC_SUPABASE_URL ??
  "https://zrjbzowohsgjbrhsldfi.supabase.co";
const KEY_ENV =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
  "sb_publishable_lYVDODp76VQg7WHKwi8WSA_jj8kyMtw";

// Only the personalized pages pay the auth round-trip.
const AUTH_PATHS = new Set(["/", "/welcome", "/tune"]);

// Kept in sync with robots.ts — the crawlers we want to feed markdown to.
const AI_BOTS = [
  "gptbot",
  "oai-searchbot",
  "chatgpt-user",
  "claudebot",
  "claude-web",
  "anthropic-ai",
  "perplexitybot",
  "perplexity-user",
  "google-extended",
  "applebot-extended",
  "ccbot",
  "bytespider",
  "amazonbot",
  "meta-externalagent",
  "cohere-ai",
];

function isAiBot(ua: string): boolean {
  const u = ua.toLowerCase();
  return AI_BOTS.some((b) => u.includes(b));
}

function prefersMarkdown(accept: string): boolean {
  return /text\/markdown/i.test(accept);
}

const STATIC_CONTENT = new Set([
  "/daily-ai",
  "/new-tools",
  "/articles",
  "/funding",
  "/about",
  "/contact",
  "/editions",
]);

// A "primary" page that has a Markdown twin. Story/edition detail pages match
// only their single-segment form, so metadata sub-routes like
// `/story/<slug>/opengraph-image` are NOT treated as content.
function isContentPath(p: string): boolean {
  if (p === "/") return true;
  if (STATIC_CONTENT.has(p)) return true;
  if (p.startsWith("/story/")) return p.indexOf("/", 7) === -1;
  if (p.startsWith("/edition/")) return p.indexOf("/", 9) === -1;
  return false;
}

function twinPathFor(p: string): string {
  return p === "/" ? "/index.md" : `${p}.md`;
}

async function refreshAuth(request: NextRequest): Promise<NextResponse> {
  let response = NextResponse.next({ request });
  const supabase = createServerClient(URL_ENV, KEY_ENV, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });
  await supabase.auth.getUser();
  return response;
}

function twinRewrite(request: NextRequest, path: string, negotiated: boolean) {
  // Pass the twin target via request headers, not the query string: a rewrite
  // drops the destination query in Next's proxy, but request headers survive.
  const headers = new Headers(request.headers);
  headers.set("x-twin-path", path);
  headers.set("x-twin-neg", negotiated ? "1" : "0");
  return NextResponse.rewrite(new URL("/api/twin", request.url), {
    request: { headers },
  });
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // 1. Direct Markdown twin request: /foo.md (and /index.md -> home).
  if (pathname.endsWith(".md")) {
    const target = pathname === "/index.md" ? "/" : pathname.slice(0, -3);
    return twinRewrite(request, target, false);
  }

  const content = isContentPath(pathname);

  // 2. Content negotiation: serve the twin to AI clients on the canonical URL.
  if (content) {
    const accept = request.headers.get("accept") ?? "";
    const ua = request.headers.get("user-agent") ?? "";
    if (prefersMarkdown(accept) || isAiBot(ua)) {
      return twinRewrite(request, pathname, true);
    }
  }

  // 3. Auth refresh on the personalized surfaces (unchanged behavior).
  const response = AUTH_PATHS.has(pathname)
    ? await refreshAuth(request)
    : NextResponse.next({ request });

  // 4. Advertise the twin on content HTML and vary on Accept so caches keep the
  //    HTML and markdown variants apart.
  if (content) {
    response.headers.append("Vary", "Accept");
    response.headers.append(
      "Link",
      `<${SITE.url}${twinPathFor(pathname)}>; rel="alternate"; type="text/markdown"`
    );
  }
  return response;
}

export const config = {
  matcher: [
    // Everything except API routes, Next internals, and static asset files.
    // `.md` is intentionally NOT excluded so twin requests are caught.
    "/((?!api|_next/static|_next/image|.*\\.(?:png|jpg|jpeg|gif|svg|ico|webp|avif|css|js|mjs|map|woff|woff2|ttf|xml|txt|json|webmanifest)$).*)",
  ],
};
