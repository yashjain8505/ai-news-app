import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/supabase-server";
import { supabase } from "@/lib/supabase";
import { Item, Section } from "@/lib/types";
import { scoreItem, type Weights } from "@/lib/taste";
import { timeAgo } from "@/lib/time";
import { SITE, SECTION_SEO, sectionPath, absoluteUrl } from "@/lib/seo";
import Feed from "@/components/Feed";
import OnboardingHero from "@/components/OnboardingHero";
import JsonLd from "@/components/JsonLd";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const FULL = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

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

  const [{ data: itemsData }, tasteRes] = await Promise.all([
    supabase.from("items").select("*").eq("is_active", true),
    user
      ? supabase.from("user_taste").select("weights, sources").eq("user_id", user.id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  // A signed-in visitor who hasn't calibrated yet goes to onboarding first.
  if (user && !tasteRes.data) redirect("/welcome");

  const weights = (tasteRes.data?.weights as Weights) ?? null;
  const sources = (tasteRes.data?.sources as string[]) ?? null;
  const nowMs = Date.now();
  const items = ((itemsData ?? []) as Item[])
    .map((it) => {
      const pub = Date.parse(it.published_at ?? "") || 0;
      const hoursAgo = pub ? (nowMs - pub) / 3_600_000 : 999;
      // Freshness boost so new stories surface near the top; taste only applies
      // when signed-in (logged-out is non-personalized = recency + editorial rank).
      const recency = 26 * Math.exp(-hoursAgo / 5);
      const taste = weights ? scoreItem(it.tags, weights, it.source, sources) : 0;
      return { it, s: taste + recency, pub };
    })
    .sort((a, b) => b.s - a.s || b.pub - a.pub)
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

  const newest = items.reduce<string | null>(
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

  return (
    <>
      <JsonLd data={jsonLd} />
      <OnboardingHero />
      {feed}
    </>
  );
}
