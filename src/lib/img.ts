// Story images come from many external publishers, often as huge source JPEG/PNGs.
// Route them through a lightweight image CDN so we serve a resized WebP sized to
// the box it's shown in, instead of shipping a 3000px file. Our own assets and
// non-http sources are passed through untouched.
export function optImg(
  url: string | null | undefined,
  width: number
): string | undefined {
  if (!url) return undefined;
  if (!/^https?:\/\//i.test(url)) return url;
  const src = encodeURIComponent(url.replace(/^https?:\/\//i, ""));
  // w = target width, we = never upscale, output/q = WebP at a sane quality.
  return `https://images.weserv.nl/?url=${src}&w=${width}&we&output=webp&q=78`;
}
