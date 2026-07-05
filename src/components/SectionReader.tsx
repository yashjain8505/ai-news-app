import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SITE, SECTION_SEO, sectionPath, absoluteUrl } from "@/lib/seo";
import { getSectionItems, newestPublishedAt } from "@/lib/publicData";
import { Section } from "@/lib/types";
import PublicChrome from "@/components/PublicChrome";
import PublicEdition from "@/components/PublicEdition";
import JsonLd from "@/components/JsonLd";

// One section, rendered as a public (non-personalized, crawlable) reader at a
// clean URL like /daily-ai. Shared by every section route so metadata, JSON-LD
// and layout stay identical.

export function sectionMetadata(section: Section): Metadata {
  const meta = SECTION_SEO[section];
  const url = absoluteUrl(sectionPath(section));
  return {
    title: meta.title,
    description: meta.description,
    alternates: { canonical: url },
    openGraph: { title: meta.title, description: meta.description, url, type: "website", siteName: SITE.name },
    twitter: { card: "summary_large_image", title: meta.title, description: meta.description },
  };
}

// A slim, recurring prompt to sign in — the public reader "asks for it" without
// hiding any content (SEO-safe).
function PersonalizeBanner() {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 14, border: "1px solid var(--accent)", background: "var(--ph1)", padding: "12px 16px", margin: "0 0 26px" }}>
      <span className="serif" style={{ fontSize: 15, color: "var(--ink)" }}>
        You&#8217;re reading the public edition. Sign in to tune it to your taste.
      </span>
      <a href="/welcome" className="mono" style={{ fontSize: 12, letterSpacing: "0.06em", textTransform: "uppercase", padding: "9px 16px", background: "var(--accent)", color: "var(--onAccent)", textDecoration: "none", whiteSpace: "nowrap" }}>
        Personalize &#8599;
      </a>
    </div>
  );
}

export default async function SectionReader({ section }: { section: Section }) {
  const meta = SECTION_SEO[section];
  if (!meta) notFound();

  const items = await getSectionItems(section, 40);
  const now = Date.now();
  const url = absoluteUrl(sectionPath(section));

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: meta.title,
    description: meta.description,
    url,
    isPartOf: { "@type": "WebSite", name: SITE.name, url: SITE.url },
    dateModified: newestPublishedAt(items) ?? undefined,
    mainEntity: {
      "@type": "ItemList",
      numberOfItems: items.length,
      itemListElement: items.map((it, i) => ({
        "@type": "ListItem",
        position: i + 1,
        url: it.url ?? url,
        name: it.title,
      })),
    },
  };

  const breadcrumb = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: SITE.url },
      { "@type": "ListItem", position: 2, name: meta.label, item: url },
    ],
  };

  return (
    <>
      <JsonLd data={[jsonLd, breadcrumb]} />
      <PublicChrome subtitle={meta.label} active={section}>
        <PersonalizeBanner />
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
