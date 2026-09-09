import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SITE, SECTION_SEO, absoluteUrl } from "@/lib/seo";
import { getStoryBySlug, getRelatedStories, getIndexableStorySlugs } from "@/lib/publicData";
import { timeAgo } from "@/lib/time";
import PublicChrome from "@/components/PublicChrome";
import JsonLd from "@/components/JsonLd";
import BackLink from "@/components/BackLink";
import ReadGate from "@/components/ReadGate";
import SocialShare from "@/components/SocialShare";

// 30 min ISR. Kept as a literal because Next must statically analyse this
// export, but it MUST equal STORY_REVALIDATE in lib/supabase.ts — the
// story-page reads use a client whose fetch cache is set to that value, and
// if the two drift the page quietly stops being prerendered again.
export const revalidate = 1800;

// Prerender the recent indexable stories (those carrying an original take) so
// they're ISR-cached HTML at build; any other slug is generated on demand and
// then cached for `revalidate` (dynamicParams defaults to true). This is what
// moves story pages off no-store SSR onto ISR.
export async function generateStaticParams() {
  const slugs = await getIndexableStorySlugs(100);
  return slugs.map((s) => ({ slug: s.slug }));
}

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
  // Keep meta/OG description SHORT (the take is now multi-paragraph): prefer the
  // one-line dek, else trim the take. The full take renders in the page body.
  const description =
    item.summary?.trim() ||
    (indexable ? `${take.replace(/\s+/g, " ").slice(0, 197).trimEnd()}…` : "") ||
    SITE.description;
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
  const publishedPretty = published
    ? new Date(published).toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
        timeZone: "UTC",
      })
    : null;
  const description =
    item.summary?.trim() ||
    (indexable ? `${take.replace(/\s+/g, " ").slice(0, 197).trimEnd()}…` : "") ||
    SITE.description;
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
        <BackLink />
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

        {/* Our original multi-paragraph summary — read this first, then decide
            whether to click through to the source. */}
        {indexable ? (
          <ReadGate>
          <div style={{ margin: "10px 0 34px" }}>
            <div className="mono" style={{ fontSize: 11, letterSpacing: "0.16em", textTransform: "uppercase", color: "var(--accent)", marginBottom: 14, paddingBottom: 8, borderBottom: "1px solid var(--rule)", maxWidth: "62ch" }}>
              The story
            </div>
            {take
              .split(/\n{2,}/)
              .map((p) => p.trim())
              .filter(Boolean)
              .map((para, i) => (
                <p key={i} className="serif" style={{ fontSize: 20, lineHeight: 1.8, color: "var(--ink)", margin: i === 0 ? 0 : "22px 0 0", maxWidth: "62ch", whiteSpace: "pre-line" }}>
                  {para}
                </p>
              ))}
          </div>
          </ReadGate>
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
              className="mono bs-tap"
              style={{ display: "inline-block", fontSize: 13, letterSpacing: "0.04em", textTransform: "uppercase", padding: "12px 18px", background: "var(--accent)", color: "var(--onAccent)", textDecoration: "none" }}
            >
              Read the full story at {item.source ?? "the source"} &rarr;
            </a>
          )}
          <SocialShare url={url} title={item.title} itemId={item.id} showGeneric />
        </div>
        {item.source && (
          <div className="mono" style={{ fontSize: 11, color: "var(--dim)", marginTop: 12 }}>
            Source: {item.source}
            {item.author ? ` · ${item.author}` : ""}
          </div>
        )}

        {/* E-E-A-T byline: who curated this, when, and a link to how we work. */}
        <div className="mono" style={{ fontSize: 11, letterSpacing: "0.03em", color: "var(--dim)", marginTop: 16, paddingTop: 14, borderTop: "1px solid var(--rule)" }}>
          Curated by{" "}
          <a href="/about" className="bs-ilink" style={{ color: "var(--accent)", textDecoration: "none" }}>
            Wortins
          </a>
          {publishedPretty && (
            <>
              {" · Updated "}
              <time dateTime={item.published_at ?? item.created_at}>{publishedPretty}</time>
            </>
          )}
          {" · "}
          <a href="/about" className="bs-ilink" style={{ color: "var(--dim)", textDecoration: "underline" }}>
            How we curate
          </a>
        </div>

        {/* Related coverage — internal links into the story crawl graph, each
            with a direct link out to the original source (citation depth). */}
        {related.length > 0 && (
          <section style={{ marginTop: 48, paddingTop: 18, borderTop: "3px solid var(--ruleStrong)" }}>
            <h2 className="display" style={{ fontSize: 22, color: "var(--ink)", margin: "0 0 16px" }}>
              Related coverage
            </h2>
            <div className="bs-squares">
              {related.map((r) => {
                const rAgo = timeAgo(r.published_at, now);
                return (
                  <div key={r.id} className="bs-square bs-tap">
                    <div className="bs-square__top mono">
                      <span className="bs-square__kicker">{r.source ?? "Wortins"}</span>
                      {rAgo && <span className="bs-square__meta mono">{rAgo}</span>}
                    </div>
                    <a href={`/story/${r.slug}`} className="bs-hl bs-square__link">
                      <h3 className="display bs-square__title">{r.title}</h3>
                    </a>
                    <div className="bs-square__foot">
                      {r.url ? (
                        <a href={r.url} target="_blank" rel="noopener noreferrer" className="mono bs-ilink" style={{ fontSize: 10, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--accent)", textDecoration: "none" }}>
                          Read at {r.source ?? "source"} &#8599;
                        </a>
                      ) : (
                        <span />
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}
      </PublicChrome>
    </>
  );
}
