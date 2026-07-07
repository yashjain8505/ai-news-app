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
  const description = `${SITE.name}'s AI briefing for ${pretty}: startups, product launches, applied AI, funding, and breakthroughs.`;
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
  const [items, syn, allDates] = await Promise.all([
    getEditionItems(date),
    getEditionSynopsis(date),
    getAllEditionDates(),
  ]);
  if (items.length === 0) notFound();

  const idx = allDates.indexOf(date);
  const newer = idx > 0 ? allDates[idx - 1] : null;
  const older = idx >= 0 && idx < allDates.length - 1 ? allDates[idx + 1] : null;

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

  // The synopsis ("Wortins' read") is original, citable editorial content —
  // mark it up as a NewsArticle so answer engines attribute it to Wortins.
  const ld: Record<string, unknown>[] = [jsonLd, breadcrumb];
  if (syn?.synopsis) {
    ld.unshift({
      "@context": "https://schema.org",
      "@type": "NewsArticle",
      headline: syn.headline ?? `AI news for ${pretty}`,
      description: syn.synopsis,
      articleBody: syn.synopsis,
      url: absoluteUrl(`/edition/${date}`),
      mainEntityOfPage: absoluteUrl(`/edition/${date}`),
      datePublished: `${date}T12:00:00Z`,
      dateModified: modified,
      image: [absoluteUrl(`/edition/${date}/opengraph-image`)],
      author: { "@type": "Organization", name: SITE.name, url: SITE.url },
      publisher: {
        "@type": "Organization",
        name: SITE.name,
        url: SITE.url,
        logo: { "@type": "ImageObject", url: `${SITE.url}/icon.svg` },
      },
    });
  }

  return (
    <>
      <JsonLd data={ld} />
      <PublicChrome subtitle={`Edition — ${pretty}`}>
        <div className="mono" style={{ fontSize: 11, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--dim)", marginBottom: 10 }}>
          AI Briefing &middot; {pretty}
        </div>
        <h1 className="display" style={{ fontSize: "clamp(28px,4vw,42px)", lineHeight: 1.05, color: "var(--ink)", margin: "0 0 18px" }}>
          {syn?.headline ?? `AI news for ${pretty}`}
        </h1>
        <EditionLede synopsis={syn?.synopsis ?? null} />
        <PublicEdition items={items} now={now} />
        <nav
          className="mono"
          style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginTop: 44, paddingTop: 18, borderTop: "1px solid var(--rule)", fontSize: 12, letterSpacing: "0.08em", textTransform: "uppercase" }}
        >
          {older ? (
            <a href={`/edition/${older}`} style={{ color: "var(--accent)", textDecoration: "none" }}>
              &larr; {prettyDate(older)}
            </a>
          ) : (
            <span />
          )}
          <a href="/editions" style={{ color: "var(--dim)", textDecoration: "none" }}>
            All editions
          </a>
          {newer ? (
            <a href={`/edition/${newer}`} style={{ color: "var(--accent)", textDecoration: "none" }}>
              {prettyDate(newer)} &rarr;
            </a>
          ) : (
            <span />
          )}
        </nav>
      </PublicChrome>
    </>
  );
}
