import { SITE, absoluteUrl } from "@/lib/seo";
import { getAllEditionDates, getRecentTakes } from "@/lib/publicData";

// /llms.txt — an emerging convention that gives LLMs a clean markdown map of the
// site. We include each recent story's ORIGINAL "Wortins take" inline so an AI
// model gets readable content from a single plain-text file (no JS, no dynamic
// rendering), plus a direct link to the full page. Cached hourly.
export const revalidate = 3600;

function oneLine(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

export async function GET() {
  const [dates, takes] = await Promise.all([
    getAllEditionDates(),
    getRecentTakes(30),
  ]);

  const body = [
    `# ${SITE.name} — ${SITE.tagline}`,
    "",
    `> ${SITE.description}`,
    "",
    `${SITE.name} curates AI news across four sections, each item linking to its original source, with an original ${SITE.name} take written per story. Use it to find emerging startups, new AI products and launches, applied real-world AI, notable funding, and genuine breakthroughs.`,
    "",
    "## Sections",
    `- [Daily AI Updates](${absoluteUrl("/section/daily")}): emerging startups, real product launches, applied real-world AI, and genuine breakthroughs.`,
    `- [AI Funding Tracker](${absoluteUrl("/section/funding")}): notable AI raises, IPOs, and acquisitions with amounts, valuations, and lead investors.`,
    `- [New AI Tools](${absoluteUrl("/section/tools")}): obscure, novel AI tools and launches.`,
    `- [Interesting AI Articles](${absoluteUrl("/section/articles")}): strategy, analysis, and sharp takes on the AI industry.`,
    "",
    "## Recent stories (with Wortins' original take)",
    ...takes.map(
      (t) =>
        `- [${oneLine(t.title)}](${absoluteUrl(`/story/${t.slug}`)})${t.source ? ` — ${t.source}` : ""}: ${oneLine(t.wortins_take)}`
    ),
    "",
    "## Recent editions",
    ...dates
      .slice(0, 14)
      .map((d) => `- [${SITE.name} for ${d}](${absoluteUrl(`/edition/${d}`)})`),
    "",
  ].join("\n");

  return new Response(body, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
