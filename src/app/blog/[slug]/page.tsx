import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SITE, absoluteUrl } from "@/lib/seo";
import { getBlogPostBySlug, getBlogSlugs, getRelatedBlogPosts } from "@/lib/blog";
import PublicChrome from "@/components/PublicChrome";
import JsonLd from "@/components/JsonLd";
import BlogContent from "@/components/BlogContent";
import SocialShare from "@/components/SocialShare";

export const revalidate = 1800; // 30 min ISR
export const dynamicParams = false; // only our authored slugs exist

export function generateStaticParams() {
  return getBlogSlugs().map((slug) => ({ slug }));
}

function prettyDate(d: string): string {
  if (!d) return "";
  const iso = d.length === 10 ? `${d}T12:00:00Z` : d;
  return new Date(iso).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
}

function isoDate(d: string): string {
  if (!d) return d;
  return d.length === 10 ? `${d}T12:00:00Z` : d;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const post = getBlogPostBySlug(slug);
  if (!post) return {};
  const url = absoluteUrl(`/blog/${slug}`);
  const description = post.description || SITE.description;
  return {
    title: `${post.title} · ${SITE.name}`,
    description,
    alternates: { canonical: url },
    robots: { index: true, follow: true },
    openGraph: {
      title: post.title,
      description,
      url,
      type: "article",
      siteName: SITE.name,
      publishedTime: post.date ? isoDate(post.date) : undefined,
      modifiedTime: post.updated ? isoDate(post.updated) : undefined,
      ...(post.hero ? { images: [{ url: post.hero }] } : {}),
    },
    twitter: { card: "summary_large_image", title: post.title, description },
  };
}

export default async function BlogPostPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const post = getBlogPostBySlug(slug);
  if (!post) notFound();

  const related = getRelatedBlogPosts(post, 4);
  const url = absoluteUrl(`/blog/${slug}`);
  const published = isoDate(post.date);
  const modified = isoDate(post.updated || post.date);
  const description = post.description || SITE.description;
  const image = post.hero ?? absoluteUrl("/opengraph-image");

  const blogPosting: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: post.title,
    description,
    url,
    mainEntityOfPage: url,
    datePublished: published || undefined,
    dateModified: modified || undefined,
    image: [image],
    keywords: post.tags.join(", ") || undefined,
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

  const breadcrumb = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: SITE.url },
      { "@type": "ListItem", position: 2, name: "Blog", item: absoluteUrl("/blog") },
      { "@type": "ListItem", position: 3, name: post.title, item: url },
    ],
  };

  const schemas: Record<string, unknown>[] = [blogPosting, breadcrumb];
  if (post.faq.length > 0) {
    schemas.push({
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: post.faq.map((f) => ({
        "@type": "Question",
        name: f.q,
        acceptedAnswer: { "@type": "Answer", text: f.a },
      })),
    });
  }

  return (
    <>
      <JsonLd data={schemas} />
      <PublicChrome subtitle="The Wortins Blog" active="blog">
        <div
          className="mono"
          style={{ fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--dim)", marginBottom: 10 }}
        >
          <a href="/blog" style={{ color: "var(--dim)", textDecoration: "none" }}>Blog</a>
          {" · "}
          {post.readingTime} min read
        </div>

        <h1
          className="display"
          style={{ fontSize: "clamp(28px,4vw,42px)", lineHeight: 1.05, color: "var(--ink)", margin: "0 0 14px" }}
        >
          {post.title}
        </h1>

        {post.description && (
          <p
            className="serif"
            style={{ fontSize: 20, lineHeight: 1.55, color: "var(--muted)", margin: "0 0 24px", maxWidth: "66ch" }}
          >
            {post.description}
          </p>
        )}

        <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center", margin: "0 0 28px" }}>
          <SocialShare url={url} title={post.title} showGeneric />
        </div>

        <article style={{ borderTop: "1px solid var(--rule)", paddingTop: 28 }}>
          <BlogContent markdown={post.body} />
        </article>

        {/* FAQ — rendered on-page to match the FAQPage schema */}
        {post.faq.length > 0 && (
          <section style={{ marginTop: 40, paddingTop: 20, borderTop: "3px solid var(--ruleStrong)" }}>
            <h2 className="display" style={{ fontSize: 24, color: "var(--ink)", margin: "0 0 18px" }}>
              Frequently asked questions
            </h2>
            {post.faq.map((f, i) => (
              <div key={i} style={{ margin: "0 0 20px" }}>
                <h3 className="display" style={{ fontSize: 18, color: "var(--ink)", margin: "0 0 6px" }}>
                  {f.q}
                </h3>
                <p className="serif" style={{ fontSize: 17, lineHeight: 1.6, color: "var(--muted)", margin: 0, maxWidth: "68ch" }}>
                  {f.a}
                </p>
              </div>
            ))}
          </section>
        )}

        {/* E-E-A-T byline */}
        <div
          className="mono"
          style={{ fontSize: 11, letterSpacing: "0.03em", color: "var(--dim)", marginTop: 28, paddingTop: 14, borderTop: "1px solid var(--rule)" }}
        >
          Written by{" "}
          <a href="/about" style={{ color: "var(--accent)", textDecoration: "none" }}>Wortins</a>
          {post.date && (
            <>
              {" · Published "}
              <time dateTime={published}>{prettyDate(post.date)}</time>
            </>
          )}
          {post.updated && post.updated !== post.date && (
            <>
              {" · Updated "}
              <time dateTime={modified}>{prettyDate(post.updated)}</time>
            </>
          )}
          {" · "}
          <a href="/funding" style={{ color: "var(--dim)", textDecoration: "underline" }}>
            See the AI Funding Tracker
          </a>
        </div>

        {/* Related posts — internal links into the blog cluster */}
        {related.length > 0 && (
          <section style={{ marginTop: 48, paddingTop: 18, borderTop: "3px solid var(--ruleStrong)" }}>
            <h2 className="display" style={{ fontSize: 22, color: "var(--ink)", margin: "0 0 16px" }}>
              Related reading
            </h2>
            <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
              {related.map((r, i) => (
                <li key={r.slug} style={{ padding: "12px 0", borderBottom: i !== related.length - 1 ? "1px solid var(--rule)" : "none" }}>
                  <h3 className="display" style={{ fontSize: 18, lineHeight: 1.2, margin: 0 }}>
                    <a href={`/blog/${r.slug}`} style={{ color: "var(--ink)", textDecoration: "none" }}>
                      {r.title}
                    </a>
                  </h3>
                  {r.description && (
                    <p className="serif" style={{ fontSize: 15, lineHeight: 1.5, color: "var(--muted)", margin: "4px 0 0", maxWidth: "68ch" }}>
                      {r.description}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}
      </PublicChrome>
    </>
  );
}
