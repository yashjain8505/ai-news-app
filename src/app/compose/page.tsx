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
  { key: "articles", title: "Worth Reading" },
  { key: "funding", title: "The Money" },
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

// Trim to a clean, short line: prefer the first sentence, hard-cap the length.
function short(s: string | null, max: number): string {
  if (!s) return "";
  let t = deDash(s);
  const m = t.match(/^(.*?[.!?])(\s|$)/);
  if (m && m[1].length <= max) return m[1];
  if (t.length > max) {
    const cut = t.slice(0, max);
    const at = cut.lastIndexOf(" ");
    t = cut.slice(0, at > 40 ? at : max).replace(/[,;:.\s]+$/, "") + "…";
  }
  return t;
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
      source: it.source,
      desc: short(it.summary, 100),
      href: `${SITE.url}/story/${it.slug}`,
    })),
  })).filter((s) => s.stories.length > 0);

  const editionUrl = `${SITE.url}/edition/${dateISO}`;
  const title = deDash(meta?.headline || `The Wortins Daily · ${prettyDate(dateISO)}`);
  const hook = short(meta?.synopsis ?? null, 180);

  const daily = grouped.daily.slice(0, DAILY_IN_NOTE);
  const noteText = [
    `🗞️ ${deDash(meta?.headline || "The Wortins Daily")}`,
    "",
    "The AI stories that matter today:",
    ...daily.map((it) => `• ${deDash(it.title)}${it.source ? ` (${it.source})` : ""}`),
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
