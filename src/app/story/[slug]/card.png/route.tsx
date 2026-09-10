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

// Rendering this card costs ~3s of Satori work, and Worker responses are not
// edge-cached by default (cf-cache-status came back null), so every single
// request paid it — which is what made /today unusable. Cache the rendered PNG
// on Cloudflare's edge, keyed by the request URL.
//
// Entirely best-effort: `caches` does not exist under `next dev`, and any
// failure here must fall through to a normal render rather than break the card.
type EdgeCache = { match(k: Request): Promise<Response | undefined>; put(k: Request, v: Response): Promise<void> };
function edgeCache(): EdgeCache | null {
  try {
    const c = (globalThis as { caches?: { default?: EdgeCache } }).caches;
    return c?.default ?? null;
  } catch {
    return null;
  }
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;

  // Strip cache-busting query params so every visitor shares one cached render.
  const keyUrl = new URL(req.url);
  keyUrl.search = "";
  const cacheKey = new Request(keyUrl.toString(), { method: "GET" });
  const cache = edgeCache();
  if (cache) {
    try {
      const hit = await cache.match(cacheKey);
      if (hit) return hit;
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
  const res = new Response(img.body, img);
  res.headers.set("Content-Type", "image/png");
  res.headers.set("Content-Disposition", `attachment; filename="wortins-${slug.slice(0, 40)}.png"`);
  res.headers.set("Cache-Control", "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800");
  if (cache) {
    try { await cache.put(cacheKey, res.clone()); } catch { /* caching is optional */ }
  }
  return res;
}
