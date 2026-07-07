// Central SEO/GEO config. Override the canonical origin with NEXT_PUBLIC_SITE_URL
// once a custom domain is connected (a real domain ranks far better than *.vercel.app).
export const SITE = {
  name: "Wortins",
  tagline: "The daily AI briefing",
  description:
    "Wortins is a daily AI briefing refreshed through the day: emerging startups, real product launches, applied AI, and genuine breakthroughs across the AI world.",
  url: (process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.wortins.com").replace(/\/+$/, ""),
  locale: "en_US",
  twitter: "@wortins",
  email: "hello@wortins.com",
};

// Off-domain profiles that are the SAME entity as Wortins. Used for schema.org
// `sameAs`, which ties the on-page Organization to its social identity so search
// and answer engines can reconcile the brand across the web. Add each verified
// official profile here (LinkedIn company page, YouTube, GitHub, etc.).
export const SAME_AS: string[] = [
  "https://x.com/wortins",
];

export function absoluteUrl(path = "/"): string {
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${SITE.url}${p === "/" ? "" : p}`;
}

export const SECTION_SEO: Record<
  string,
  { label: string; title: string; description: string }
> = {
  daily: {
    label: "Daily AI Updates",
    title: "Daily AI News — startups & breakthroughs",
    description:
      "The day's most interesting AI news beyond the giants: emerging startups, real product launches, applied real-world AI, and genuine breakthroughs.",
  },
  funding: {
    label: "AI Funding Tracker",
    title: "AI Funding Tracker — raises, IPOs & M&A",
    description:
      "A running tracker of notable AI funding: the biggest raises, IPOs, and acquisitions, with amounts, valuations, and lead investors.",
  },
  tools: {
    label: "New AI Tools",
    title: "New AI Tools — hidden gems, fresh launches",
    description:
      "Hidden-gem AI tools: trending repos, Show HN launches, and indie projects before anyone else is talking about them.",
  },
  articles: {
    label: "Interesting AI Articles",
    title: "Interesting AI Articles — strategy & sharp takes",
    description:
      "The most interesting essays on the AI industry: competitive dynamics, strategic parallels, and insider analysis worth reading.",
  },
};

// Clean, SEO-friendly URL slug per section (e.g. /daily-ai instead of
// /section/daily). Kept in one place so nav, routes, sitemap and redirects agree.
export const SECTION_SLUG: Record<string, string> = {
  daily: "daily-ai",
  tools: "new-tools",
  articles: "articles",
  funding: "funding",
};

export const SLUG_SECTION: Record<string, string> = {
  "daily-ai": "daily",
  "new-tools": "tools",
  articles: "articles",
  funding: "funding",
};

export function sectionPath(section: string): string {
  return `/${SECTION_SLUG[section] ?? section}`;
}
