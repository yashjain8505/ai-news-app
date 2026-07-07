import type { Metadata } from "next";
import {
  getEditionItems,
  getEditionSynopsis,
  getAllEditionDates,
} from "@/lib/publicData";
import { SITE } from "@/lib/seo";
import type { Item, Section } from "@/lib/types";
import Composer from "./Composer";

// Always reflect the freshest edition; also reads ?date= for older editions.
export const dynamic = "force-dynamic";

// Internal tool — keep it out of search and off the sitemap.
export const metadata: Metadata = {
  title: "Substack composer",
  robots: { index: false, follow: false },
};

const SECTION_META: { key: Section; title: string }[] = [
  { key: "daily", title: "Daily AI Updates" },
  { key: "tools", title: "New Tools" },
  { key: "articles", title: "Interesting Articles" },
  { key: "funding", title: "Funding" },
];
const PER_SECTION: Record<Section, number> = { daily: 8, tools: 5, articles: 5, funding: 5 };
const DAILY_IN_NOTE = 5;

const WD = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
const MO = ["January","February","March","April","May","June","July","August","September","October","November","December"];
function prettyDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return `${WD[dt.getUTCDay()]}, ${MO[m - 1]} ${d}, ${y}`;
}

export default async function ComposePage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const sp = await searchParams;
  const dates = await getAllEditionDates();
  const dateISO = sp.date && dates.includes(sp.date) ? sp.date : dates[0] ?? null;

  if (!dateISO) {
    return <Composer empty dates={[]} dateISO="" title="" synopsis={null} sections={[]} noteText="" editionUrl="" siteUrl={SITE.url} />;
  }

  const [items, meta] = await Promise.all([
    getEditionItems(dateISO),
    getEditionSynopsis(dateISO),
  ]);

  const grouped: Record<Section, Item[]> = { daily: [], tools: [], articles: [], funding: [] };
  for (const it of items) grouped[it.section]?.push(it);

  const sections = SECTION_META.map((s) => ({
    title: s.title,
    stories: grouped[s.key].slice(0, PER_SECTION[s.key]).map((it) => ({
      title: it.title,
      source: it.source,
      summary: it.summary,
      take: it.wortins_take,
      href: `${SITE.url}/story/${it.slug}`,
    })),
  })).filter((s) => s.stories.length > 0);

  const editionUrl = `${SITE.url}/edition/${dateISO}`;
  const title = meta?.headline || `The Wortins Daily · ${prettyDate(dateISO)}`;

  const daily = grouped.daily.slice(0, DAILY_IN_NOTE);
  const noteText = [
    `🗞️ ${meta?.headline || "The Wortins Daily"}`,
    "",
    "The AI stories that matter today:",
    ...daily.map((it) => `• ${it.title}${it.source ? ` (${it.source})` : ""}`),
    "",
    "Full briefing + our take on each:",
    editionUrl,
  ].join("\n");

  return (
    <Composer
      dates={dates}
      dateISO={dateISO}
      title={title}
      synopsis={meta?.synopsis ?? null}
      sections={sections}
      noteText={noteText}
      editionUrl={editionUrl}
      siteUrl={SITE.url}
    />
  );
}
