import { getStoryBySlug } from "@/lib/publicData";
import { renderShareTicket } from "@/lib/og";

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

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const item = await getStoryBySlug(slug);
  if (!item) return new Response("Not found", { status: 404 });

  const d = new Date(item.published_at ?? item.created_at);
  const dateLabel = `${String(d.getUTCDate()).padStart(2, "0")} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;

  // Prefer the plain-English rewrite. This card is what goes out on X and
  // LinkedIn in place of a link, so it has to be readable at a glance: the
  // curator title ("...Industrial-Scale Model Distillation") is exactly the
  // press-release phrasing the plain rewrite exists to replace. `highlight` is
  // an exact substring of the ORIGINAL title, so only keep it when it still
  // appears in whichever title we actually render.
  const cardTitle = item.plain_title || item.title;
  const cardQuote = item.plain_line || item.summary;
  const highlight = item.highlight && cardTitle.includes(item.highlight) ? item.highlight : null;

  const img = renderShareTicket({
    title: cardTitle,
    quote: cardQuote,
    highlight,
    source: item.source,
    dateLabel,
    serial: serialFor(slug),
  });
  const res = new Response(img.body, img);
  res.headers.set("Content-Type", "image/png");
  res.headers.set("Content-Disposition", `attachment; filename="wortins-${slug.slice(0, 40)}.png"`);
  res.headers.set("Cache-Control", "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800");
  return res;
}
