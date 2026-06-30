import { SECTION_SEO } from "@/lib/seo";
import { renderOgImage, OG_SIZE, OG_CONTENT_TYPE } from "@/lib/og";

export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;
export const alt = "Wortins — AI news section";

export default async function Image({
  params,
}: {
  params: Promise<{ section: string }>;
}) {
  const { section } = await params;
  const meta = SECTION_SEO[section];
  return renderOgImage({
    kicker: "Section",
    title: meta?.label ?? "AI news",
    subtitle: meta?.description ?? null,
  });
}
