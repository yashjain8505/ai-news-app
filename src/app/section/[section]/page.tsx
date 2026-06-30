import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SITE, SECTION_SEO, absoluteUrl } from "@/lib/seo";
import { getSectionItems, newestPublishedAt } from "@/lib/publicData";
import { Section } from "@/lib/types";
import PublicChrome from "@/components/PublicChrome";
import PublicEdition from "@/components/PublicEdition";
import JsonLd from "@/components/JsonLd";

export const revalidate = 1800; // 30 min ISR
export const dynamicParams = false;

const SECTIONS: Section[] = ["daily", "tools", "articles", "funding"];

export function generateStaticParams() {
  return SECTIONS.map((section) => ({ section }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ section: string }>;
}): Promise<Metadata> {
  const { section } = await params;
  const meta = SECTION_SEO[section];
  if (!meta) return {};
  const url = absoluteUrl(`/section/${section}`);
  return {
    title: meta.title,
    description: meta.description,
    alternates: { canonical: url },
    openGraph: { title: meta.title, description: meta.description, url, type: "website", siteName: SITE.name },
    twitter: { card: "summary_large_image", title: meta.title, description: meta.description },
  };
}

export default async function SectionPage({
  params,
}: {
  params: Promise<{ section: string }>;
}) {
  const { section } = await params;
  const meta = SECTION_SEO[section];
  if (!meta || !SECTIONS.includes(section as Section)) notFound();

  const items = await getSectionItems(section as Section, 40);
  const now = Date.now();

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: meta.title,
    description: meta.description,
    url: absoluteUrl(`/section/${section}`),
    isPartOf: { "@type": "WebSite", name: SITE.name, url: SITE.url },
    dateModified: newestPublishedAt(items) ?? undefined,
    mainEntity: {
      "@type": "ItemList",
      numberOfItems: items.length,
      itemListElement: items.map((it, i) => ({
        "@type": "ListItem",
        position: i + 1,
        url: it.url ?? absoluteUrl(`/section/${section}`),
        name: it.title,
      })),
    },
  };

  const breadcrumb = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: SITE.url },
      { "@type": "ListItem", position: 2, name: meta.label, item: absoluteUrl(`/section/${section}`) },
    ],
  };

  return (
    <>
      <JsonLd data={[jsonLd, breadcrumb]} />
      <PublicChrome subtitle={meta.label}>
        <h1 className="display" style={{ fontSize: "clamp(28px,4vw,42px)", lineHeight: 1.05, color: "var(--ink)", margin: "0 0 10px" }}>
          {meta.label}
        </h1>
        <p className="serif" style={{ fontSize: 17, fontStyle: "italic", color: "var(--muted)", margin: "0 0 28px", maxWidth: "60ch" }}>
          {meta.description}
        </p>
        <PublicEdition items={items} now={now} showSectionHeaders={false} />
      </PublicChrome>
    </>
  );
}
