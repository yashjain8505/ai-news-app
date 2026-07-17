"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Item, Section } from "@/lib/types";
import { recordFeedClick, recordRating } from "@/app/actions";
import { timeAgo } from "@/lib/time";
import { optImg } from "@/lib/img";
import ShareButton from "@/components/ShareButton";
import OnboardingHero from "@/components/OnboardingHero";
import NewsletterSignup from "@/components/NewsletterSignup";

type Day = { label: string; date: string; big: string; full: string };
type Mode = "light" | "dark";
type Pending = { id: string; tags: string[]; rank: number; ts: number };

const SECTION_TABS: { key: Section; label: string }[] = [
  { key: "daily", label: "Daily AI" },
  { key: "tools", label: "New Tools" },
  { key: "articles", label: "Articles" },
  { key: "funding", label: "Funding" },
];
// How many stories to reveal per "Explore more" click (also the first-page size).
const PAGES: Record<Section, number> = { daily: 15, tools: 8, articles: 8, funding: 8 };
const INITIAL_SHOWN: Record<Section, number> = {
  daily: PAGES.daily,
  tools: PAGES.tools,
  articles: PAGES.articles,
  funding: PAGES.funding,
};
// Each section is its own URL, so tabs are real links (the address bar reflects
// the section, for signed-in and logged-out alike). Daily lives at the home.
const SECTION_HREF: Record<Section, string> = {
  daily: "/",
  tools: "/new-tools",
  articles: "/articles",
  funding: "/funding",
};

function withHighlight(title: string, h: string | null, px: number): ReactNode {
  if (!h) return title;
  const i = title.indexOf(h);
  if (i < 0) return title;
  return (
    <>
      {title.slice(0, i)}
      <span style={{ borderBottom: `${px}px solid var(--accent)`, paddingBottom: "1px" }}>
        {h}
      </span>
      {title.slice(i + h.length)}
    </>
  );
}

// A story's destination is always its own Wortins page, so every story is a
// landing you can share (TLDR-style); the /story page itself carries a prominent
// link out to the original source.
function storyHref(it: Item): string {
  return `/story/${it.slug}`;
}

// Kicker shown on the branded fallback plate, by section.
const ART_KICKER: Record<string, string> = {
  daily: "Daily Brief",
  tools: "New Tool",
  articles: "Analysis",
  funding: "Funding",
};

// Clickable story visual. Uses the real photo when we have one; otherwise falls
// back to a branded newspaper "plate" (kicker + source name + W monogram) so
// every card carries a visual instead of a hole — many AI-news sources bot-block
// or hotlink-protect their images, so a real photo isn't always attainable. The
// headline stays clickable independently.
function CardPhoto({
  it,
  ratio,
  rank,
  onOpen,
  style,
  className,
  imgWidth = 1200,
}: {
  it: Item;
  ratio: string;
  rank: number;
  onOpen: (it: Item, rank: number) => void;
  style?: React.CSSProperties;
  className?: string;
  imgWidth?: number;
}) {
  const [failed, setFailed] = useState(false);
  const art = !it.image_url || failed;
  return (
    <a
      href={storyHref(it)}
      onClick={() => onOpen(it, rank)}
      target="_blank"
      rel="noopener noreferrer"
      className={className}
      style={{ display: "block", ...style }}
    >
      <div className={art ? "news-photo news-photo--art" : "news-photo"} style={{ aspectRatio: ratio }}>
        {art ? (
          <div className="news-photo__art">
            <span className="news-photo__sec mono">{ART_KICKER[it.section] ?? "Wortins"}</span>
            <span className="news-photo__src display">{it.source || "Wortins"}</span>
            <span className="news-photo__mark" aria-hidden="true">
              W
            </span>
          </div>
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={optImg(it.image_url, imgWidth)} alt="" onError={() => setFailed(true)} />
        )}
        <div className="news-photo__screen" />
      </div>
    </a>
  );
}

export default function Feed({
  items,
  days,
  todayIdx,
  now,
  updatedAgo,
  stampDate,
  editionNo,
  signedIn = true,
  personalized = true,
  initialActive = "daily",
}: {
  items: Item[];
  days: Day[];
  todayIdx: number;
  now: number;
  name: string | null;
  updatedAgo: string | null;
  stampDate: string;
  editionNo: number;
  initialMode: Mode;
  signedIn?: boolean;
  personalized?: boolean;
  initialActive?: Section;
}) {
  const active = initialActive;
  // How many stories are revealed per section. "Explore more" grows this; it
  // never rotates, so stories are appended below, never swapped out.
  const [shown, setShown] = useState<Record<Section, number>>(INITIAL_SHOWN);
  const [promptItem, setPromptItem] = useState<{ id: string; tags: string[] } | null>(
    null
  );
  const pendingRef = useRef<Pending | null>(null);
  const prevItemCount = useRef(items.length);

  // When a fresh drop lands (more items than before), collapse back to page one
  // so the newest stories show at the top.
  useEffect(() => {
    if (items.length > prevItemCount.current) {
      setShown(INITIAL_SHOWN);
      setPromptItem(null);
    }
    prevItemCount.current = items.length;
  }, [items.length]);

  // When the reader comes back to our tab after opening a story, show the rate
  // prompt on that card. Time-away is NOT a taste signal (reading speed varies);
  // it's only a gate so we don't prompt on an accidental blur.
  useEffect(() => {
    if (!signedIn) return;
    function resolve() {
      const p = pendingRef.current;
      if (!p) return;
      if (Date.now() - p.ts < 1500) return;
      pendingRef.current = null;
      try {
        sessionStorage.removeItem("sig_pending");
      } catch {}
      setPromptItem({ id: p.id, tags: p.tags });
    }
    try {
      const raw = sessionStorage.getItem("sig_pending");
      if (raw && !pendingRef.current) pendingRef.current = JSON.parse(raw);
    } catch {}
    resolve(); // came back via same-tab navigation
    function onReturn() {
      if (document.visibilityState === "visible") resolve();
    }
    document.addEventListener("visibilitychange", onReturn);
    window.addEventListener("focus", onReturn);
    return () => {
      document.removeEventListener("visibilitychange", onReturn);
      window.removeEventListener("focus", onReturn);
    };
  }, [signedIn]);

  const todayDate = days[todayIdx]?.date ?? null;

  // Per-section pools spanning EVERY loaded edition, today's stories first (so
  // the lead/rail are always today's), then older editions in taste order. This
  // is what lets "Explore more" pull in older days once today's run out.
  const pools = useMemo(() => {
    const today: Record<Section, Item[]> = { daily: [], tools: [], articles: [], funding: [] };
    const older: Record<Section, Item[]> = { daily: [], tools: [], articles: [], funding: [] };
    for (const it of items) {
      const bucket = it.edition_date === todayDate ? today : older;
      bucket[it.section]?.push(it);
    }
    return {
      daily: [...today.daily, ...older.daily],
      tools: [...today.tools, ...older.tools],
      articles: [...today.articles, ...older.articles],
      funding: [...today.funding, ...older.funding],
    } as Record<Section, Item[]>;
  }, [items, todayDate]);

  // The daily HERO is editorial, not personalized: the latest edition's top
  // curator pick (lowest rank of the freshest edition_date). Pinning it as the
  // lead means the day's biggest story leads for everyone; the rest of the feed
  // stays taste-sorted below it.
  const dailyHero = useMemo(() => {
    const daily = pools.daily;
    if (daily.length === 0) return null;
    let latest = "";
    for (const it of daily) {
      const d = it.edition_date ?? "";
      if (d > latest) latest = d;
    }
    const fromLatest = daily.filter((it) => (it.edition_date ?? "") === latest);
    // Lead with the freshest big story: newest published_at, ties broken by the
    // curator's rank (lowest rank = the drop's top pick).
    return fromLatest.reduce((best, it) => {
      const ip = Date.parse(it.published_at ?? "") || 0;
      const bp = Date.parse(best.published_at ?? "") || 0;
      if (ip !== bp) return ip > bp ? it : best;
      return it.rank < best.rank ? it : best;
    }, fromLatest[0]);
  }, [pools]);

  const fullList = useMemo(() => {
    const base = pools[active] ?? [];
    if (active === "daily" && dailyHero) {
      return [dailyHero, ...base.filter((it) => it.id !== dailyHero.id)];
    }
    return base;
  }, [pools, active, dailyHero]);
  const list = fullList.slice(0, shown[active]);
  const canExplore = fullList.length > shown[active];
  const hasContent = fullList.length > 0;

  function onOpen(it: Item, rank: number) {
    if (!signedIn) return;
    const tags = it.tags ?? [];
    // Skip signal: every story shown ABOVE this one in the current list was on
    // screen and passed over. Use the display position, not the passed rank.
    const idx = list.findIndex((x) => x.id === it.id);
    const above = idx > 0 ? list.slice(0, idx) : [];
    const skippedTags = above.flatMap((x) => x.tags ?? []);
    recordFeedClick(it.id, tags, idx < 0 ? rank : idx, skippedTags);
    // Pending marker so the return-to-tab handler can show the rate prompt.
    const p: Pending = { id: it.id, tags, rank, ts: Date.now() };
    pendingRef.current = p;
    try {
      sessionStorage.setItem("sig_pending", JSON.stringify(p));
    } catch {}
  }

  // Reveal the next batch BELOW the current ones (append, never swap).
  function exploreMore() {
    setShown((s) => ({ ...s, [active]: s[active] + PAGES[active] }));
    setPromptItem(null);
  }

  function rate(r: number) {
    if (promptItem) recordRating(promptItem.id, r, promptItem.tags);
    setPromptItem(null);
  }

  function cardPrompt(it: Item) {
    if (!signedIn || promptItem?.id !== it.id) return null;
    return (
      <div style={{ marginTop: 14, display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10, border: "1px solid var(--accent)", padding: "10px 12px", background: "var(--ph1)" }}>
        <span className="mono" style={{ fontSize: 11, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--accent)" }}>
          Rate this read
        </span>
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          {[1, 2, 3, 4, 5, 6].map((r) => (
            <button
              key={r}
              onClick={() => rate(r)}
              aria-label={`Rate ${r} out of 6`}
              className="mono bs-tap"
              style={{ width: 30, height: 30, fontSize: 13, border: "1px solid var(--sep)", background: "transparent", color: "var(--ink)", cursor: "pointer" }}
            >
              {r}
            </button>
          ))}
        </div>
        <span className="mono" style={{ fontSize: 10, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--faint)" }}>
          1 skip · 6 loved it
        </span>
      </div>
    );
  }

  function meta(it: Item, sep: string, size: number, withRead: boolean) {
    const ago = timeAgo(it.published_at, now);
    return (
      <span style={{ fontSize: size, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--dim)" }}>
        <span style={{ color: "var(--strong)", fontWeight: 700 }}>{it.source}</span>
        {ago && (
          <>
            {" "}
            <span style={{ color: "var(--sep)" }}>{sep}</span> {ago}
          </>
        )}
        {withRead && it.read_time && (
          <>
            {" "}
            <span style={{ color: "var(--sep)" }}>{sep}</span> {it.read_time} min read
          </>
        )}
      </span>
    );
  }

  const lead = list[0];
  const rail = list.slice(1, 4);
  const more = list.slice(4);
  const day = days[todayIdx];

  const exploreBtn = canExplore ? (
    <div style={{ textAlign: "center", marginTop: 44 }}>
      <button
        onClick={exploreMore}
        className="mono bs-tap"
        style={{ fontSize: 12, letterSpacing: "0.12em", textTransform: "uppercase", border: "1px solid var(--sep)", background: "transparent", color: "var(--ink)", padding: "11px 24px", cursor: "pointer" }}
      >
        Explore more &darr;
      </button>
    </div>
  ) : null;

  return (
    <main className="bs-main" style={{ position: "relative" }}>
      {/* masthead */}
      <header style={{ position: "relative", paddingTop: 12 }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 24, flexWrap: "wrap", rowGap: 12 }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
              <span aria-hidden className="display" style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 46, height: 46, background: "var(--accent)", color: "var(--onAccent)", fontSize: 32, lineHeight: 1 }}>
                W
              </span>
              <h1 className="display" style={{ fontSize: "clamp(40px,6vw,58px)", lineHeight: 0.9, letterSpacing: "0.13em", textTransform: "uppercase", margin: 0, color: "var(--ink)" }}>
                Wortins
              </h1>
            </div>
            <div className="mono" style={{ fontSize: 10, letterSpacing: "0.22em", textTransform: "uppercase", color: "var(--dim)", marginTop: 12 }}>
              {personalized ? "The daily AI briefing, curated to your taste" : "The daily AI briefing"}
            </div>
            <div className="mono" style={{ fontSize: 12, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--ink)", fontWeight: 700, marginTop: 10 }}>
              {day?.full}
            </div>
          </div>
          {/* utility controls — top-right of the masthead */}
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 16, marginTop: 4, minWidth: 0 }}>
            <div className="mono" style={{ display: "flex", alignItems: "center", gap: 12, rowGap: 8, flexWrap: "wrap", justifyContent: "flex-end", color: "var(--faint)", fontSize: 11, letterSpacing: "0.04em", textTransform: "uppercase" }}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              <span style={{ display: "inline-block", width: 6, height: 6, borderRadius: 999, background: "var(--live)", animation: "sigpulse 1.8s ease-in-out infinite" }} />
              {updatedAgo ? `Updated ${updatedAgo}` : "Live"}
            </span>
            {personalized ? (
              <a
                href="/tune"
                className="mono bs-tap"
                style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", padding: "9px 18px", border: "1.5px solid var(--accent)", background: "transparent", color: "var(--accent)", textDecoration: "none" }}
              >
                My account
              </a>
            ) : (
              <OnboardingHero signedIn={signedIn} />
            )}
            </div>
          </div>
        </div>
        {/* Cold-visitor value hook: the differentiator + primary CTA, shown only
            to non-personalized visitors (returning readers never see it). */}
        {!personalized && (
          <section style={{ marginTop: 18, border: "1px solid var(--ruleStrong)", background: "var(--ph1)", padding: "22px 26px", display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: "18px 36px" }}>
            <div style={{ flex: "1 1 440px", minWidth: 0 }}>
              <div className="mono" style={{ fontSize: 10, letterSpacing: "0.22em", textTransform: "uppercase", color: "var(--accent)" }}>
                Personalized &#183; Free
              </div>
              <h2 className="display" style={{ fontSize: "clamp(23px,2.8vw,30px)", lineHeight: 1.08, color: "var(--ink)", margin: "8px 0 0" }}>
                AI news, tuned to you.
              </h2>
              <p className="serif" style={{ fontSize: 15.5, lineHeight: 1.5, color: "var(--muted)", margin: "9px 0 0", maxWidth: "58ch" }}>
                The most interesting AI stories across new tools, funding, and applied AI, minus the big-lab hype. Answer a few questions and your daily briefing rebuilds around your taste.
              </p>
            </div>
            <a href="/welcome" className="mono bs-tap" style={{ flexShrink: 0, fontSize: 13, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", padding: "14px 24px", background: "var(--accent)", color: "var(--onAccent)", textDecoration: "none", whiteSpace: "nowrap" }}>
              Personalize your feed &rarr;
            </a>
          </section>
        )}
        <div style={{ marginTop: 18 }}>
          <NewsletterSignup />
        </div>
        <div style={{ borderTop: "3px solid var(--ruleStrong)", marginTop: 14 }} />
      </header>

      {/* section tabs (no counts) */}
      <div className="bs-controls">
        <nav style={{ display: "flex", gap: 26 }}>
          {SECTION_TABS.map((s) => {
            const a = s.key === active;
            return (
              <a
                key={s.key}
                href={SECTION_HREF[s.key]}
                className={`bs-tab${a ? " bs-tab--on" : ""}`}
                style={{ fontFamily: "inherit", fontSize: 13, letterSpacing: "0.13em", textTransform: "uppercase", padding: "0 0 12px", borderBottom: a ? "2px solid var(--accent)" : "2px solid transparent", marginBottom: -1, textDecoration: "none", color: a ? "var(--ink)" : "var(--dim)", cursor: "pointer" }}
              >
                {s.label}
              </a>
            );
          })}
        </nav>
      </div>

      {!hasContent ? (
        <div style={{ marginTop: 36, border: "1px solid var(--ruleStrong)", padding: "60px 24px", textAlign: "center", background: "var(--ph1)" }}>
          <p className="display" style={{ fontSize: 22, color: "var(--ink)", margin: 0 }}>
            No stories in this section yet.
          </p>
          <p className="serif" style={{ fontStyle: "italic", fontSize: 15, color: "var(--dim)", margin: "8px 0 0" }}>
            Fresh editions land throughout the day, check back soon.
          </p>
        </div>
      ) : (
        <div style={{ marginTop: 28 }}>
          {active === "daily" && (
            <section>
              <div className="bs-lead">
                {lead && (
                  <article>
                    <CardPhoto it={lead} ratio="16/9" rank={0} onOpen={onOpen} />
                    <div style={{ marginTop: 16 }}>{meta(lead, "·", 11, true)}</div>
                    <a href={storyHref(lead)} onClick={() => onOpen(lead, 0)} target="_blank" rel="noopener noreferrer" className="bs-hl">
                      <h2 className="display" style={{ fontSize: "clamp(30px,3.6vw,46px)", lineHeight: 1.05, margin: "12px 0 0", color: "var(--ink)" }}>
                        {withHighlight(lead.title, lead.highlight, 4)}
                      </h2>
                    </a>
                    {lead.summary && (
                      <p className="serif" style={{ fontSize: 18, lineHeight: 1.6, color: "var(--muted)", margin: "14px 0 0", maxWidth: "60ch" }}>
                        {lead.summary}
                      </p>
                    )}
                    <div style={{ marginTop: 16, display: "flex", alignItems: "center", gap: 18 }}>
                      <a href={lead.url ?? "#"} onClick={() => onOpen(lead, 0)} target="_blank" rel="noopener noreferrer" style={{ fontStyle: "italic", fontSize: 14, color: "var(--accent)", textDecoration: "none" }}>
                        Read the full story &rarr;
                      </a>
                      <ShareButton compact url={`/story/${lead.slug}`} title={lead.title} />
                    </div>
                    {cardPrompt(lead)}
                  </article>
                )}

                <div className="bs-rail">
                  {rail.map((it, i) => (
                    <article
                      key={it.id}
                      style={{ paddingBottom: 22, marginBottom: i === rail.length - 1 ? 0 : 22, borderBottom: i === rail.length - 1 ? "none" : "1px solid var(--rule)" }}
                    >
                      {meta(it, "·", 10, true)}
                      <a href={storyHref(it)} onClick={() => onOpen(it, i + 1)} target="_blank" rel="noopener noreferrer" className="bs-hl">
                        <h3 className="display" style={{ fontSize: 23, lineHeight: 1.14, margin: "8px 0 0", color: "var(--ink)" }}>
                          {withHighlight(it.title, it.highlight, 3)}
                        </h3>
                      </a>
                      {it.summary && (
                        <p className="serif" style={{ fontSize: 15, lineHeight: 1.55, color: "var(--dim)", margin: "8px 0 0", display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                          {it.summary}
                        </p>
                      )}
                      <div style={{ marginTop: 9 }}>
                        <ShareButton compact url={`/story/${it.slug}`} title={it.title} />
                      </div>
                      {cardPrompt(it)}
                    </article>
                  ))}
                </div>
              </div>

              {more.length > 0 && (
                <>
                  <div style={{ display: "flex", alignItems: "center", gap: 16, marginTop: 50, marginBottom: 10 }}>
                    <span className="mono" style={{ fontSize: 11, letterSpacing: "0.16em", textTransform: "uppercase", color: "var(--dim)", whiteSpace: "nowrap" }}>
                      More stories
                    </span>
                    <span style={{ flex: 1, height: 3, borderTop: "1px solid var(--ruleStrong)", borderBottom: "1px solid var(--ruleStrong)" }} />
                  </div>
                  {/* Row list: text-forward, with a small thumbnail on the right.
                      Real photo when we have one, else a branded plate — so every
                      row reads as a complete card. Row height follows the text. */}
                  <div className="bs-more">
                    {more.map((it, i) => (
                      <article className="bs-story" key={it.id}>
                        <div className="bs-story__body">
                          <div>{meta(it, "·", 10, false)}</div>
                          <a href={storyHref(it)} onClick={() => onOpen(it, i + 3)} target="_blank" rel="noopener noreferrer" className="bs-hl">
                            <h4 className="display" style={{ fontSize: 19, lineHeight: 1.16, margin: "6px 0 0", color: "var(--ink)" }}>
                              {it.title}
                            </h4>
                          </a>
                          {it.summary && (
                            <p className="serif" style={{ fontSize: 14, lineHeight: 1.5, color: "var(--dim)", margin: "7px 0 0", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                              {it.summary}
                            </p>
                          )}
                          <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 9 }}>
                            {it.read_time && (
                              <span className="mono" style={{ fontSize: 11, color: "var(--faint)" }}>
                                {it.read_time} min read
                              </span>
                            )}
                            <ShareButton compact url={`/story/${it.slug}`} title={it.title} />
                          </div>
                          {cardPrompt(it)}
                        </div>
                        <CardPhoto it={it} ratio="4/3" rank={i + 3} onOpen={onOpen} className="bs-story__thumb" imgWidth={400} />
                      </article>
                    ))}
                  </div>
                </>
              )}
              {exploreBtn}
            </section>
          )}

          {active === "tools" && (
            <section>
              {list.map((it, i) => {
                const skill = it.title.toLowerCase().includes("skill");
                return (
                  <div
                    key={it.id}
                    style={{ paddingBottom: 22, marginBottom: i === list.length - 1 ? 0 : 22, borderBottom: i === list.length - 1 ? "none" : "1px solid var(--rule)" }}
                  >
                    <div style={{ display: "flex", alignItems: "flex-start", gap: 22 }}>
                      <span className="display" style={{ fontSize: 34, lineHeight: 1, color: "var(--rank)", minWidth: 42 }}>
                        {String(i + 1).padStart(2, "0")}
                      </span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 11 }}>
                          <a href={storyHref(it)} onClick={() => onOpen(it, i)} target="_blank" rel="noopener noreferrer" className="bs-hl">
                            <h3 className="display" style={{ fontSize: 21, margin: 0, color: "var(--ink)" }}>
                              {it.title.replace(/\s*\(Claude skill\)$/, "")}
                            </h3>
                          </a>
                          <span className="mono" style={{ fontSize: 10, letterSpacing: "0.06em", textTransform: "uppercase", padding: "2px 8px", border: skill ? "1px solid var(--accent)" : "1px solid var(--sep)", color: skill ? "var(--accent)" : "var(--dim)" }}>
                            {skill ? "Claude skill" : "Tool"}
                          </span>
                          {it.traction && (
                            <span className="mono" style={{ fontSize: 11, color: "var(--faint)" }}>
                              {it.traction}
                            </span>
                          )}
                        </div>
                        {it.summary && (
                          <p className="serif" style={{ fontSize: 15, lineHeight: 1.5, color: "var(--dim)", margin: "6px 0 0" }}>
                            {it.summary}
                          </p>
                        )}
                        <div style={{ marginTop: 8 }}>
                          <ShareButton compact url={`/story/${it.slug}`} title={it.title} />
                        </div>
                        {cardPrompt(it)}
                      </div>
                      <a href={it.url ?? "#"} onClick={() => onOpen(it, i)} target="_blank" rel="noopener noreferrer" style={{ flexShrink: 0, fontStyle: "italic", fontSize: 13, color: "var(--ink)", textDecoration: "none", border: "1px solid var(--sep)", padding: "7px 15px" }}>
                        Open &#8599;
                      </a>
                    </div>
                  </div>
                );
              })}
              {exploreBtn}
            </section>
          )}

          {(active === "articles" || active === "funding") && (
            <section style={{ maxWidth: 800 }}>
              {list.map((it, i) => (
                <article
                  key={it.id}
                  style={{ paddingBottom: 26, marginBottom: i === list.length - 1 ? 0 : 26, borderBottom: i === list.length - 1 ? "none" : "1px solid var(--rule)" }}
                >
                  <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 16 }}>
                    <span style={{ fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--strong)", fontWeight: 700 }}>
                      {it.source}
                    </span>
                    {it.read_time && (
                      <span className="mono" style={{ fontSize: 11, color: "var(--faint)", whiteSpace: "nowrap" }}>
                        {it.read_time} min read
                      </span>
                    )}
                  </div>
                  <a href={storyHref(it)} onClick={() => onOpen(it, i)} target="_blank" rel="noopener noreferrer" className="bs-hl">
                    <h2 className="display" style={{ fontSize: 30, lineHeight: 1.16, margin: "10px 0 0", color: "var(--ink)" }}>
                      {withHighlight(it.title, it.highlight, 3)}
                    </h2>
                  </a>
                  {it.summary && (
                    <p className="serif" style={{ fontSize: 18, lineHeight: 1.6, color: "var(--muted)", margin: "12px 0 0" }}>
                      {it.summary}
                    </p>
                  )}
                  <div style={{ marginTop: 12 }}>
                    <ShareButton compact url={`/story/${it.slug}`} title={it.title} />
                  </div>
                  {cardPrompt(it)}
                </article>
              ))}
              {exploreBtn}
            </section>
          )}
        </div>
      )}

      <footer className="mono" style={{ marginTop: 64, borderTop: "3px double var(--ruleStrong)", paddingTop: 18, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap", fontSize: 11, letterSpacing: "0.08em", color: "var(--faint)" }}>
        <span style={{ textTransform: "uppercase" }}>Wortins, printed for one reader</span>
        <nav style={{ display: "flex", gap: 18, textTransform: "uppercase" }}>
          <a href="/about" className="bs-ilink" style={{ color: "var(--dim)", textDecoration: "none" }}>About</a>
          <a href="/editions" className="bs-ilink" style={{ color: "var(--dim)", textDecoration: "none" }}>Editions</a>
          <a href="/contact" className="bs-ilink" style={{ color: "var(--dim)", textDecoration: "none" }}>Contact</a>
        </nav>
      </footer>
    </main>
  );
}
