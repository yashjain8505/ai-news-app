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

// Substack-native section labels (deliberately different from the email's, so
// the two channels don't read as carbon copies). Kept short: a daily digest.
const SECTION_META: { key: Section; title: string }[] = [
  { key: "daily", title: "Top Stories" },
  { key: "tools", title: "New Tools" },
  { key: "articles", title: "Interesting Articles" },
  { key: "funding", title: "Funding News" },
];
// Same counts as the email — tight and skimmable, not a firehose.
const PER_SECTION: Record<Section, number> = { daily: 5, tools: 3, articles: 3, funding: 3 };
const DAILY_IN_NOTE = 5;

const WD = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
const MO = ["January","February","March","April","May","June","July","August","September","October","November","December"];
function prettyDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return `${WD[dt.getUTCDay()]}, ${MO[m - 1]} ${d}, ${y}`;
}

// The curator writes a lot of em/en dashes; strip them for the Substack post.
// Numeric ranges become hyphens; every other dash becomes a comma.
function deDash(s: string): string {
  return s
    .replace(/(\d)\s*[–—]\s*(\d)/g, "$1-$2")
    .replace(/\s*[–—]\s*/g, ", ")
    .replace(/\s*,\s*,/g, ",")
    .replace(/^\s*,\s*/, "")
    .replace(/\s+/g, " ")
    .trim();
}

// Keep whole sentences (never a mid-word "…"): always the first sentence, plus
// more while under the budget, so each story reads as a concise 2-3 line blurb.
function clean(s: string | null, budget = 320): string {
  if (!s) return "";
  const t = deDash(s).replace(/\s+/g, " ").trim();
  const sentences = t.match(/[^.!?]+[.!?]+(?:\s|$)/g);
  if (!sentences) return /[.!?…]$/.test(t) ? t : t + ".";
  let out = sentences[0].trim();
  for (let i = 1; i < sentences.length; i++) {
    const next = `${out} ${sentences[i].trim()}`;
    if (next.length > budget) break;
    out = next;
  }
  return out;
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
    return <Composer empty dates={[]} dateISO="" title="" hook="" sections={[]} noteText="" editionUrl="" siteUrl={SITE.url} />;
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
      title: deDash(it.title),
      desc: clean(it.summary),
      href: `${SITE.url}/story/${it.slug}`,
    })),
  })).filter((s) => s.stories.length > 0);

  const editionUrl = `${SITE.url}/edition/${dateISO}`;
  const title = deDash(meta?.headline || `The Wortins Daily · ${prettyDate(dateISO)}`);
  const hook = clean(meta?.synopsis ?? null, 240);

  const daily = grouped.daily.slice(0, DAILY_IN_NOTE);
  const noteText = [
    `🗞️ ${deDash(meta?.headline || "The Wortins Daily")}`,
    "",
    "The AI stories that matter today:",
    ...daily.map((it) => `• ${deDash(it.title)}`),
    "",
    "Full briefing + our take on each:",
    editionUrl,
  ].join("\n");

  return (
    <Composer
      dates={dates}
      dateISO={dateISO}
      title={title}
      hook={hook}
      sections={sections}
      noteText={noteText}
      editionUrl={editionUrl}
      siteUrl={SITE.url}
    />
  );
}
