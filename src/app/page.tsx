import type { Metadata } from "next";
import { cookies } from "next/headers";
import { supabase } from "@/lib/supabase";
import { Item } from "@/lib/types";
import { scoreItem, type Weights } from "@/lib/taste";
import { timeAgo } from "@/lib/time";
import { SITE, absoluteUrl } from "@/lib/seo";
import { getLatestEditionDate, getEditionItems, getEditionSynopsis } from "@/lib/publicData";
import Feed from "@/components/Feed";
import PublicChrome from "@/components/PublicChrome";
import PublicEdition from "@/components/PublicEdition";
import EditionLede from "@/components/EditionLede";
import JsonLd from "@/components/JsonLd";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: { absolute: `${SITE.name} — ${SITE.tagline}` },
  description: SITE.description,
  alternates: { canonical: absoluteUrl("/") },
  openGraph: {
    title: `${SITE.name} — ${SITE.tagline}`,
    description: SITE.description,
    url: absoluteUrl("/"),
    type: "website",
    siteName: SITE.name,
  },
  twitter: {
    card: "summary_large_image",
    title: `${SITE.name} — ${SITE.tagline}`,
    description: SITE.description,
  },
};

// Logged-out visitors and crawlers get the latest public edition (indexable),
// not a redirect to onboarding.
async function PublicHome() {
  const date = await getLatestEditionDate();
  const [items, syn] = await Promise.all([
    date ? getEditionItems(date) : Promise.resolve([]),
    date ? getEditionSynopsis(date) : Promise.resolve(null),
  ]);
  const now = Date.now();
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: `${SITE.name} — ${SITE.tagline}`,
    url: SITE.url,
    isPartOf: { "@type": "WebSite", name: SITE.name, url: SITE.url },
    dateModified: items.find((i) => i.published_at)?.published_at ?? undefined,
    mainEntity: {
      "@type": "ItemList",
      numberOfItems: items.length,
      itemListElement: items.map((it, i) => ({
        "@type": "ListItem",
        position: i + 1,
        url: it.url ?? SITE.url,
        name: it.title,
      })),
    },
  };
  return (
    <>
      <JsonLd data={jsonLd} />
      <PublicChrome subtitle="Today&#8217;s AI briefing">
        <div style={{ border: "1px solid var(--accent)", background: "var(--ph1)", padding: "12px 16px", margin: "0 0 28px", display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
          <span className="serif" style={{ fontSize: 15, color: "var(--ink)" }}>
            You&#8217;re reading the public edition. Answer 6 quick questions and we&#8217;ll tune it to your taste.
          </span>
          <a href="/welcome" className="mono" style={{ fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase", padding: "9px 16px", background: "var(--accent)", color: "var(--onAccent)", textDecoration: "none", whiteSpace: "nowrap" }}>
            Personalize &rarr;
          </a>
        </div>
        <h1 className="display" style={{ fontSize: "clamp(28px,4vw,42px)", lineHeight: 1.05, color: "var(--ink)", margin: "0 0 14px" }}>
          {syn?.headline ?? "Today in AI"}
        </h1>
        {syn?.synopsis && <EditionLede synopsis={syn.synopsis} />}
        <PublicEdition items={items} now={now} limit={5} />
        <div style={{ marginTop: 8, borderTop: "3px double var(--ruleStrong)", paddingTop: 26, textAlign: "center" }}>
          <p className="serif" style={{ fontSize: 18, color: "var(--ink)", margin: "0 0 14px" }}>
            Like what you see? Get an edition tuned to what you actually care about.
          </p>
          <a href="/welcome" className="mono" style={{ fontSize: 12, letterSpacing: "0.08em", textTransform: "uppercase", padding: "12px 24px", background: "var(--accent)", color: "var(--onAccent)", textDecoration: "none", display: "inline-block" }}>
            Personalize your edition &rarr;
          </a>
        </div>
      </PublicChrome>
    </>
  );
}

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const MON3 = [
  "JAN", "FEB", "MAR", "APR", "MAY", "JUN",
  "JUL", "AUG", "SEP", "OCT", "NOV", "DEC",
];
const FULL = [
  "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday",
];
const LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export default async function Home() {
  const jar = await cookies();
  const uid = jar.get("sig_uid")?.value;
  if (!uid) return <PublicHome />;
  const name = jar.get("sig_name")?.value ?? null;
  const initialMode = jar.get("sig_theme")?.value === "dark" ? "dark" : "light";

  const [{ data: itemsData }, { data: tasteData }] = await Promise.all([
    supabase.from("items").select("*").eq("is_active", true),
    supabase
      .from("user_taste")
      .select("weights, sources")
      .eq("user_id", uid)
      .maybeSingle(),
  ]);

  const weights = (tasteData?.weights as Weights) ?? null;
  const sources = (tasteData?.sources as string[]) ?? null;
  const items = ((itemsData ?? []) as Item[])
    .map((it) => ({ it, s: scoreItem(it.tags, weights, it.source, sources) }))
    .sort(
      (a, b) =>
        b.s - a.s ||
        (Date.parse(b.it.published_at ?? "") || 0) -
          (Date.parse(a.it.published_at ?? "") || 0)
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

  const newest = items.reduce<string | null>(
    (m, it) => (it.published_at && (!m || it.published_at > m) ? it.published_at : m),
    null
  );
  const updatedAgo = timeAgo(newest, now);
  const stampDate = `${MON3[today.getMonth()]} ${today.getDate()} ·${String(today.getFullYear()).slice(2)}`;
  const editionNo = Math.max(
    1,
    Math.floor((now - Date.parse("2025-05-12T00:00:00Z")) / 86400000)
  );

  return (
    <Feed
      items={items}
      days={days}
      todayIdx={todayIdx}
      now={now}
      name={name}
      updatedAgo={updatedAgo}
      stampDate={stampDate}
      editionNo={editionNo}
      initialMode={initialMode}
    />
  );
}
