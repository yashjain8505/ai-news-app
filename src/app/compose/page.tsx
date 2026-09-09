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

// Mirrors the newsletter's phone-first tiers: one hero story that gets room to
// breathe, then scannable one-liners. Top stories lead; funding is condensed
// into "The money" because funding news is naturally list-shaped. Tools are
// deliberately left out of both channels; they still live on the site.
const TIERS = { also: 4, money: 3, reads: 3 };
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

  // Plain-English rewrite when the simplify pass produced one, else the
  // curator's text. A funding one-liner has to name the company itself, and
  // curator summaries often don't, so that one falls back to the title.
  const headlineOf = (it: Item) => deDash(it.plain_title || it.title);
  const lineOf = (it: Item) => clean(it.plain_line || it.summary);
  const moneyLineOf = (it: Item) =>
    it.plain_line ? clean(it.plain_line) : deDash(it.title);
  const href = (it: Item) => `${SITE.url}/story/${it.slug}`;

  const hero = grouped.daily[0] ?? null;
  const also = grouped.daily.slice(1, 1 + TIERS.also);
  const money = grouped.funding.slice(0, TIERS.money);
  const reads = grouped.articles.slice(0, TIERS.reads);

  const asStory = (it: Item) => ({ title: headlineOf(it), desc: lineOf(it), href: href(it) });

  const sections = [
    { title: "Today's big story", stories: hero ? [asStory(hero)] : [] },
    { title: "Also today", stories: also.map(asStory) },
    {
      title: "The money",
      flat: true,
      stories: money.map((it) => ({ title: moneyLineOf(it), desc: "", href: href(it) })),
    },
    { title: "Worth reading", stories: reads.map(asStory) },
  ].filter((s) => s.stories.length > 0);

  const editionUrl = `${SITE.url}/edition/${dateISO}`;
  const title = deDash(meta?.headline || `The Wortins Daily · ${prettyDate(dateISO)}`);
  const hook = clean(meta?.synopsis ?? null, 240);

  const noteHeads = [hero, ...also].filter(Boolean).slice(0, DAILY_IN_NOTE) as Item[];
  const noteText = [
    `🗞️ ${deDash(meta?.headline || "The Wortins Daily")}`,
    "",
    "The AI stories that matter today:",
    ...noteHeads.map((it) => `• ${headlineOf(it)}`),
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
