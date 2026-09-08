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

  const img = renderShareTicket({
    title: item.title,
    quote: item.summary,
    highlight: item.highlight,
    source: item.source,
    dateLabel,
    serial: serialFor(slug),
  });
  const res = new Response(img.body, img);
  res.headers.set("Content-Type", "image/png");
  res.headers.set("Content-Disposition", `attachment; filename="wortins-${slug.slice(0, 40)}.png"`);
  res.headers.set("Cache-Control", "public, max-age=3600");
  return res;
}
