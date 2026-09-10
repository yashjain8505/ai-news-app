import { getStoryBySlug } from "@/lib/publicData";
import { renderClippingCard } from "@/lib/og";

// Downloadable share-ticket image for a story (portrait 1080x1350). The share
// flow: reader saves this card and posts it NATIVELY on LinkedIn/X with their
// own take (image posts out-reach link posts; the story link goes in the
// comment). Content-Disposition makes a plain click save the file.
export const revalidate = 3600;

function serialFor(slug: string): string {
  let h = 0;
  for (const ch of slug) h = (h * 31 + ch.charCodeAt(0)) % 10000;
  return `No ${String(h).padStart(4, "0")}`;
}

const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

// Rendering this card costs ~3s of Satori work, so it must be stored, not
// recomputed. Two layers, in order:
//
//   1. R2  - GLOBAL. This is the one that matters. Cloudflare's Cache API is
//            per-datacenter, so a card warmed from a CI runner in the US does
//            nothing for a reader in Mumbai; measured here as HIT 1.0s vs
//            MISS 4.6s on alternating requests to the same URL. R2 is one
//            bucket for the world, so a single render serves everyone.
//   2. Edge - still worth keeping in front of R2 to save the round trip.
//
// Both are best-effort. Any failure falls through to a normal render: caching
// can make this route faster but must never be able to break it.
const R2_PREFIX = "cards/";

type R2Like = {
  get(k: string): Promise<{ body: ReadableStream | null } | null>;
  put(k: string, v: ArrayBuffer): Promise<unknown>;
};

async function r2(): Promise<R2Like | null> {
  try {
    const mod = await import("@opennextjs/cloudflare");
    const ctx = await mod.getCloudflareContext({ async: true });
    return (ctx?.env as unknown as { NEXT_INC_CACHE_R2_BUCKET?: R2Like })
      ?.NEXT_INC_CACHE_R2_BUCKET ?? null;
  } catch {
    return null; // next dev, or no binding: just render
  }
}

type EdgeCache = { match(k: Request): Promise<Response | undefined>; put(k: Request, v: Response): Promise<void> };
function edgeCache(): EdgeCache | null {
  try {
    return (globalThis as { caches?: { default?: EdgeCache } }).caches?.default ?? null;
  } catch {
    return null;
  }
}

function pngHeaders(slug: string): Record<string, string> {
  return {
    "Content-Type": "image/png",
    "Content-Disposition": `attachment; filename="wortins-${slug.slice(0, 40)}.png"`,
    "Cache-Control": "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800",
  };
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;

  // Strip query params so cache-busting callers still share one stored render.
  const keyUrl = new URL(req.url);
  keyUrl.search = "";
  const cacheKey = new Request(keyUrl.toString(), { method: "GET" });

  const cache = edgeCache();
  if (cache) {
    try {
      const hit = await cache.match(cacheKey);
      if (hit) return hit;
    } catch { /* fall through */ }
  }

  const bucket = await r2();
  const r2Key = `${R2_PREFIX}${slug}.png`;
  if (bucket) {
    try {
      const obj = await bucket.get(r2Key);
      if (obj?.body) {
        const res = new Response(obj.body, { headers: pngHeaders(slug) });
        if (cache) { try { await cache.put(cacheKey, res.clone()); } catch { /* optional */ } }
        return res;
      }
    } catch { /* fall through to a fresh render */ }
  }

  const item = await getStoryBySlug(slug);
  if (!item) return new Response("Not found", { status: 404 });

  const d = new Date(item.published_at ?? item.created_at);
  const dateLabel = `${String(d.getUTCDate()).padStart(2, "0")} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;

  // Prefer the plain-English rewrite. This card is what goes out on X and
  // LinkedIn in place of a link, so it has to be readable at a glance: the
  // curator title ("...Industrial-Scale Model Distillation") is exactly the
  // press-release phrasing the plain rewrite exists to replace. `highlight` is
  // The clipping card has no marker-highlight, so `highlight` is unused here.
  const cardTitle = item.plain_title || item.title;
  const cardQuote = item.plain_line || item.summary;

  const img = await renderClippingCard({
    title: cardTitle,
    quote: cardQuote,
    source: item.source,
    dateLabel,
    serial: serialFor(slug),
    kicker: item.section === "funding" ? "Funding" : null,
  });
  // Buffer once so the same bytes can be stored and returned.
  const bytes = await new Response(img.body).arrayBuffer();
  if (bucket) {
    try { await bucket.put(r2Key, bytes); } catch { /* optional */ }
  }
  const res = new Response(bytes, { headers: pngHeaders(slug) });
  if (cache) {
    try { await cache.put(cacheKey, res.clone()); } catch { /* optional */ }
  }
  return res;
}
