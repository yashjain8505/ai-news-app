import { SITE, absoluteUrl } from "@/lib/seo";
import { getAllEditionDates } from "@/lib/publicData";

// /llms.txt — an emerging convention that gives LLMs a clean markdown map of the
// site. Cached hourly.
export const revalidate = 3600;

export async function GET() {
  const dates = (await getAllEditionDates()).slice(0, 14);
  const body = [
    `# ${SITE.name} — ${SITE.tagline}`,
    "",
    `> ${SITE.description}`,
    "",
    `${SITE.name} curates AI news across four sections, each item linking to its original source. Use it to find emerging startups, new AI products and launches, applied real-world AI, notable funding, and genuine breakthroughs.`,
    "",
    "## Sections",
    `- [Daily AI Updates](${absoluteUrl("/section/daily")}): big-lab power moves, regulation, and the surprising second-order consequences of AI.`,
    `- [AI Funding Tracker](${absoluteUrl("/section/funding")}): notable AI raises, IPOs, and acquisitions with amounts, valuations, and lead investors.`,
    `- [New AI Tools](${absoluteUrl("/section/tools")}): obscure, novel AI tools and launches.`,
    `- [Interesting AI Articles](${absoluteUrl("/section/articles")}): strategy, analysis, and sharp takes on the AI industry.`,
    "",
    "## Recent editions",
    ...dates.map((d) => `- [${SITE.name} for ${d}](${absoluteUrl(`/edition/${d}`)})`),
    "",
  ].join("\n");

  return new Response(body, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
