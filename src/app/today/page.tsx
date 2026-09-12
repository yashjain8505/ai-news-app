import type { Metadata } from "next";
import { getEditionItems, getEditionSynopsis, getAllEditionDates } from "@/lib/publicData";
import { SITE } from "@/lib/seo";
import type { Item, Section } from "@/lib/types";
import Today from "./Today";

// Phone-first control panel for the day: the Substack post ready to copy, and
// every story card ready to save or share into an app. Always the freshest
// edition. Internal tool, kept out of search.
export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Today",
  robots: { index: false, follow: false },
};

const PER = { daily: 5, funding: 3, articles: 3 } as const;
const WD = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
const MO = ["January","February","March","April","May","June","July","August","September","October","November","December"];
function prettyDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return `${WD[dt.getUTCDay()]}, ${MO[m - 1]} ${d}`;
}
function deDash(s: string): string {
  return s.replace(/(\d)\s*[–—]\s*(\d)/g, "$1-$2").replace(/\s*[–—]\s*/g, ", ").replace(/[ \t]+/g, " ").trim();
}
function clean(s: string | null): string {
  if (!s) return "";
  const t = deDash(s);
  return /[.!?…]$/.test(t) ? t : t + ".";
}

export default async function TodayPage({
  searchParams,
}: { searchParams: Promise<{ date?: string }> }) {
  const sp = await searchParams;
  const dates = await getAllEditionDates();
  const dateISO = sp.date && dates.includes(sp.date) ? sp.date : dates[0] ?? null;
  if (!dateISO) return <Today empty dateISO="" dateLabel="" title="" subtitle="" cover={null} replies={[]} body="" stories={[]} siteUrl={SITE.url} />;

  const [items, meta, replies] = await Promise.all([getEditionItems(dateISO), getEditionSynopsis(dateISO), getPendingReplies()]);
  const grouped: Record<Section, Item[]> = { daily: [], tools: [], articles: [], funding: [] };
  for (const it of items) grouped[it.section]?.push(it);

  const headlineOf = (it: Item) => deDash(it.plain_title || it.title);
  const lineOf = (it: Item) => clean(it.plain_line || it.summary);

  // The Substack post, mirroring the newsletter's running order.
  const blocks: string[] = [];
  const hero = grouped.daily[0];
  if (meta?.synopsis) blocks.push(clean(meta.synopsis));
  const section = (label: string, list: Item[]) => {
    if (!list.length) return;
    blocks.push(`\n${label}\n`);
    for (const it of list) blocks.push(`${headlineOf(it)}\n${lineOf(it)}`);
  };
  section("TOP STORIES", grouped.daily.slice(0, PER.daily));
  section("THE MONEY", grouped.funding.slice(0, PER.funding));
  section("WORTH READING", grouped.articles.slice(0, PER.articles));

  // Two or three REAL photos to drop into the article: the top stories'
  // own og:images, skipping agency stock (the user: the clipping cards are
  // "absurd" inside an article; a relevant photo is what he wants).
  const STOCK_RE = /gettyimages|shutterstock|istock|depositphotos|adobestock|dreamstime|alamy|stock-photo/i;
  const stories = [...grouped.daily, ...grouped.funding, ...grouped.articles]
    .filter((it) => it.image_url && !STOCK_RE.test(it.image_url))
    .slice(0, 3)
    .map((it) => ({
      slug: it.slug,
      headline: headlineOf(it),
      line: lineOf(it),
      card: `${SITE.url}/story/${it.slug}/photo`,
    }));

  // Substack title = the biggest story, stated as news (the thematic edition
  // headline read as vague). Subtitle = the next two stories plus a count, so
  // the post promises specific things. Cover = the hero's card, or its photo.
  const tops = grouped.daily.slice(0, 3);
  const title = hero ? headlineOf(hero) : deDash(meta?.headline || "The Wortins Daily");
  const others = tops.slice(1).map(headlineOf);
  const more = Math.max(0, items.filter((i) => i.section !== "tools").length - 1 - others.length);
  const subtitle = others.length
    ? `Plus ${others.join(". ")}. And ${more} more AI stories.`
    : `The AI news that matters, ${prettyDate(dateISO)}.`;
  const cover = hero
    ? { headline: headlineOf(hero), card: `${SITE.url}/story/${hero.slug}/card.png`, photo: hero.image_url || null }
    : null;

  return (
    <Today
      dateISO={dateISO}
      dateLabel={prettyDate(dateISO)}
      title={title}
      subtitle={subtitle}
      cover={cover}
      replies={replies}
      body={blocks.join("\n\n")}
      stories={stories}
      siteUrl={SITE.url}
    />
  );
}

// X replies the engine drafted and nobody has tapped Publish on yet. X's
// rules block API-published replies, so this list is the to-do.
async function getPendingReplies() {
  try {
    const { createClient } = await import("@supabase/supabase-js");
    const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
    const { data } = await sb
      .from("x_replies_ledger")
      .select("id, author, source, reply_text, draft_url, tweet_url, draft_id, created_at")
      .eq("status", "draft")
      .is("opened_at", null)
      .order("created_at", { ascending: false })
      .limit(12);
    // With a Typefully key on the worker the list is exact: anything already
    // published in Typefully drops off even if it was published elsewhere.
    const published = await publishedDraftIds();
    return (data ?? []).filter((r) => !published.has(String(r.draft_id))).map((r) => ({
      id: r.id as number, author: r.author as string, source: r.source as string,
      reply: (r.reply_text as string) ?? "", draftUrl: (r.draft_url as string) ?? "", tweetUrl: (r.tweet_url as string) ?? "",
    }));
  } catch {
    return [];
  }
}

async function publishedDraftIds(): Promise<Set<string>> {
  const key = process.env.TYPEFULLY_API_KEY;
  const set = process.env.TYPEFULLY_X_SET_ID || "331036";
  if (!key) return new Set();
  try {
    const res = await fetch(`https://api.typefully.com/v2/social-sets/${set}/drafts?status=published&limit=50`, {
      headers: { Authorization: `Bearer ${key}` }, cache: "no-store",
    });
    if (!res.ok) return new Set();
    const body = await res.json();
    const rows = Array.isArray(body) ? body : body?.results ?? [];
    return new Set(rows.map((d: { id: number }) => String(d.id)));
  } catch {
    return new Set();
  }
}
