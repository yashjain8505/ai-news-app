// Central SEO/GEO config. Override the canonical origin with NEXT_PUBLIC_SITE_URL
// once a custom domain is connected (a real domain ranks far better than *.vercel.app).
export const SITE = {
  name: "Wotins",
  tagline: "The daily AI briefing",
  description:
    "Wotins is a daily AI briefing refreshed through the day: emerging startups, real product launches, applied AI, and genuine breakthroughs across the AI world.",
  url: (process.env.NEXT_PUBLIC_SITE_URL ?? "https://wotins.com").replace(/\/+$/, ""),
  locale: "en_US",
  twitter: "@wotins",
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
    title: "Daily AI News — big-lab power moves and consequences",
    description:
      "The day's most readable AI news: lab power plays, regulation, insider stories, and the surprising second-order consequences of AI.",
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
