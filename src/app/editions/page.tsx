import type { Metadata } from "next";
import { SITE, absoluteUrl } from "@/lib/seo";
import { getAllEditionDates, getEditionHeadlines } from "@/lib/publicData";
import PublicChrome from "@/components/PublicChrome";
import JsonLd from "@/components/JsonLd";

export const revalidate = 1800; // 30 min ISR

const TITLE = "All editions — the Wortins AI briefing archive";
const DESCRIPTION =
  "Browse the full archive of Wortins daily AI briefings — each a curated snapshot of AI startups, products, funding, and breakthroughs.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: absoluteUrl("/editions") },
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    url: absoluteUrl("/editions"),
    type: "website",
    siteName: SITE.name,
  },
  twitter: { card: "summary_large_image", title: TITLE, description: DESCRIPTION },
};

function prettyDate(date: string): string {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
}

export default async function EditionsArchive() {
  const [dates, headlines] = await Promise.all([
    getAllEditionDates(),
    getEditionHeadlines(),
  ]);

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: TITLE,
    description: DESCRIPTION,
    url: absoluteUrl("/editions"),
    isPartOf: { "@type": "WebSite", name: SITE.name, url: SITE.url },
    mainEntity: {
      "@type": "ItemList",
      numberOfItems: dates.length,
      itemListElement: dates.map((d, i) => ({
        "@type": "ListItem",
        position: i + 1,
        url: absoluteUrl(`/edition/${d}`),
        name: headlines.get(d) ?? `AI news for ${prettyDate(d)}`,
      })),
    },
  };

  const breadcrumb = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: SITE.url },
      { "@type": "ListItem", position: 2, name: "Editions", item: absoluteUrl("/editions") },
    ],
  };

  return (
    <>
      <JsonLd data={[jsonLd, breadcrumb]} />
      <PublicChrome subtitle="Edition archive">
        <h1
          className="display"
          style={{ fontSize: "clamp(28px,4vw,42px)", lineHeight: 1.05, color: "var(--ink)", margin: "0 0 10px" }}
        >
          The archive
        </h1>
        <p
          className="serif"
          style={{ fontSize: 17, fontStyle: "italic", color: "var(--muted)", margin: "0 0 28px", maxWidth: "60ch" }}
        >
          Every edition of the {SITE.name} briefing, newest first &mdash; {dates.length} in all.
        </p>
        <p className="serif" style={{ fontSize: 16, lineHeight: 1.6, color: "var(--muted)", margin: "0 0 30px", maxWidth: "66ch" }}>
          Each edition is a dated snapshot of the day in AI: the emerging startups, real product
          launches, applied real-world AI, notable funding, and genuine breakthroughs we found most
          interesting, each with an original {SITE.name} take. Browse the archive to see how the
          story of AI has developed, day by day.
        </p>
        <ol style={{ listStyle: "none", padding: 0, margin: 0 }}>
          {dates.map((d) => (
            <li key={d} style={{ borderBottom: "1px solid var(--rule)" }}>
              <a
                href={`/edition/${d}`}
                style={{ textDecoration: "none", display: "block", padding: "16px 0" }}
              >
                <div
                  className="mono"
                  style={{ fontSize: 11, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--dim)", marginBottom: 5 }}
                >
                  {prettyDate(d)}
                </div>
                <div
                  className="display"
                  style={{ fontSize: 21, lineHeight: 1.2, color: "var(--ink)" }}
                >
                  {headlines.get(d) ?? `AI news for ${prettyDate(d)}`}
                </div>
              </a>
            </li>
          ))}
        </ol>
      </PublicChrome>
    </>
  );
}
