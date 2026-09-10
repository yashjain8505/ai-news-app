import { SITE } from "@/lib/seo";
import { getStoryBySlug } from "@/lib/publicData";
import { renderClippingCard, OG_SIZE, OG_CONTENT_TYPE } from "@/lib/og";

export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;
export const alt = `${SITE.name} — AI story`;
export const revalidate = 1800;

export default async function Image({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  let title: string | null = null;
  let subtitle: string | null = null;
  let source: string | null = null;
  let dateLabel: string | undefined;
  try {
    const item = await getStoryBySlug(slug);
    if (item) {
      title = item.title;
      subtitle = item.summary;
      source = item.source ?? null;
      dateLabel = new Date(item.published_at ?? item.created_at)
        .toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })
        .toUpperCase();
    }
  } catch {
    // Fall back to a generic, DB-free card.
  }

  // Use the SAME newspaper-clipping design as the share card, in landscape.
  // These were two different images and only one of them was any good: the
  // share button produced the clipping, while every pasted link - LinkedIn, X,
  // WhatsApp, Slack - showed a plain dark card instead. One design now.
  return renderClippingCard({
    size: OG_SIZE,
    title: title ?? SITE.tagline,
    quote: subtitle ?? "The day's curated AI briefing.",
    source,
    dateLabel,
  });
}
