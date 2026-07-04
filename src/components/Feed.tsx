"use client";

import { useEffect, useMemo, useRef, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Item, Section } from "@/lib/types";
import { recordEngagement, recordRating } from "@/app/actions";
import { timeAgo } from "@/lib/time";

type Day = { label: string; date: string; big: string; full: string };
type Mode = "light" | "dark";
type Pending = { id: string; tags: string[]; rank: number; ts: number };

const SECTION_TABS: { key: Section; label: string }[] = [
  { key: "daily", label: "Daily AI" },
  { key: "tools", label: "New Tools" },
  { key: "articles", label: "Articles" },
  { key: "funding", label: "Funding" },
];
const PAGES: Record<Section, number> = { daily: 12, tools: 8, articles: 8, funding: 8 };

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

function NewsPhoto({ it, ratio }: { it: Item; ratio: string }) {
  const [failed, setFailed] = useState(false);
  const ok = it.image_url && !failed;
  return (
    <div className="news-photo" style={{ aspectRatio: ratio }}>
      {ok ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={it.image_url!} alt="" onError={() => setFailed(true)} />
      ) : (
        // Branded fallback so a missing/broken image reads as intentional,
        // not a blank box (many source images are null or hotlink-blocked).
        <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 10, background: "var(--ph1)" }}>
          <span aria-hidden className="display" style={{ fontSize: "clamp(30px,6vw,52px)", lineHeight: 1, color: "var(--rule)" }}>W</span>
          <span className="mono" style={{ fontSize: 10, letterSpacing: "0.16em", textTransform: "uppercase", color: "var(--dim)", padding: "0 14px", textAlign: "center" }}>
            {it.source ?? "Wortins"}
          </span>
        </div>
      )}
      <div className="news-photo__screen" />
    </div>
  );
}

export default function Feed({
  items,
  days,
  todayIdx,
  now,
  name,
  updatedAgo,
  stampDate,
  editionNo,
  initialMode,
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
}) {
  const [active, setActive] = useState<Section>("daily");
  const [sel, setSel] = useState(todayIdx);
  const [mode, setMode] = useState<Mode>(initialMode);
  const [cursor, setCursor] = useState<Record<Section, number>>({
    daily: 0,
    tools: 0,
    articles: 0,
    funding: 0,
  });
  const [promptItem, setPromptItem] = useState<{ id: string; tags: string[] } | null>(
    null
  );
  const pendingRef = useRef<Pending | null>(null);
  const router = useRouter();
  const [refreshing, startRefresh] = useTransition();
  const [toast, setToast] = useState<string | null>(null);
  const refreshedRef = useRef(false);
  const baseCountRef = useRef(0);
  const prevItemCount = useRef(items.length);

  useEffect(() => {
    setCursor({ daily: 0, tools: 0, articles: 0, funding: 0 });
    setPromptItem(null);
  }, [sel]);

  // When a fresh drop lands (more items than before), jump to the top so the newest shows.
  useEffect(() => {
    if (items.length > prevItemCount.current) {
      setCursor({ daily: 0, tools: 0, articles: 0, funding: 0 });
    }
    prevItemCount.current = items.length;
  }, [items.length]);

  // After a user-initiated Refresh settles, confirm what happened so it never feels dead.
  useEffect(() => {
    if (refreshing || !refreshedRef.current) return;
    refreshedRef.current = false;
    const delta = items.length - baseCountRef.current;
    setToast(
      delta > 0
        ? `${delta} new ${delta === 1 ? "story" : "stories"}`
        : `You’re up to date${updatedAgo ? ` · latest ${updatedAgo}` : ""}`
    );
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [refreshing, items.length, updatedAgo]);

  // Return-time dwell: when the reader comes back to our tab after opening a
  // story, turn time-away into an engagement signal, and ask on that card.
  useEffect(() => {
    function resolve() {
      const p = pendingRef.current;
      if (!p) return;
      const dwell = Date.now() - p.ts;
      if (dwell < 1500) return;
      pendingRef.current = null;
      try {
        sessionStorage.removeItem("sig_pending");
      } catch {}
      const mobile = /Mobi|Android/i.test(navigator.userAgent);
      recordEngagement(p.id, p.tags, "dwell", p.rank, dwell, mobile);
      // Ask for feedback after every read (the reader actually left and came back).
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
  }, []);

  const selectedDate = days[sel]?.date ?? null;
  const grouped = useMemo(() => {
    const g: Record<Section, Item[]> = { daily: [], tools: [], articles: [], funding: [] };
    for (const it of items)
      if (it.edition_date === selectedDate) g[it.section]?.push(it);
    return g;
  }, [items, selectedDate]);

  const total =
    grouped.daily.length + grouped.tools.length + grouped.articles.length;
  const hasContent = total > 0;
  const fullList = grouped[active] ?? [];
  const pageSize = PAGES[active];
  const startAt = fullList.length ? cursor[active] % fullList.length : 0;
  const list =
    fullList.length <= pageSize
      ? fullList
      : Array.from(
          { length: pageSize },
          (_, i) => fullList[(startAt + i) % fullList.length]
        );
  const canExplore = fullList.length > pageSize;

  function toggleMode() {
    const next: Mode = mode === "dark" ? "light" : "dark";
    setMode(next);
    if (typeof document !== "undefined") {
      document.documentElement.setAttribute("data-theme", next);
      document.cookie = `sig_theme=${next}; path=/; max-age=31536000; samesite=lax`;
    }
  }

  // Instant: content is curated continuously in the background, so Refresh just
  // re-fetches the latest edition, jumps to the top, and confirms what changed.
  function refresh() {
    setPromptItem(null);
    refreshedRef.current = true;
    baseCountRef.current = items.length;
    setActive("daily");
    setSel(todayIdx);
    setCursor({ daily: 0, tools: 0, articles: 0, funding: 0 });
    startRefresh(() => router.refresh());
  }

  function onOpen(it: Item, rank: number) {
    const tags = it.tags ?? [];
    recordEngagement(it.id, tags, "click", rank);
    const p: Pending = { id: it.id, tags, rank, ts: Date.now() };
    pendingRef.current = p;
    try {
      sessionStorage.setItem("sig_pending", JSON.stringify(p));
    } catch {}
  }

  function exploreMore() {
    const len = fullList.length || 1;
    setCursor((c) => ({ ...c, [active]: (c[active] + pageSize) % len }));
    setPromptItem(null);
  }

  function rate(r: number) {
    if (promptItem) recordRating(promptItem.id, r, promptItem.tags);
    setPromptItem(null);
  }

  function cardPrompt(it: Item) {
    if (promptItem?.id !== it.id) return null;
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
              className="mono"
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
  const rail = list.slice(1, 3);
  const more = list.slice(3);
  const day = days[sel];

  const exploreBtn = canExplore ? (
    <div style={{ textAlign: "center", marginTop: 44 }}>
      <button
        onClick={exploreMore}
        className="mono"
        style={{ fontSize: 12, letterSpacing: "0.12em", textTransform: "uppercase", border: "1px solid var(--sep)", background: "transparent", color: "var(--ink)", padding: "11px 24px", cursor: "pointer" }}
      >
        Explore more &darr;
      </button>
    </div>
  ) : null;

  return (
    <main className="bs-main" style={{ position: "relative" }}>
      {/* controls moved to the dateline row below */}

      {toast && (
        <div className="mono" style={{ fontSize: 11, letterSpacing: "0.05em", color: "var(--accent)", padding: "8px 0", borderBottom: "1px solid var(--rule)" }}>
          {toast}
        </div>
      )}

      {/* masthead */}
      <header style={{ position: "relative", paddingTop: 12 }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 24 }}>
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
              The daily AI briefing, curated to your taste
            </div>
            {name && (
              <div className="mono" style={{ fontSize: 10, letterSpacing: "0.08em", color: "var(--faint)", marginTop: 8 }}>
                Welcome back, {name}
              </div>
            )}
          </div>
          <div className="mono" style={{ flexShrink: 0, transform: "rotate(-7deg)", marginTop: 6, border: "2px solid var(--accent)", color: "var(--accent)", fontWeight: 700, fontSize: 10, letterSpacing: "0.06em", lineHeight: 1.35, padding: "6px 9px", textAlign: "center" }}>
            EDITION&#8470; {editionNo}
            <br />
            {stampDate}
            <br />
            &#9733; TODAY &#9733;
          </div>
        </div>
        <div style={{ borderTop: "3px solid var(--ruleStrong)", marginTop: 14 }} />
        {/* dateline (day nav) + controls, on the row below the thick rule */}
        <div className="mono" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, rowGap: 8, flexWrap: "wrap", fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase", paddingTop: 9 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <button
              onClick={() => setSel(Math.max(0, sel - 1))}
              aria-label="Previous day"
              disabled={sel <= 0}
              style={{ fontFamily: "inherit", fontSize: 16, lineHeight: 1, border: 0, background: "transparent", color: "var(--dim)", cursor: sel <= 0 ? "default" : "pointer", opacity: sel <= 0 ? 0.3 : 1, padding: 0 }}
            >
              &#8249;
            </button>
            <span style={{ color: "var(--strong)", fontWeight: 700 }}>{day?.full}</span>
            <button
              onClick={() => setSel(Math.min(todayIdx, sel + 1))}
              aria-label="Next day"
              disabled={sel >= todayIdx}
              style={{ fontFamily: "inherit", fontSize: 16, lineHeight: 1, border: 0, background: "transparent", color: "var(--dim)", cursor: sel >= todayIdx ? "default" : "pointer", opacity: sel >= todayIdx ? 0.3 : 1, padding: 0 }}
            >
              &#8250;
            </button>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 14, color: "var(--faint)", letterSpacing: "0.04em" }}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              <span style={{ display: "inline-block", width: 6, height: 6, borderRadius: 999, background: "var(--live)", animation: "sigpulse 1.8s ease-in-out infinite" }} />
              {updatedAgo ? `Updated ${updatedAgo}` : "Live"}
            </span>
            <button
              onClick={refresh}
              disabled={refreshing}
              className="mono"
              style={{ fontSize: 11, letterSpacing: "0.04em", textTransform: "uppercase", padding: "4px 11px", border: "1px solid var(--sep)", background: "transparent", color: "var(--dim)", cursor: refreshing ? "default" : "pointer", opacity: refreshing ? 0.5 : 1, display: "inline-flex", alignItems: "center", gap: 6 }}
              aria-label="Refresh feed"
            >
              <span style={{ display: "inline-block", animation: refreshing ? "sigspin 0.8s linear infinite" : "none" }}>↻</span>
              {refreshing ? "Refreshing" : "Refresh"}
            </button>
            <a
              href="/tune"
              className="mono"
              style={{ fontSize: 11, letterSpacing: "0.04em", textTransform: "uppercase", padding: "4px 11px", border: "1px solid var(--sep)", color: "var(--dim)", textDecoration: "none" }}
            >
              Tune
            </a>
            <button
              onClick={toggleMode}
              className="mono"
              style={{ fontSize: 11, letterSpacing: "0.04em", padding: "4px 11px", border: "1px solid var(--sep)", background: "transparent", color: "var(--dim)", cursor: "pointer" }}
            >
              {mode === "dark" ? "☀ Light" : "☾ Dark"}
            </button>
          </div>
        </div>
      </header>

      {/* section tabs (no counts) */}
      <div className="bs-controls">
        <nav style={{ display: "flex", gap: 26 }}>
          {SECTION_TABS.map((s) => {
            const a = s.key === active;
            return (
              <button
                key={s.key}
                onClick={() => setActive(s.key)}
                style={{ fontFamily: "inherit", fontSize: 13, letterSpacing: "0.13em", textTransform: "uppercase", padding: "0 0 12px", border: 0, borderBottom: a ? "2px solid var(--accent)" : "2px solid transparent", marginBottom: -1, background: "transparent", color: a ? "var(--ink)" : "var(--dim)", cursor: "pointer" }}
              >
                {s.label}
              </button>
            );
          })}
        </nav>
      </div>

      {!hasContent ? (
        <div style={{ marginTop: 36, border: "1px solid var(--ruleStrong)", padding: "60px 24px", textAlign: "center", background: "var(--ph1)" }}>
          <p className="display" style={{ fontSize: 22, color: "var(--ink)", margin: 0 }}>
            No stories filed for {day?.big} yet.
          </p>
          <p className="serif" style={{ fontStyle: "italic", fontSize: 15, color: "var(--dim)", margin: "8px 0 0" }}>
            We only began keeping the archive recently.
          </p>
          <button
            onClick={() => setSel(todayIdx)}
            style={{ marginTop: 20, background: "var(--accent)", color: "var(--onAccent)", border: 0, padding: "10px 20px", fontFamily: "inherit", fontSize: 13, letterSpacing: "0.1em", textTransform: "uppercase", cursor: "pointer" }}
          >
            Back to Today
          </button>
        </div>
      ) : (
        <div style={{ marginTop: 28 }}>
          {active === "daily" && (
            <section>
              <div className="bs-lead">
                {lead && (
                  <article>
                    <a href={lead.url ?? "#"} onClick={() => onOpen(lead, 0)} target="_blank" rel="noopener noreferrer" style={{ display: "block" }}>
                      <NewsPhoto it={lead} ratio="16/9" />
                    </a>
                    <div style={{ marginTop: 16 }}>{meta(lead, "—", 11, true)}</div>
                    <a href={lead.url ?? "#"} onClick={() => onOpen(lead, 0)} target="_blank" rel="noopener noreferrer">
                      <h2 className="display" style={{ fontSize: "clamp(30px,3.6vw,46px)", lineHeight: 1.05, margin: "12px 0 0", color: "var(--ink)" }}>
                        {withHighlight(lead.title, lead.highlight, 4)}
                      </h2>
                    </a>
                    {lead.summary && (
                      <p className="serif" style={{ fontSize: 18, lineHeight: 1.6, color: "var(--muted)", margin: "14px 0 0", maxWidth: "60ch" }}>
                        {lead.summary}
                      </p>
                    )}
                    <div style={{ marginTop: 16 }}>
                      <a href={lead.url ?? "#"} onClick={() => onOpen(lead, 0)} target="_blank" rel="noopener noreferrer" style={{ fontStyle: "italic", fontSize: 14, color: "var(--accent)", textDecoration: "none" }}>
                        Read the full story &rarr;
                      </a>
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
                      <a href={it.url ?? "#"} onClick={() => onOpen(it, i + 1)} target="_blank" rel="noopener noreferrer">
                        <h3 className="display" style={{ fontSize: 23, lineHeight: 1.14, margin: "8px 0 0", color: "var(--ink)" }}>
                          {withHighlight(it.title, it.highlight, 3)}
                        </h3>
                      </a>
                      {it.summary && (
                        <p className="serif" style={{ fontSize: 15, lineHeight: 1.55, color: "var(--dim)", margin: "8px 0 0", display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                          {it.summary}
                        </p>
                      )}
                      {cardPrompt(it)}
                    </article>
                  ))}
                </div>
              </div>

              {more.length > 0 && (
                <>
                  <div style={{ display: "flex", alignItems: "center", gap: 16, marginTop: 50, marginBottom: 24 }}>
                    <span className="mono" style={{ fontSize: 11, letterSpacing: "0.16em", textTransform: "uppercase", color: "var(--dim)", whiteSpace: "nowrap" }}>
                      More Today
                    </span>
                    <span style={{ flex: 1, height: 3, borderTop: "1px solid var(--ruleStrong)", borderBottom: "1px solid var(--ruleStrong)" }} />
                  </div>
                  <div className="bs-more">
                    {more.map((it, i) => (
                      <article key={it.id}>
                        <a href={it.url ?? "#"} onClick={() => onOpen(it, i + 3)} target="_blank" rel="noopener noreferrer" style={{ display: "block", marginBottom: 13 }}>
                          <NewsPhoto it={it} ratio="16/10" />
                        </a>
                        <div>{meta(it, "·", 10, false)}</div>
                        <a href={it.url ?? "#"} onClick={() => onOpen(it, i + 3)} target="_blank" rel="noopener noreferrer">
                          <h4 className="display" style={{ fontSize: 19, lineHeight: 1.16, margin: "8px 0 0", color: "var(--ink)" }}>
                            {it.title}
                          </h4>
                        </a>
                        {it.read_time && (
                          <div className="mono" style={{ fontSize: 11, color: "var(--faint)", marginTop: 9 }}>
                            {it.read_time} min read
                          </div>
                        )}
                        {cardPrompt(it)}
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
                          <a href={it.url ?? "#"} onClick={() => onOpen(it, i)} target="_blank" rel="noopener noreferrer">
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
                  <a href={it.url ?? "#"} onClick={() => onOpen(it, i)} target="_blank" rel="noopener noreferrer">
                    <h2 className="display" style={{ fontSize: 30, lineHeight: 1.16, margin: "10px 0 0", color: "var(--ink)" }}>
                      {withHighlight(it.title, it.highlight, 3)}
                    </h2>
                  </a>
                  {it.summary && (
                    <p className="serif" style={{ fontSize: 18, lineHeight: 1.6, color: "var(--muted)", margin: "12px 0 0" }}>
                      {it.summary}
                    </p>
                  )}
                  {cardPrompt(it)}
                </article>
              ))}
              {exploreBtn}
            </section>
          )}
        </div>
      )}

      <footer className="mono" style={{ marginTop: 64, borderTop: "3px double var(--ruleStrong)", paddingTop: 18, display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 11, letterSpacing: "0.08em", color: "var(--faint)" }}>
        <span style={{ textTransform: "uppercase" }}>Wortins &mdash; printed for one reader</span>
        <span>The more you read, the sharper it gets &middot; p. 1</span>
      </footer>
    </main>
  );
}
