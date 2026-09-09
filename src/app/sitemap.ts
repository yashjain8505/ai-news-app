import type { MetadataRoute } from "next";
import { absoluteUrl, sectionPath } from "@/lib/seo";
import { getAllEditionDates, getIndexableStorySlugs } from "@/lib/publicData";
import { getAllBlogPosts } from "@/lib/blog";

// Cached for an hour so crawlers don't hit Supabase on every fetch.
export const revalidate = 3600;

const SECTIONS = ["daily", "funding", "tools", "articles"] as const;

// A sitemap is a crawl-priority hint, not an index of everything that exists.
// Stories and editions are dated news: after a month they earn nothing in
// search, but listing all of them (thousands of URLs) buried the evergreen blog
// and Google stopped crawling new posts at all. Older pages stay live and
// internally linked; they just stop being advertised here.
const STORY_SITEMAP_DAYS = 30;
const EDITION_SITEMAP_DAYS = 30;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [dates, stories] = await Promise.all([
    getAllEditionDates(),
    getIndexableStorySlugs(5000, STORY_SITEMAP_DAYS),
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
    ...dates.slice(0, EDITION_SITEMAP_DAYS).map((d, i) => ({
      url: absoluteUrl(`/edition/${d}`),
      lastModified: new Date(`${d}T12:00:00Z`),
      changeFrequency: i === 0 ? ("daily" as const) : ("monthly" as const),
      priority: i === 0 ? 0.7 : 0.5,
    })),
    // Per-story pages — ONLY those carrying an original take (indexable), and
    // only the recent window (see STORY_SITEMAP_DAYS). A story never changes
    // after it is published.
    ...stories.map((s) => ({
      url: absoluteUrl(`/story/${s.slug}`),
      lastModified: new Date(s.published_at ?? s.created_at),
      changeFrequency: "never" as const,
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

  // The Markdown twins (`<url>.md`) are deliberately NOT listed: they are served
  // `noindex` with a canonical Link header, and submitting noindexed URLs in a
  // sitemap is a contradiction that doubled the crawl load for nothing. AI
  // agents discover twins through content negotiation and llms.txt instead.
  return pages;
}
