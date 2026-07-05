import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SITE, SECTION_SEO, absoluteUrl } from "@/lib/seo";
import { getStoryBySlug, getRelatedStories } from "@/lib/publicData";
import { timeAgo } from "@/lib/time";
import PublicChrome from "@/components/PublicChrome";
import JsonLd from "@/components/JsonLd";
import ShareButton from "@/components/ShareButton";

export const revalidate = 1800; // 30 min ISR

function hasTake(take: string | null | undefined): take is string {
  return typeof take === "string" && take.trim().length > 0;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const item = await getStoryBySlug(slug);
  if (!item) return {};

  const take = item.wortins_take;
  const indexable = hasTake(take);
  const description = (indexable ? take : item.summary) ?? SITE.description;
  const url = absoluteUrl(`/story/${slug}`);

  return {
    title: item.title,
    description,
    alternates: { canonical: url },
    // SEO moat: only pages that carry our original editorial take are worth
    // indexing. Without a take a story page is thin/duplicative — keep it out
    // of the index (but let crawlers follow its links).
    robots: indexable
      ? { index: true, follow: true }
      : { index: false, follow: true },
    openGraph: {
      title: item.title,
      description,
      url,
      type: "article",
      siteName: SITE.name,
    },
    twitter: {
      card: "summary_large_image",
      title: item.title,
      description,
    },
  };
}

export default async function StoryPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const item = await getStoryBySlug(slug);
  if (!item) notFound();

  const related = await getRelatedStories(item, 6);

  const take = item.wortins_take;
  const indexable = hasTake(take);
  const now = Date.now();
  const ago = timeAgo(item.published_at, now);
  const sectionLabel = SECTION_SEO[item.section]?.label ?? item.section;
  const sectionUrl = absoluteUrl(`/section/${item.section}`);
  const url = absoluteUrl(`/story/${slug}`);
  const published = item.published_at ?? item.created_at;
  const description = (indexable ? take : item.summary) ?? SITE.description;
  const image = item.image_url ?? absoluteUrl(`/story/${slug}/opengraph-image`);

  const newsArticle: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "NewsArticle",
    headline: item.title,
    description,
    url,
    mainEntityOfPage: url,
    datePublished: published,
    dateModified: item.published_at ?? item.created_at,
    image: [image],
    author: {
      "@type": "Organization",
      name: SITE.name,
      url: SITE.url,
      logo: { "@type": "ImageObject", url: `${SITE.url}/icon.svg` },
    },
    publisher: {
      "@type": "Organization",
      name: SITE.name,
      url: SITE.url,
      logo: { "@type": "ImageObject", url: `${SITE.url}/icon.svg` },
    },
  };
  // Only attach articleBody when we have original editorial text — never the
  // source article's body (copyright).
  if (indexable) newsArticle.articleBody = take;

  const breadcrumb = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: SITE.url },
      { "@type": "ListItem", position: 2, name: sectionLabel, item: sectionUrl },
      { "@type": "ListItem", position: 3, name: item.title, item: url },
    ],
  };

  return (
    <>
      <JsonLd data={[newsArticle, breadcrumb]} />
      <PublicChrome subtitle={sectionLabel}>
        {/* Kicker: source · time-ago (mirrors PublicEdition's Meta) */}
        <div
          className="mono"
          style={{ fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--dim)", marginBottom: 10 }}
        >
          {item.source}
          {item.published_at && ago && (
            <>
              {" · "}
              <time dateTime={item.published_at}>{ago}</time>
            </>
          )}
        </div>

        <h1
          className="display"
          style={{ fontSize: "clamp(28px,4vw,42px)", lineHeight: 1.05, color: "var(--ink)", margin: "0 0 18px" }}
        >
          {item.title}
        </h1>

        {/* Our original editorial take — the "Wortins' read" treatment. */}
        {indexable ? (
          <div style={{ borderLeft: "3px solid var(--accent)", padding: "4px 0 4px 20px", margin: "8px 0 28px" }}>
            <div className="mono" style={{ fontSize: 10, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--accent)", marginBottom: 10 }}>
              Wortins&#8217; read
            </div>
            <p className="serif" style={{ fontSize: 20, lineHeight: 1.55, color: "var(--ink)", margin: 0, whiteSpace: "pre-line" }}>
              {take}
            </p>
          </div>
        ) : (
          item.summary && (
            <p className="serif" style={{ fontSize: 19, lineHeight: 1.55, color: "var(--muted)", margin: "0 0 28px", maxWidth: "64ch" }}>
              {item.summary}
            </p>
          )
        )}

        {/* Attribution + prominent outbound link. We link out to the source —
            we never republish its article text. */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center", margin: "0 0 8px" }}>
          {item.url && (
            <a
              href={item.url}
              target="_blank"
              rel="noopener noreferrer"
              className="mono"
              style={{ display: "inline-block", fontSize: 13, letterSpacing: "0.04em", textTransform: "uppercase", padding: "12px 18px", background: "var(--accent)", color: "var(--onAccent)", textDecoration: "none" }}
            >
              Read the full story at {item.source ?? "the source"} &rarr;
            </a>
          )}
          <ShareButton url={url} title={item.title} />
        </div>
        {item.source && (
          <div className="mono" style={{ fontSize: 11, color: "var(--dim)", marginTop: 12 }}>
            Source: {item.source}
            {item.author ? ` · ${item.author}` : ""}
          </div>
        )}

        {/* Related stories — internal links into the story crawl graph. */}
        {related.length > 0 && (
          <section style={{ marginTop: 48, paddingTop: 18, borderTop: "3px solid var(--ruleStrong)" }}>
            <h2 className="display" style={{ fontSize: 22, color: "var(--ink)", margin: "0 0 16px" }}>
              Related stories
            </h2>
            <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
              {related.map((r, i) => {
                const rAgo = timeAgo(r.published_at, now);
                const notLast = i !== related.length - 1;
                return (
                  <li key={r.id} style={{ padding: "14px 0", borderBottom: notLast ? "1px solid var(--rule)" : "none" }}>
                    <div className="mono" style={{ fontSize: 10, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--dim)" }}>
                      {r.source}
                      {r.published_at && rAgo && (
                        <>
                          {" · "}
                          <time dateTime={r.published_at}>{rAgo}</time>
                        </>
                      )}
                    </div>
                    <h3 className="display" style={{ fontSize: 18, lineHeight: 1.2, margin: "5px 0 0", color: "var(--ink)" }}>
                      <a href={`/story/${r.slug}`} style={{ color: "inherit", textDecoration: "none" }}>
                        {r.title}
                      </a>
                    </h3>
                  </li>
                );
              })}
            </ul>
          </section>
        )}
      </PublicChrome>
    </>
  );
}
