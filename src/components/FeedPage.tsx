import type { Metadata } from "next";
import { cookies } from "next/headers";
import { unstable_cache } from "next/cache";
import { getSessionUser } from "@/lib/supabase-server";
import { supabase } from "@/lib/supabase";
import { Item, Section } from "@/lib/types";
import { scoreItem, type Weights } from "@/lib/taste";
import { timeAgo } from "@/lib/time";
import { SITE, SECTION_SEO, sectionPath, absoluteUrl } from "@/lib/seo";
import { SITE_FAQ, SECTION_FAQ, GLOSSARY } from "@/lib/faq";
import Feed from "@/components/Feed";
import JsonLd from "@/components/JsonLd";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const FULL = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

// The active-items list is identical for every visitor, so cache it in Next's
// Data Cache and refresh at most once a minute. This is the scalability lever:
// a traffic spike hits Postgres ~once per minute instead of once per request,
// so the DB (the real bottleneck) never saturates. Personalization stays live
// because the per-user taste row is fetched separately, uncached.
const getActiveItems = unstable_cache(
  async (): Promise<Item[]> => {
    const { data } = await supabase.from("items").select("*").eq("is_active", true);
    return (data ?? []) as Item[];
  },
  ["feed-active-items"],
  { revalidate: 60, tags: ["items"] }
);

// Per-section page metadata, shared by every section route so canonical/title agree.
export function sectionMetadata(section: Section): Metadata {
  const meta = SECTION_SEO[section];
  const url = absoluteUrl(sectionPath(section));
  return {
    title: meta.title,
    description: meta.description,
    alternates: { canonical: url },
    openGraph: { title: meta.title, description: meta.description, url, type: "website", siteName: SITE.name },
    twitter: { card: "summary_large_image", title: meta.title, description: meta.description },
  };
}

// ONE feed, section-routed, for BOTH signed-in (personalized) and logged-out
// (non-personalized) visitors — identical newspaper layout either way. This is
// what makes the public pages look like the signed-in feed instead of a plain
// scroll, and gives every section its own URL.
export default async function FeedPage({ section }: { section: Section }) {
  const user = await getSessionUser();
  const jar = await cookies();
  const initialMode = jar.get("sig_theme")?.value === "dark" ? "dark" : "light";

  const [itemsData, tasteRes] = await Promise.all([
    getActiveItems(),
    user
      ? supabase.from("user_taste").select("weights, sources, tech_pref, dislikes").eq("user_id", user.id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  // A signed-in visitor who hasn't personalized yet is NOT forced into onboarding.
  // They read the news like everyone else; personalizing starts only when they
  // click "Personalize". `personalized` (not just signed-in) drives the masthead.
  const personalized = !!tasteRes.data;

  const weights = (tasteRes.data?.weights as Weights) ?? null;
  const sources = (tasteRes.data?.sources as string[]) ?? null;
  const techPref = (tasteRes.data?.tech_pref as number | null) ?? null;
  const dislikes = (tasteRes.data?.dislikes as string[]) ?? [];
  const nowMs = Date.now();
  const items = itemsData
    .map((it) => {
      const pub = Date.parse(it.published_at ?? "") || 0;
      const hoursAgo = pub ? (nowMs - pub) / 3_600_000 : 999;
      // Freshness boost so newer stories surface near the top within a day; taste
      // only applies when signed-in (logged-out is non-personalized).
      const recency = 26 * Math.exp(-hoursAgo / 5);
      const taste = weights ? scoreItem(it.tags, weights, it.source, sources) : 0;
      // Down-rank stories more technical than the reader asked for; a story
      // simpler than their chosen level is never penalized.
      const techPenalty = techPref ? Math.max(0, (it.tech_level ?? 2) - techPref) * 40 : 0;
      // Muted topics sink below everything else, so in practice they drop out of
      // the feed, but aren't hard-removed, so a section never goes empty.
      const muted = dislikes.length > 0 && (it.tags ?? []).some((t) => dislikes.includes(t));
      return { it, muted, ed: it.edition_date ?? "", s: taste + recency - techPenalty, pub };
    })
    // The LATEST edition always ranks first (so an older story never sits above a
    // newer one), taste orders within a day, newest-first breaks ties, and muted
    // topics fall to the very bottom.
    .sort((a, b) =>
      (a.muted === b.muted ? 0 : a.muted ? 1 : -1) ||   // muted topics last
      (a.ed < b.ed ? 1 : a.ed > b.ed ? -1 : 0) ||        // latest edition first
      b.pub - a.pub ||                                    // newest first (recency wins)
      b.s - a.s                                           // taste breaks ties within a drop
    )
    .map((x) => x.it);

  const now = Date.now();
  const today = new Date(now);
  const todayIdx = (today.getDay() + 6) % 7;
  const days = LABELS.map((label, i) => {
    const dd = new Date(now);
    dd.setDate(today.getDate() + (i - todayIdx));
    const iso = `${dd.getFullYear()}-${String(dd.getMonth() + 1).padStart(2, "0")}-${String(dd.getDate()).padStart(2, "0")}`;
    return {
      label,
      date: iso,
      big: `${MONTHS[dd.getMonth()]} ${dd.getDate()}`,
      full: `${FULL[i]}, ${MONTHS[dd.getMonth()]} ${dd.getDate()}, ${dd.getFullYear()}`,
    };
  });

  // Freshness reflects the SECTION being viewed, not the global newest item
  // (otherwise a just-added tool would make the Daily page claim "updated now").
  const newest = items
    .filter((it) => it.section === section)
    .reduce<string | null>(
      (m, it) => (it.published_at && (!m || it.published_at > m) ? it.published_at : m),
      null
    );
  const updatedAgo = timeAgo(newest, now);
  const meta = (user?.user_metadata ?? {}) as Record<string, unknown>;
  const name = user
    ? (meta.full_name as string) || (meta.name as string) || user.email?.split("@")[0] || null
    : null;

  const feed = (
    <Feed
      items={items}
      days={days}
      todayIdx={todayIdx}
      now={now}
      name={name}
      updatedAgo={updatedAgo}
      stampDate=""
      editionNo={0}
      initialMode={initialMode}
      signedIn={!!user}
      personalized={personalized}
      initialActive={section}
    />
  );

  if (user) return feed;

  // Logged-out: same feed, plus a first-visit personalize modal + SEO JSON-LD.
  const sMeta = SECTION_SEO[section];
  const url = section === "daily" ? SITE.url : absoluteUrl(sectionPath(section));
  const sectionItems = items.filter((it) => it.section === section);
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: sMeta.title,
    description: sMeta.description,
    url,
    isPartOf: { "@type": "WebSite", name: SITE.name, url: SITE.url },
    dateModified: newest ?? undefined,
    mainEntity: {
      "@type": "ItemList",
      numberOfItems: sectionItems.length,
      itemListElement: sectionItems.slice(0, 30).map((it, i) => ({
        "@type": "ListItem",
        position: i + 1,
        url: it.url ?? url,
        name: it.title,
      })),
    },
  };

  // Answerability: give answer engines question→answer pairs to quote directly.
  // Home (the daily view) uses the general FAQ; each section uses its own.
  const faq = section === "daily" ? SITE_FAQ : SECTION_FAQ[section] ?? SITE_FAQ;
  const faqLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faq.map((f) => ({
      "@type": "Question",
      name: f.q,
      acceptedAnswer: { "@type": "Answer", text: f.a },
    })),
  };
  // Answer-first definitions, marked up as DefinedTerms.
  const glossaryLd = {
    "@context": "https://schema.org",
    "@type": "DefinedTermSet",
    name: `${SITE.name} AI glossary`,
    url: absoluteUrl("/about"),
    hasDefinedTerm: GLOSSARY.map((t) => ({
      "@type": "DefinedTerm",
      name: t.term,
      description: t.definition,
      inDefinedTermSet: absoluteUrl("/about"),
    })),
  };

  // No auto-popup: logged-out visitors just read the news. Personalizing starts
  // only when they click "Sign in" in the masthead.
  return (
    <>
      <JsonLd data={[jsonLd, faqLd, glossaryLd]} />
      {feed}
    </>
  );
}
