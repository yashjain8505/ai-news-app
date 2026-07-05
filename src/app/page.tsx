import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/supabase-server";
import { supabase } from "@/lib/supabase";
import { Item } from "@/lib/types";
import { scoreItem, type Weights } from "@/lib/taste";
import { timeAgo } from "@/lib/time";
import { SITE, absoluteUrl } from "@/lib/seo";
import { getLatestEditionDate, getEditionItems, getEditionSynopsis } from "@/lib/publicData";
import Feed from "@/components/Feed";
import PublicChrome from "@/components/PublicChrome";
import PublicEdition from "@/components/PublicEdition";
import OnboardingHero from "@/components/OnboardingHero";
import EditionLede from "@/components/EditionLede";
import JsonLd from "@/components/JsonLd";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: { absolute: `${SITE.name} — ${SITE.tagline}, tuned to your taste` },
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
  // Home shows only the Daily section (not all four stacked into one long
  // scroll); the nav + links below lead to the other sections.
  const dailyItems = items.filter((it) => it.section === "daily");
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: `${SITE.name} — ${SITE.tagline}`,
    url: SITE.url,
    isPartOf: { "@type": "WebSite", name: SITE.name, url: SITE.url },
    dateModified: dailyItems.find((i) => i.published_at)?.published_at ?? undefined,
    mainEntity: {
      "@type": "ItemList",
      numberOfItems: dailyItems.length,
      itemListElement: dailyItems.map((it, i) => ({
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
      <OnboardingHero />
      <PublicChrome subtitle="Today&#8217;s AI briefing" active="daily">
        {/* Prominent personalize hero — the conversion-forward top of the page. */}
        <section style={{ border: "1px solid var(--ruleStrong)", background: "var(--ph1)", padding: "clamp(24px,4vw,40px)", margin: "0 0 40px" }}>
          <div className="mono" style={{ fontSize: 10, letterSpacing: "0.22em", textTransform: "uppercase", color: "var(--accent)", marginBottom: 14 }}>
            Your edition, your way
          </div>
          <h1 className="display" style={{ fontSize: "clamp(30px,5.2vw,50px)", lineHeight: 1.03, color: "var(--ink)", margin: 0, maxWidth: "18ch" }}>
            AI news, tuned to what you actually care about.
          </h1>
          <p className="serif" style={{ fontSize: 18, lineHeight: 1.5, color: "var(--muted)", margin: "16px 0 26px", maxWidth: "56ch" }}>
            Skip the firehose. Tell us your taste in six quick questions and we&#8217;ll build a daily edition around the labs, tools and stories you follow.
          </p>
          <a href="/welcome" className="mono" style={{ display: "inline-block", fontSize: 13, letterSpacing: "0.08em", textTransform: "uppercase", padding: "15px 28px", background: "var(--accent)", color: "var(--onAccent)", textDecoration: "none" }}>
            Answer 6 quick questions &rarr; your edition
          </a>
        </section>

        {/* Full day's edition — always server-rendered for crawlers and scroll-readers. */}
        <h2 className="display" style={{ fontSize: "clamp(26px,4vw,40px)", lineHeight: 1.05, color: "var(--ink)", margin: "0 0 14px" }}>
          {syn?.headline ?? "Today in AI"}
        </h2>
        {syn?.synopsis && <EditionLede synopsis={syn.synopsis} />}
        <PublicEdition items={dailyItems} now={now} />
        <nav style={{ display: "flex", flexWrap: "wrap", gap: 18, marginTop: 10, paddingTop: 20, borderTop: "1px solid var(--rule)" }}>
          <span className="mono" style={{ fontSize: 11, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--dim)" }}>More sections:</span>
          <a href="/new-tools" className="mono" style={{ fontSize: 12, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--accent)", textDecoration: "none" }}>New Tools &rarr;</a>
          <a href="/funding" className="mono" style={{ fontSize: 12, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--accent)", textDecoration: "none" }}>Funding &rarr;</a>
          <a href="/articles" className="mono" style={{ fontSize: 12, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--accent)", textDecoration: "none" }}>Articles &rarr;</a>
        </nav>
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
  const user = await getSessionUser();
  if (!user) return <PublicHome />;
  const uid = user.id;
  const jar = await cookies();
  const initialMode = jar.get("sig_theme")?.value === "dark" ? "dark" : "light";

  const [{ data: itemsData }, { data: tasteData }] = await Promise.all([
    supabase.from("items").select("*").eq("is_active", true),
    supabase
      .from("user_taste")
      .select("weights, sources")
      .eq("user_id", uid)
      .maybeSingle(),
  ]);

  // Signed in but no taste profile yet → send to calibration.
  if (!tasteData) redirect("/welcome");

  const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
  const name =
    (meta.full_name as string) ||
    (meta.name as string) ||
    user.email?.split("@")[0] ||
    null;

  const weights = (tasteData?.weights as Weights) ?? null;
  const sources = (tasteData?.sources as string[]) ?? null;
  const nowMs = Date.now();
  const items = ((itemsData ?? []) as Item[])
    .map((it) => {
      const pub = Date.parse(it.published_at ?? "") || 0;
      const hoursAgo = pub ? (nowMs - pub) / 3_600_000 : 999;
      // Freshness boost so genuinely new stories surface near the top without
      // abandoning taste (peaks ~+26 for brand-new, ~half at 3.5h, fades by ~12h).
      const recency = 26 * Math.exp(-hoursAgo / 5);
      return {
        it,
        s: scoreItem(it.tags, weights, it.source, sources) + recency,
        pub,
      };
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
