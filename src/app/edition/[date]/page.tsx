import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SITE, absoluteUrl } from "@/lib/seo";
import {
  getEditionItems,
  getAllEditionDates,
  getEditionSynopsis,
  newestPublishedAt,
} from "@/lib/publicData";
import PublicChrome from "@/components/PublicChrome";
import PublicEdition from "@/components/PublicEdition";
import EditionLede from "@/components/EditionLede";
import JsonLd from "@/components/JsonLd";

export const revalidate = 1800; // 30 min ISR

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function generateStaticParams() {
  const dates = await getAllEditionDates();
  return dates.slice(0, 30).map((date) => ({ date }));
}

function prettyDate(date: string): string {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ date: string }>;
}): Promise<Metadata> {
  const { date } = await params;
  if (!DATE_RE.test(date)) return {};
  const pretty = prettyDate(date);
  const title = `AI news for ${pretty}`;
  const description = `${SITE.name}'s curated AI briefing for ${pretty}: emerging startups, real product launches, applied AI, notable funding, and genuine breakthroughs.`;
  const url = absoluteUrl(`/edition/${date}`);
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: { title, description, url, type: "article", siteName: SITE.name },
    twitter: { card: "summary_large_image", title, description },
  };
}

export default async function EditionPage({
  params,
}: {
  params: Promise<{ date: string }>;
}) {
  const { date } = await params;
  if (!DATE_RE.test(date)) notFound();
  const [items, syn] = await Promise.all([
    getEditionItems(date),
    getEditionSynopsis(date),
  ]);
  if (items.length === 0) notFound();

  const now = Date.now();
  const pretty = prettyDate(date);
  const modified = newestPublishedAt(items) ?? `${date}T12:00:00Z`;

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: syn?.headline ?? `AI news for ${pretty}`,
    description: syn?.synopsis ?? undefined,
    url: absoluteUrl(`/edition/${date}`),
    isPartOf: { "@type": "WebSite", name: SITE.name, url: SITE.url },
    datePublished: `${date}T12:00:00Z`,
    dateModified: modified,
    mainEntity: {
      "@type": "ItemList",
      numberOfItems: items.length,
      itemListElement: items.map((it, i) => ({
        "@type": "ListItem",
        position: i + 1,
        url: it.url ?? absoluteUrl(`/edition/${date}`),
        name: it.title,
      })),
    },
  };

  const breadcrumb = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: SITE.url },
      { "@type": "ListItem", position: 2, name: `AI news for ${pretty}`, item: absoluteUrl(`/edition/${date}`) },
    ],
  };

  return (
    <>
      <JsonLd data={[jsonLd, breadcrumb]} />
      <PublicChrome subtitle={`Edition — ${pretty}`}>
        <div className="mono" style={{ fontSize: 11, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--dim)", marginBottom: 10 }}>
          AI Briefing &middot; {pretty}
        </div>
        <h1 className="display" style={{ fontSize: "clamp(28px,4vw,42px)", lineHeight: 1.05, color: "var(--ink)", margin: "0 0 18px" }}>
          {syn?.headline ?? `AI news for ${pretty}`}
        </h1>
        <EditionLede synopsis={syn?.synopsis ?? null} />
        <PublicEdition items={items} now={now} />
      </PublicChrome>
    </>
  );
}
