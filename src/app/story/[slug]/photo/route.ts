import { getStoryBySlug } from "@/lib/publicData";

export const dynamic = "force-dynamic";

// The story's real photo (the publisher's og:image), served from our own
// origin so the phone page can fetch it as a blob and hand it to the share
// sheet. Publishers' CDNs do not allow cross-origin fetches from a browser.
export async function GET(_req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  const story = await getStoryBySlug(slug);
  const src = story?.image_url;
  if (!src) return new Response("no photo", { status: 404 });
  const upstream = await fetch(src, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; WortinsBot/1.0)" },
    redirect: "follow",
    cf: { cacheTtl: 86400, cacheEverything: true },
  } as RequestInit);
  if (!upstream.ok) return new Response("photo unavailable", { status: 502 });
  const type = (upstream.headers.get("content-type") || "image/jpeg").split(";")[0];
  if (!type.startsWith("image/")) return new Response("not an image", { status: 502 });
  return new Response(upstream.body, {
    headers: { "Content-Type": type, "Cache-Control": "public, max-age=86400" },
  });
}
