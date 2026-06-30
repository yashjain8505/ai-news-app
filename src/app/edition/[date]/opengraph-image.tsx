import { SITE } from "@/lib/seo";
import { getEditionSynopsis } from "@/lib/publicData";
import { renderOgImage, OG_SIZE, OG_CONTENT_TYPE } from "@/lib/og";

export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;
export const alt = `${SITE.name} — daily AI edition`;
export const revalidate = 1800;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function prettyDate(date: string): string {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
}

export default async function Image({
  params,
}: {
  params: Promise<{ date: string }>;
}) {
  const { date } = await params;
  const valid = DATE_RE.test(date);
  const pretty = valid ? prettyDate(date) : "";

  let headline: string | null = null;
  let synopsis: string | null = null;
  if (valid) {
    try {
      const syn = await getEditionSynopsis(date);
      headline = syn?.headline ?? null;
      synopsis = syn?.synopsis ?? null;
    } catch {
      // Fall back to a generic, DB-free card.
    }
  }

  return renderOgImage({
    kicker: pretty || "Daily edition",
    title: headline ?? (pretty ? `AI news for ${pretty}` : "The daily AI briefing"),
    subtitle:
      synopsis ??
      "The day's curated AI briefing: startups, product launches, applied AI, funding, and breakthroughs.",
    footerRight: "Daily edition",
  });
}
