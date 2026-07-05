import { SITE } from "@/lib/seo";
import { getStoryBySlug } from "@/lib/publicData";
import { renderOgImage, OG_SIZE, OG_CONTENT_TYPE } from "@/lib/og";

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
  let highlight: string | null = null;
  try {
    const item = await getStoryBySlug(slug);
    if (item) {
      title = item.title;
      subtitle = item.summary;
      highlight = item.highlight;
    }
  } catch {
    // Fall back to a generic, DB-free card.
  }

  return renderOgImage({
    title: title ?? SITE.tagline,
    subtitle: subtitle ?? "The day's curated AI briefing.",
    highlight,
  });
}
