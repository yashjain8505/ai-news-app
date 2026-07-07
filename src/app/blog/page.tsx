import type { Metadata } from "next";
import { SITE, absoluteUrl } from "@/lib/seo";
import { getAllBlogPosts } from "@/lib/blog";
import PublicChrome from "@/components/PublicChrome";
import JsonLd from "@/components/JsonLd";

export const revalidate = 1800; // 30 min ISR

const BLOG_TITLE = "AI Funding Analysis & Startup Deep-Dives";
const BLOG_DESC =
  "Deep-dives on AI startup funding, valuations, and investors — how much each company raised, from whom, and why it matters. Written by the Wortins editorial team.";

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

export const metadata: Metadata = {
  title: `${BLOG_TITLE} · ${SITE.name} Blog`,
  description: BLOG_DESC,
  alternates: { canonical: absoluteUrl("/blog") },
  openGraph: {
    title: `${BLOG_TITLE} · ${SITE.name} Blog`,
    description: BLOG_DESC,
    url: absoluteUrl("/blog"),
    type: "website",
    siteName: SITE.name,
  },
  twitter: { card: "summary_large_image", title: BLOG_TITLE, description: BLOG_DESC },
};

export default function BlogIndex() {
  const posts = getAllBlogPosts();

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Blog",
    name: `${SITE.name} Blog`,
    description: BLOG_DESC,
    url: absoluteUrl("/blog"),
    isPartOf: { "@type": "WebSite", name: SITE.name, url: SITE.url },
    blogPost: posts.map((p) => ({
      "@type": "BlogPosting",
      headline: p.title,
      url: absoluteUrl(`/blog/${p.slug}`),
      datePublished: p.date || undefined,
      dateModified: p.updated || p.date || undefined,
    })),
  };

  const breadcrumb = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: SITE.url },
      { "@type": "ListItem", position: 2, name: "Blog", item: absoluteUrl("/blog") },
    ],
  };

  return (
    <>
      <JsonLd data={[jsonLd, breadcrumb]} />
      <PublicChrome subtitle="The Wortins Blog" active="blog">
        <h1
          className="display"
          style={{ fontSize: "clamp(28px,4vw,42px)", lineHeight: 1.05, color: "var(--ink)", margin: "0 0 10px" }}
        >
          {BLOG_TITLE}
        </h1>
        <p
          className="serif"
          style={{ fontSize: 17, fontStyle: "italic", color: "var(--muted)", margin: "0 0 32px", maxWidth: "62ch" }}
        >
          {BLOG_DESC}
        </p>

        {posts.length === 0 ? (
          <p className="serif" style={{ color: "var(--muted)" }}>No posts yet.</p>
        ) : (
          <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
            {posts.map((p, i) => (
              <li
                key={p.slug}
                style={{
                  padding: "20px 0",
                  borderBottom: i !== posts.length - 1 ? "1px solid var(--rule)" : "none",
                }}
              >
                <div
                  className="mono"
                  style={{ fontSize: 10, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--dim)", marginBottom: 8 }}
                >
                  {p.category ?? "AI"}
                  {p.date && (
                    <>
                      {" · "}
                      <time dateTime={p.date}>{prettyDate(p.date)}</time>
                    </>
                  )}
                  {" · "}
                  {p.readingTime} min read
                </div>
                <h2 className="display" style={{ fontSize: 22, lineHeight: 1.2, margin: "0 0 6px" }}>
                  <a href={`/blog/${p.slug}`} style={{ color: "var(--ink)", textDecoration: "none" }}>
                    {p.title}
                  </a>
                </h2>
                {p.description && (
                  <p className="serif" style={{ fontSize: 16, lineHeight: 1.55, color: "var(--muted)", margin: 0, maxWidth: "68ch" }}>
                    {p.description}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </PublicChrome>
    </>
  );
}
