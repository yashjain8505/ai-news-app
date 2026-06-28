"use client";

import {
  useMemo,
  useState,
  useTransition,
  type CSSProperties,
  type MouseEvent,
  type ReactNode,
} from "react";
import { Item, Section } from "@/lib/types";
import { recordSignal } from "@/app/actions";
import { timeAgo } from "@/lib/time";

type Day = { label: string; date: string; big: string; full: string };
type Mode = "light" | "dark";

const HEART =
  "M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8l1.1 1L12 21l7.7-7.6 1.1-1a5.5 5.5 0 0 0 0-7.8z";

const SECTION_TABS: { key: Section; label: string }[] = [
  { key: "daily", label: "Daily AI" },
  { key: "tools", label: "New Tools" },
  { key: "articles", label: "Articles" },
];
const BLURBS: Record<Section, string> = {
  daily: "Big-lab power moves and the surprising consequences of AI.",
  tools: "Obscure, novel tools before anyone else knows them.",
  articles: "Strategic parallels and sharp takes worth reading.",
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

function hideImg(e: React.SyntheticEvent<HTMLImageElement>) {
  e.currentTarget.style.display = "none";
}

function NewsPhoto({ it, ratio }: { it: Item; ratio: string }) {
  return (
    <div className="news-photo" style={{ aspectRatio: ratio }}>
      {it.image_url && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={it.image_url} alt="" onError={hideImg} />
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
  const [offsets, setOffsets] = useState<Record<Section, number>>({
    daily: 0,
    tools: 0,
    articles: 0,
  });
  const [signals, setSignals] = useState<Record<string, "like" | "less">>({});
  const [, startTransition] = useTransition();

  const selectedDate = days[sel]?.date ?? null;
  const grouped = useMemo(() => {
    const g: Record<Section, Item[]> = { daily: [], tools: [], articles: [] };
    for (const it of items)
      if (it.edition_date === selectedDate) g[it.section]?.push(it);
    return g;
  }, [items, selectedDate]);

  const total =
    grouped.daily.length + grouped.tools.length + grouped.articles.length;
  const hasContent = total > 0;
  const isToday = sel === todayIdx;
  const baseList = grouped[active] ?? [];
  const off = baseList.length ? offsets[active] % baseList.length : 0;
  const list = off
    ? [...baseList.slice(off), ...baseList.slice(0, off)]
    : baseList;

  function toggleMode() {
    const next: Mode = mode === "dark" ? "light" : "dark";
    setMode(next);
    if (typeof document !== "undefined") {
      document.documentElement.setAttribute("data-theme", next);
      document.cookie = `sig_theme=${next}; path=/; max-age=31536000; samesite=lax`;
    }
  }

  function signal(it: Item, action: "like" | "less", e: MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    setSignals((s) => ({ ...s, [it.id]: action }));
    startTransition(() => {
      recordSignal(it.id, action, it.tags ?? []);
    });
  }

  function refresh() {
    const len = (grouped[active] ?? []).length;
    if (!len) return;
    setOffsets((o) => ({
      ...o,
      [active]: (o[active] + Math.max(1, Math.floor(len / 2))) % len,
    }));
  }

  const circle: CSSProperties = {
    height: 32,
    width: 32,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 999,
    border: "1px solid var(--sep)",
    background: "transparent",
    cursor: "pointer",
    padding: 0,
  };

  function reactions(it: Item, withLess: boolean) {
    const s = signals[it.id];
    return (
      <div style={{ display: "flex", gap: 8 }}>
        <button
          onClick={(e) => signal(it, "like", e)}
          title="More like this"
          aria-label="More like this"
          style={{
            ...circle,
            background: s === "like" ? "var(--accent)" : "transparent",
            borderColor: s === "like" ? "var(--accent)" : "var(--sep)",
            color: s === "like" ? "var(--onAccent)" : "var(--muted)",
          }}
        >
          <svg viewBox="0 0 24 24" width="15" height="15" fill={s === "like" ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d={HEART} />
          </svg>
        </button>
        {withLess && (
          <button
            onClick={(e) => signal(it, "less", e)}
            title="Less like this"
            aria-label="Less like this"
            style={{
              ...circle,
              background: s === "less" ? "var(--sep)" : "transparent",
              color: s === "less" ? "var(--ink)" : "var(--muted)",
            }}
          >
            <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 12h14" />
            </svg>
          </button>
        )}
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

  return (
    <main className="bs-main" style={{ position: "relative" }}>
      {/* utility line */}
      <div
        className="mono"
        style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 11, letterSpacing: "0.04em", color: "var(--faint)", padding: "12px 0", borderBottom: "1px solid var(--rule)" }}
      >
        <span>{name ? `Welcome back, ${name}` : "Welcome back"}</span>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            <span style={{ display: "inline-block", width: 6, height: 6, borderRadius: 999, background: "var(--live)", animation: "sigpulse 1.8s ease-in-out infinite" }} />
            {updatedAgo ? `Updated ${updatedAgo}` : "Live"}
          </span>
          <button
            onClick={toggleMode}
            className="mono"
            style={{ fontSize: 11, letterSpacing: "0.04em", padding: "4px 11px", border: "1px solid var(--sep)", background: "transparent", color: "var(--dim)", cursor: "pointer" }}
          >
            {mode === "dark" ? "☀ Light" : "☾ Dark"}
          </button>
        </div>
      </div>

      {/* masthead */}
      <header style={{ position: "relative", paddingTop: 12 }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 24 }}>
          <div>
            <div style={{ display: "flex", alignItems: "flex-end", gap: 13 }}>
              <span style={{ display: "inline-flex", alignItems: "flex-end", gap: 3, paddingBottom: 7 }}>
                <span style={{ width: 6, height: 13, background: "var(--accent)" }} />
                <span style={{ width: 6, height: 22, background: "var(--accent)" }} />
                <span style={{ width: 6, height: 31, background: "var(--accent)" }} />
              </span>
              <h1 className="display" style={{ fontSize: "clamp(40px,6vw,58px)", lineHeight: 0.9, letterSpacing: "0.13em", textTransform: "uppercase", margin: 0, color: "var(--ink)" }}>
                Signal
              </h1>
            </div>
            <div className="mono" style={{ fontSize: 10, letterSpacing: "0.22em", textTransform: "uppercase", color: "var(--dim)", marginTop: 12 }}>
              The daily AI briefing, curated to your taste
            </div>
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
        <div className="mono" style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 16, fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase", paddingTop: 9 }}>
          <span style={{ color: "var(--strong)", fontWeight: 700 }}>{day?.full}</span>
          <span style={{ color: "var(--dim)" }}>{total} stories</span>
        </div>
      </header>

      {/* controls */}
      <div className="bs-controls">
        <nav style={{ display: "flex", gap: 26 }}>
          {SECTION_TABS.map((s) => {
            const a = s.key === active;
            return (
              <button
                key={s.key}
                onClick={() => setActive(s.key)}
                style={{ fontFamily: "inherit", fontSize: 13, letterSpacing: "0.13em", textTransform: "uppercase", padding: "0 0 12px", border: 0, borderBottom: a ? "2px solid var(--accent)" : "2px solid transparent", marginBottom: -1, background: "transparent", color: a ? "var(--ink)" : "var(--dim)", cursor: "pointer", display: "inline-flex", gap: 7, alignItems: "baseline" }}
              >
                <span>{s.label}</span>
                <span className="mono" style={{ fontSize: 11, color: a ? "var(--accent)" : "var(--faint)" }}>
                  {grouped[s.key]?.length ?? 0}
                </span>
              </button>
            );
          })}
        </nav>
        <div style={{ display: "flex", alignItems: "flex-end", gap: 14, paddingBottom: 9 }}>
          {hasContent && (
            <button
              onClick={refresh}
              aria-label="Refresh stories"
              className="mono"
              style={{ fontSize: 11, letterSpacing: "0.04em", padding: "3px 10px", border: "1px solid var(--sep)", background: "transparent", color: "var(--dim)", cursor: "pointer" }}
            >
              &#8635; Refresh
            </button>
          )}
          <div style={{ display: "flex", gap: 1 }}>
            {days.map((d, i) => (
              <button
                key={d.label}
                onClick={() => setSel(i)}
                className="mono"
                style={{ fontSize: 12, letterSpacing: "0.03em", padding: "3px 8px", border: 0, background: "transparent", cursor: "pointer", color: i === sel ? "var(--ink)" : "var(--faint)", fontWeight: i === sel ? 700 : 400 }}
              >
                {d.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {!hasContent ? (
        <div style={{ marginTop: 36, border: "1px solid var(--ruleStrong)", padding: "60px 24px", textAlign: "center", background: "var(--ph1)" }}>
          <p className="display" style={{ fontSize: 22, color: "var(--ink)", margin: 0 }}>
            No stories filed for {day?.big} yet.
          </p>
          <p className="serif" style={{ fontStyle: "italic", fontSize: 15, color: "var(--dim)", margin: "8px 0 0" }}>
            We only began keeping the archive today.
          </p>
          <button
            onClick={() => setSel(todayIdx)}
            style={{ marginTop: 20, background: "var(--accent)", color: "var(--onAccent)", border: 0, padding: "10px 20px", fontFamily: "inherit", fontSize: 13, letterSpacing: "0.1em", textTransform: "uppercase", cursor: "pointer" }}
          >
            Back to Today
          </button>
        </div>
      ) : (
        <>
          <p className="serif" style={{ fontStyle: "italic", fontSize: 16, color: "var(--muted)", margin: "16px 0 0" }}>
            {BLURBS[active]}
          </p>

          {active === "daily" && (
            <section style={{ marginTop: 30 }}>
              <div className="bs-lead">
                {lead && (
                  <article>
                    <a href={lead.url ?? "#"} target="_blank" rel="noopener noreferrer" style={{ display: "block" }}>
                      <NewsPhoto it={lead} ratio="16/9" />
                    </a>
                    <div style={{ marginTop: 16 }}>{meta(lead, "—", 11, true)}</div>
                    <a href={lead.url ?? "#"} target="_blank" rel="noopener noreferrer">
                      <h2 className="display" style={{ fontSize: "clamp(30px,3.6vw,46px)", lineHeight: 1.05, margin: "12px 0 0", color: "var(--ink)" }}>
                        {withHighlight(lead.title, lead.highlight, 4)}
                      </h2>
                    </a>
                    {lead.summary && (
                      <p className="serif" style={{ fontSize: 18, lineHeight: 1.6, color: "var(--muted)", margin: "14px 0 0", maxWidth: "60ch" }}>
                        {lead.summary}
                      </p>
                    )}
                    <div style={{ display: "flex", alignItems: "center", gap: 18, marginTop: 18 }}>
                      {reactions(lead, true)}
                      <a href={lead.url ?? "#"} target="_blank" rel="noopener noreferrer" style={{ fontStyle: "italic", fontSize: 14, color: "var(--accent)", textDecoration: "none" }}>
                        Read the full story &rarr;
                      </a>
                    </div>
                  </article>
                )}

                <div className="bs-rail">
                  {rail.map((it, i) => (
                    <article
                      key={it.id}
                      style={{ paddingBottom: 22, marginBottom: i === rail.length - 1 ? 0 : 22, borderBottom: i === rail.length - 1 ? "none" : "1px solid var(--rule)" }}
                    >
                      {meta(it, "·", 10, true)}
                      <a href={it.url ?? "#"} target="_blank" rel="noopener noreferrer">
                        <h3 className="display" style={{ fontSize: 23, lineHeight: 1.14, margin: "8px 0 0", color: "var(--ink)" }}>
                          {withHighlight(it.title, it.highlight, 3)}
                        </h3>
                      </a>
                      {it.summary && (
                        <p className="serif" style={{ fontSize: 15, lineHeight: 1.55, color: "var(--dim)", margin: "8px 0 0", display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                          {it.summary}
                        </p>
                      )}
                      <div style={{ marginTop: 12 }}>{reactions(it, true)}</div>
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
                    <span className="mono" style={{ fontSize: 11, color: "var(--faint)" }}>
                      {more.length} stories
                    </span>
                  </div>
                  <div className="bs-more">
                    {more.map((it) => (
                      <article key={it.id}>
                        <a href={it.url ?? "#"} target="_blank" rel="noopener noreferrer" style={{ display: "block", marginBottom: 13 }}>
                          <NewsPhoto it={it} ratio="16/10" />
                        </a>
                        <div>{meta(it, "·", 10, false)}</div>
                        <a href={it.url ?? "#"} target="_blank" rel="noopener noreferrer">
                          <h4 className="display" style={{ fontSize: 19, lineHeight: 1.16, margin: "8px 0 0", color: "var(--ink)" }}>
                            {it.title}
                          </h4>
                        </a>
                        {it.read_time && (
                          <div className="mono" style={{ fontSize: 11, color: "var(--faint)", marginTop: 9 }}>
                            {it.read_time} min read
                          </div>
                        )}
                        <div style={{ marginTop: 12 }}>{reactions(it, true)}</div>
                      </article>
                    ))}
                  </div>
                </>
              )}
            </section>
          )}

          {active === "tools" && (
            <section style={{ marginTop: 26 }}>
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
                          <a href={it.url ?? "#"} target="_blank" rel="noopener noreferrer">
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
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
                        {reactions(it, false)}
                        <a href={it.url ?? "#"} target="_blank" rel="noopener noreferrer" style={{ fontStyle: "italic", fontSize: 13, color: "var(--ink)", textDecoration: "none", border: "1px solid var(--sep)", padding: "7px 15px" }}>
                          Open &#8599;
                        </a>
                      </div>
                    </div>
                  </div>
                );
              })}
            </section>
          )}

          {active === "articles" && (
            <section style={{ marginTop: 20, maxWidth: 800 }}>
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
                  <a href={it.url ?? "#"} target="_blank" rel="noopener noreferrer">
                    <h2 className="display" style={{ fontSize: 30, lineHeight: 1.16, margin: "10px 0 0", color: "var(--ink)" }}>
                      {withHighlight(it.title, it.highlight, 3)}
                    </h2>
                  </a>
                  {it.summary && (
                    <p className="serif" style={{ fontSize: 18, lineHeight: 1.6, color: "var(--muted)", margin: "12px 0 0" }}>
                      {it.summary}
                    </p>
                  )}
                  <div style={{ display: "flex", alignItems: "center", gap: 14, marginTop: 14 }}>
                    {reactions(it, true)}
                    {timeAgo(it.published_at, now) && (
                      <span className="mono" style={{ fontSize: 11, color: "var(--faint)" }}>
                        {timeAgo(it.published_at, now)}
                      </span>
                    )}
                  </div>
                </article>
              ))}
            </section>
          )}
        </>
      )}

      <footer className="mono" style={{ marginTop: 64, borderTop: "3px double var(--ruleStrong)", paddingTop: 18, display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 11, letterSpacing: "0.08em", color: "var(--faint)" }}>
        <span style={{ textTransform: "uppercase" }}>Signal &mdash; printed for one reader</span>
        <span>The more you read, the sharper it gets &middot; p. 1</span>
      </footer>
    </main>
  );
}
