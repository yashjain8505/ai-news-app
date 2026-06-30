import type { MetadataRoute } from "next";
import { absoluteUrl } from "@/lib/seo";
import { getAllEditionDates } from "@/lib/publicData";

// Cached for an hour so crawlers don't hit Supabase on every fetch.
export const revalidate = 3600;

const SECTIONS = ["daily", "funding", "tools", "articles"] as const;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const dates = await getAllEditionDates();
  const latest = dates[0] ? new Date(`${dates[0]}T12:00:00Z`) : new Date();

  return [
    {
      url: absoluteUrl("/"),
      lastModified: latest,
      changeFrequency: "hourly",
      priority: 1,
    },
    ...SECTIONS.map((s) => ({
      url: absoluteUrl(`/section/${s}`),
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
    ...dates.map((d) => ({
      url: absoluteUrl(`/edition/${d}`),
      lastModified: new Date(`${d}T12:00:00Z`),
      changeFrequency: "weekly" as const,
      priority: 0.6,
    })),
  ];
}
