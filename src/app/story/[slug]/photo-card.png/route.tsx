import { getStoryBySlug } from "@/lib/publicData";
import { renderPhotoCard } from "@/lib/photoCard";

// The story's real photo with the headline over it (see lib/photoCard). 404
// when the story has no usable photo, so callers fall back to the clipping
// card. Stored in R2 like the clipping card: a render costs seconds and the
// photo fetch on top, and R2 is one bucket for the world.
export const revalidate = 3600;

const R2_PREFIX = "photo-cards/";
const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
const STOCK_RE = /gettyimages|shutterstock|istock|depositphotos|adobestock|dreamstime|alamy|stock-photo/i;
const MAX_PHOTO_BYTES = 4 * 1024 * 1024;

type R2Like = {
  get(k: string): Promise<{ body: ReadableStream | null } | null>;
  put(k: string, v: ArrayBuffer): Promise<unknown>;
};
async function r2(): Promise<R2Like | null> {
  try {
    const mod = await import("@opennextjs/cloudflare");
    const ctx = await mod.getCloudflareContext({ async: true });
    return (ctx?.env as unknown as { NEXT_INC_CACHE_R2_BUCKET?: R2Like })?.NEXT_INC_CACHE_R2_BUCKET ?? null;
  } catch {
    return null;
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
    "Content-Disposition": `attachment; filename="wortins-${slug.slice(0, 40)}-photo.png"`,
    "Cache-Control": "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800",
  };
}

async function photoDataUrl(src: string): Promise<string | null> {
  try {
    const res = await fetch(src, { headers: { "User-Agent": "Mozilla/5.0 (compatible; WortinsBot/1.0)" }, redirect: "follow" });
    if (!res.ok) return null;
    const type = (res.headers.get("content-type") || "").split(";")[0].trim();
    if (!/^image\/(jpeg|png|webp)$/.test(type)) return null;
    const buf = await res.arrayBuffer();
    if (buf.byteLength < 25000 || buf.byteLength > MAX_PHOTO_BYTES) return null;
    return `data:${type};base64,${Buffer.from(buf).toString("base64")}`;
  } catch {
    return null;
  }
}

export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const keyUrl = new URL(req.url);
  keyUrl.search = "";
  const cacheKey = new Request(keyUrl.toString(), { method: "GET" });
  const cache = edgeCache();
  if (cache) {
    try { const hit = await cache.match(cacheKey); if (hit) return hit; } catch { /* fall through */ }
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
    } catch { /* fall through */ }
  }

  const item = await getStoryBySlug(slug);
  if (!item) return new Response("Not found", { status: 404 });
  if (!item.image_url || STOCK_RE.test(item.image_url)) return new Response("No usable photo", { status: 404 });
  const photo = await photoDataUrl(item.image_url);
  if (!photo) return new Response("Photo unavailable", { status: 404 });

  const d = new Date(item.published_at ?? item.created_at);
  const kicker = `AI · ${String(d.getUTCDate()).padStart(2, "0")} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
  const tag = item.section === "funding" ? "FUNDING" : item.section === "articles" ? "READ" : "NEWS";

  const img = renderPhotoCard({
    title: item.plain_title || item.title,
    line: item.plain_line || item.summary,
    photo,
    kicker,
    tag,
    credit: item.source,
  });
  const bytes = await new Response(img.body).arrayBuffer();
  if (bucket) { try { await bucket.put(r2Key, bytes); } catch { /* optional */ } }
  const res = new Response(bytes, { headers: pngHeaders(slug) });
  if (cache) { try { await cache.put(cacheKey, res.clone()); } catch { /* optional */ } }
  return res;
}
