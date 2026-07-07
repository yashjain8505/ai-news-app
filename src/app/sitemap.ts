import type { MetadataRoute } from "next";
import { SITE, absoluteUrl, sectionPath } from "@/lib/seo";
import { getAllEditionDates, getIndexableStorySlugs } from "@/lib/publicData";
import { getAllBlogPosts } from "@/lib/blog";

// Cached for an hour so crawlers don't hit Supabase on every fetch.
export const revalidate = 3600;

const SECTIONS = ["daily", "funding", "tools", "articles"] as const;

// The .md twin URL for a page (home -> /index.md), so AI crawlers can discover
// the Markdown twins straight from the sitemap (an AEO-conformance signal).
function twinUrl(url: string): string {
  return url === SITE.url ? `${SITE.url}/index.md` : `${url}.md`;
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [dates, stories] = await Promise.all([
    getAllEditionDates(),
    getIndexableStorySlugs(),
  ]);
  const blogPosts = getAllBlogPosts();
  const latest = dates[0] ? new Date(`${dates[0]}T12:00:00Z`) : new Date();

  const pages: MetadataRoute.Sitemap = [
    {
      url: absoluteUrl("/"),
      lastModified: latest,
      changeFrequency: "hourly",
      priority: 1,
    },
    ...SECTIONS.map((s) => ({
      url: absoluteUrl(sectionPath(s)),
      lastModified: latest,
      changeFrequency: "daily" as const,
      priority: 0.8,
    })),
    {
      url: absoluteUrl("/editions"),
      lastModified: latest,
      changeFrequency: "daily" as const,
      priority: 0.7,
    },
    {
      url: absoluteUrl("/about"),
      lastModified: latest,
      changeFrequency: "monthly" as const,
      priority: 0.5,
    },
    {
      url: absoluteUrl("/contact"),
      lastModified: latest,
      changeFrequency: "yearly" as const,
      priority: 0.3,
    },
    // The latest edition accumulates drops through the day; older ones are
    // effectively immutable once the day closes.
    ...dates.map((d, i) => ({
      url: absoluteUrl(`/edition/${d}`),
      lastModified: new Date(`${d}T12:00:00Z`),
      changeFrequency: i === 0 ? ("daily" as const) : ("monthly" as const),
      priority: i === 0 ? 0.7 : 0.5,
    })),
    // Per-story pages — ONLY those carrying an original take (indexable).
    // Empty until the orchestrator backfills wortins_take.
    ...stories.map((s) => ({
      url: absoluteUrl(`/story/${s.slug}`),
      lastModified: new Date(s.published_at ?? s.created_at),
      changeFrequency: "weekly" as const,
      priority: 0.6,
    })),
    // Blog: original evergreen posts (funding deep-dives, explainers). All
    // indexable (first-party content), so priority sits above thin story pages.
    ...(blogPosts.length
      ? [
          {
            url: absoluteUrl("/blog"),
            lastModified: latest,
            changeFrequency: "daily" as const,
            priority: 0.8,
          },
        ]
      : []),
    ...blogPosts.map((p) => ({
      url: absoluteUrl(`/blog/${p.slug}`),
      lastModified: new Date(`${(p.updated || p.date || "").slice(0, 10) || "2026-01-01"}T12:00:00Z`),
      changeFrequency: "monthly" as const,
      priority: 0.7,
    })),
  ];

  // Advertise each page's Markdown twin so AI crawlers can find them. Twins are
  // served noindex; they're here purely as an AEO discovery signal.
  const twins: MetadataRoute.Sitemap = pages.map((p) => ({
    url: twinUrl(p.url),
    lastModified: p.lastModified,
    changeFrequency: p.changeFrequency,
    priority: 0.3,
  }));

  return [...pages, ...twins];
}
