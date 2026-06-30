// Central SEO/GEO config. Override the canonical origin with NEXT_PUBLIC_SITE_URL
// once a custom domain is connected (a real domain ranks far better than *.vercel.app).
export const SITE = {
  name: "Wortins",
  tagline: "The daily AI briefing",
  description:
    "Wortins is a daily AI briefing refreshed through the day: emerging startups, real product launches, applied AI, and genuine breakthroughs across the AI world.",
  url: (process.env.NEXT_PUBLIC_SITE_URL ?? "https://wortins.com").replace(/\/+$/, ""),
  locale: "en_US",
  twitter: "@wortins",
};

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
    title: "Daily AI News — startups, products, applied AI and breakthroughs",
    description:
      "The day's most interesting AI news beyond the giants: emerging startups, real product launches, applied real-world AI, and genuine breakthroughs.",
  },
  funding: {
    label: "AI Funding Tracker",
    title: "AI Funding Tracker — notable raises, IPOs and acquisitions",
    description:
      "A running tracker of notable AI funding: the biggest raises, IPOs, and acquisitions, with amounts, valuations, and lead investors.",
  },
  tools: {
    label: "New AI Tools",
    title: "New AI Tools — obscure, novel launches before they break out",
    description:
      "Hidden-gem AI tools: trending repos, Show HN launches, and indie projects before anyone else is talking about them.",
  },
  articles: {
    label: "Interesting AI Articles",
    title: "Interesting AI Articles — strategy, analysis and sharp takes",
    description:
      "The most interesting essays on the AI industry: competitive dynamics, strategic parallels, and insider analysis worth reading.",
  },
};
