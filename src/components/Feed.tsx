"use client";

import {
  useMemo,
  useState,
  useTransition,
  type MouseEvent,
  type ReactNode,
} from "react";
import { Item, Section, SECTIONS } from "@/lib/types";
import { recordSignal } from "@/app/actions";
import { timeAgo } from "@/lib/time";

type Day = { label: string; big: string; full: string };

const FULL = [
  "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday",
];

const HEART =
  "M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8l1.1 1L12 21l7.7-7.6 1.1-1a5.5 5.5 0 0 0 0-7.8z";

const STRIPES =
  "repeating-linear-gradient(135deg,#141312,#141312 11px,#17150f 11px,#17150f 22px)";

function withHighlight(title: string, h: string | null, px = 4): ReactNode {
  if (!h) return title;
  const i = title.indexOf(h);
  if (i < 0) return title;
  return (
    <>
      {title.slice(0, i)}
      <span style={{ borderBottom: `${px}px solid #e3a44e`, paddingBottom: "1px" }}>
        {h}
      </span>
      {title.slice(i + h.length)}
    </>
  );
}

function hideImg(e: React.SyntheticEvent<HTMLImageElement>) {
  e.currentTarget.style.display = "none";
}

export default function Feed({
  items,
  days,
  todayIdx,
  now,
}: {
  items: Item[];
  days: Day[];
  todayIdx: number;
  now: number;
}) {
  const [active, setActive] = useState<Section>("daily");
  const [sel, setSel] = useState(todayIdx);
  const [offsets, setOffsets] = useState<Record<Section, number>>({
    daily: 0,
    tools: 0,
    articles: 0,
  });
  const [signals, setSignals] = useState<Record<string, "like" | "less">>({});
  const [, startTransition] = useTransition();

  const grouped = useMemo(() => {
    const g: Record<Section, Item[]> = { daily: [], tools: [], articles: [] };
    for (const it of items) g[it.section]?.push(it);
    return g;
  }, [items]);

  const isToday = sel === todayIdx;
  const current = SECTIONS.find((s) => s.key === active)!;
  const baseList = grouped[active] ?? [];
  const off = baseList.length ? offsets[active] % baseList.length : 0;
  const list = off
    ? [...baseList.slice(off), ...baseList.slice(0, off)]
    : baseList;

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

  function reactions(it: Item, withLess: boolean) {
    const s = signals[it.id];
    return (
      <div className="flex gap-2">
        <button
          onClick={(e) => signal(it, "like", e)}
          title="More like this"
          aria-label="More like this"
          className="flex h-8 w-8 items-center justify-center rounded-full border transition-colors"
          style={{
            borderColor: s === "like" ? "#cdff3a" : "#2a2825",
            background: s === "like" ? "#cdff3a" : "transparent",
            color: s === "like" ? "#0a0a0b" : "#a3a097",
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
            className="flex h-8 w-8 items-center justify-center rounded-full border transition-colors"
            style={{
              borderColor: "#2a2825",
              background: s === "less" ? "#2a2825" : "transparent",
              color: s === "less" ? "#f5f3ec" : "#a3a097",
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

  function kicker(
    it: Item,
    opts: { small?: boolean; read?: "none" | "short" | "full" } = {}
  ) {
    const ago = timeAgo(it.published_at, now);
    const read = opts.read ?? "none";
    const sep = <span style={{ color: "#3a3833" }}>/</span>;
    return (
      <div
        className={`flex items-center gap-2 uppercase ${opts.small ? "text-[10px]" : "text-[11px]"}`}
        style={{ letterSpacing: "0.09em", color: "#a3a097" }}
      >
        <span className="font-semibold" style={{ color: opts.small ? "#b4b1a8" : "#cbc8bf" }}>
          {it.source}
        </span>
        {ago && (
          <>
            {sep}
            <span>{ago}</span>
          </>
        )}
        {read !== "none" && it.read_time && (
          <>
            {sep}
            <span>
              {it.read_time} min{read === "full" ? " read" : ""}
            </span>
          </>
        )}
      </div>
    );
  }

  const lead = list[0];
  const rail = list.slice(1, 3);
  const more = list.slice(3);

  return (
    <div>
      <div className="flex items-end justify-between gap-6 pt-[18px]">
        <div>
          <div className="mb-2 uppercase text-[12px] text-[#56534c]" style={{ letterSpacing: "0.18em" }}>
            {isToday ? `${FULL[sel]} · Today's edition` : FULL[sel]}
          </div>
          <h1 className="display m-0 font-extrabold leading-[0.98] tracking-[-0.01em] text-[#f5f3ec] text-[clamp(34px,5vw,52px)]">
            {days[sel]?.big}
          </h1>
        </div>
        <div className="flex items-center gap-3">
          {isToday && (
            <button
              onClick={refresh}
              aria-label="Refresh stories"
              className="inline-flex items-center gap-1.5 rounded-full border border-[#2a2825] px-3 py-1.5 text-[12px] text-[#a3a097] transition-colors hover:border-[#e3a44e] hover:text-[#e3a44e]"
            >
              <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 12a9 9 0 0 1 15-6.7L21 8" />
                <path d="M21 3v5h-5" />
                <path d="M21 12a9 9 0 0 1-15 6.7L3 16" />
                <path d="M3 21v-5h5" />
              </svg>
              Refresh
            </button>
          )}
          <div className="flex gap-0.5">
            {days.map((dy, i) => (
              <button
                key={dy.label}
                onClick={() => setSel(i)}
                className="rounded-[7px] px-[9px] py-1 text-[13px] transition-colors"
                style={{ color: i === sel ? "#f5f3ec" : "#56534c", fontWeight: i === sel ? 600 : 400 }}
              >
                {dy.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <nav className="mt-7 flex gap-[30px] border-b border-[#232220]">
        {SECTIONS.map((s) => {
          const a = s.key === active;
          return (
            <button
              key={s.key}
              onClick={() => setActive(s.key)}
              className="-mb-px inline-flex items-baseline gap-[7px] pb-[14px] text-[15px] font-semibold tracking-[-0.01em]"
              style={{
                borderBottom: a ? "2px solid #e3a44e" : "2px solid transparent",
                color: a ? "#f5f3ec" : "#807c72",
              }}
            >
              <span>{s.label}</span>
              <span className="font-mono text-[11px]" style={{ color: a ? "#e3a44e" : "#56534c" }}>
                {grouped[s.key]?.length ?? 0}
              </span>
            </button>
          );
        })}
      </nav>

      {!isToday ? (
        <div className="mt-10 rounded-[6px] border border-dashed border-[#2a2825] px-6 py-16 text-center">
          <p className="serif m-0 text-[18px] text-[#a3a097]">
            No stories archived for {days[sel]?.big} yet.
          </p>
          <p className="mt-2 text-[13px] text-[#56534c]">
            We only started keeping the archive today.
          </p>
          <button
            onClick={() => setSel(todayIdx)}
            className="mt-[22px] rounded-full bg-[#cdff3a] px-5 py-2.5 text-[14px] font-bold text-[#0a0a0b]"
          >
            Back to today
          </button>
        </div>
      ) : (
        <>
          <p className="serif mt-3.5 text-[16px] italic text-[#a3a097]">{current.blurb}</p>

          {active === "daily" && (
            <section className="mt-[34px]">
              <div className="grid gap-[46px] lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
                {lead && (
                  <article className="min-w-0">
                    <a href={lead.url ?? "#"} target="_blank" rel="noopener noreferrer" className="block">
                      <div
                        className="aspect-video w-full overflow-hidden rounded-[3px]"
                        style={lead.image_url ? undefined : { background: STRIPES }}
                      >
                        {lead.image_url && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={lead.image_url} alt="" onError={hideImg} className="h-full w-full object-cover" />
                        )}
                      </div>
                    </a>
                    <div className="mt-[18px]">{kicker(lead, { read: "full" })}</div>
                    <a href={lead.url ?? "#"} target="_blank" rel="noopener noreferrer">
                      <h2 className="display mt-3.5 font-extrabold leading-[1.04] tracking-[-0.015em] text-[#f5f3ec] text-[clamp(28px,3.6vw,42px)]">
                        {withHighlight(lead.title, lead.highlight, 4)}
                      </h2>
                    </a>
                    {lead.summary && (
                      <p className="serif mt-4 max-w-[56ch] text-[19px] leading-[1.5] text-[#a3a097]">
                        {lead.summary}
                      </p>
                    )}
                    <div className="mt-5 flex items-center gap-[18px]">
                      {reactions(lead, true)}
                      <a href={lead.url ?? "#"} target="_blank" rel="noopener noreferrer" className="text-[13px] font-semibold text-[#e3a44e] hover:text-[#f0bd70]">
                        Read story →
                      </a>
                    </div>
                  </article>
                )}

                <div className="flex flex-col">
                  {rail.map((it, i) => (
                    <article
                      key={it.id}
                      className="pb-[22px]"
                      style={{
                        marginBottom: i === rail.length - 1 ? 0 : 22,
                        borderBottom: i === rail.length - 1 ? "none" : "1px solid #232220",
                      }}
                    >
                      {kicker(it, { read: "short" })}
                      <a href={it.url ?? "#"} target="_blank" rel="noopener noreferrer">
                        <h3 className="display mt-2.5 text-[22px] font-bold leading-[1.16] tracking-[-0.01em] text-[#f5f3ec]">
                          {withHighlight(it.title, it.highlight, 3)}
                        </h3>
                      </a>
                      {it.summary && (
                        <p className="serif mt-2.5 line-clamp-2 text-[15px] leading-[1.5] text-[#807c72]">
                          {it.summary}
                        </p>
                      )}
                    </article>
                  ))}
                </div>
              </div>

              {more.length > 0 && (
                <>
                  <div className="mb-[26px] mt-[58px] flex items-center gap-4">
                    <span className="whitespace-nowrap font-mono text-[12px] uppercase text-[#56534c]" style={{ letterSpacing: "0.13em" }}>
                      More today
                    </span>
                    <span className="h-px flex-1 bg-[#232220]" />
                    <span className="font-mono text-[12px] text-[#56534c]">{more.length} stories</span>
                  </div>
                  <div className="grid grid-cols-2 gap-x-8 gap-y-[34px] lg:grid-cols-3">
                    {more.map((it) => (
                      <article key={it.id}>
                        <a href={it.url ?? "#"} target="_blank" rel="noopener noreferrer" className="block">
                          <div
                            className="mb-3.5 aspect-[16/10] w-full overflow-hidden rounded-[3px]"
                            style={it.image_url ? undefined : { background: STRIPES }}
                          >
                            {it.image_url && (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={it.image_url} alt="" loading="lazy" onError={hideImg} className="h-full w-full object-cover" />
                            )}
                          </div>
                          <div className="mb-2.5">{kicker(it, { small: true })}</div>
                          <h4 className="text-[17px] font-bold leading-[1.26] tracking-[-0.01em] text-[#f5f3ec]">
                            {it.title}
                          </h4>
                        </a>
                        {it.read_time && (
                          <div className="mt-2.5 font-mono text-[11px] text-[#56534c]">
                            {it.read_time} min read
                          </div>
                        )}
                      </article>
                    ))}
                  </div>
                </>
              )}
            </section>
          )}

          {active === "tools" && (
            <section className="mt-[30px]">
              {list.map((it, i) => {
                const skill = it.title.toLowerCase().includes("skill");
                return (
                  <div
                    key={it.id}
                    className="pb-[22px]"
                    style={{
                      marginBottom: i === list.length - 1 ? 0 : 22,
                      borderBottom: i === list.length - 1 ? "none" : "1px solid #232220",
                    }}
                  >
                    <div className="flex items-start gap-5">
                      <span className="display min-w-[38px] text-[30px] font-bold leading-none text-[#3f3d37]">
                        {String(i + 1).padStart(2, "0")}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2.5">
                          <a href={it.url ?? "#"} target="_blank" rel="noopener noreferrer">
                            <h3 className="text-[18px] font-bold tracking-[-0.01em] text-[#f5f3ec]">
                              {it.title.replace(/\s*\(Claude skill\)$/, "")}
                            </h3>
                          </a>
                          <span
                            className="rounded-full border px-[9px] py-0.5 text-[11px] font-semibold"
                            style={{ borderColor: skill ? "#e3a44e" : "#2a2825", color: skill ? "#e3a44e" : "#807c72" }}
                          >
                            {skill ? "Claude skill" : "Tool"}
                          </span>
                          {it.traction && (
                            <span className="font-mono text-[11px] text-[#56534c]">{it.traction}</span>
                          )}
                        </div>
                        {it.summary && (
                          <p className="serif mt-1.5 text-[15px] leading-[1.45] text-[#807c72]">{it.summary}</p>
                        )}
                      </div>
                      <div className="flex shrink-0 items-center gap-2.5">
                        {reactions(it, false)}
                        <a
                          href={it.url ?? "#"}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="rounded-full border border-[#2a2825] px-4 py-2 text-[13px] font-semibold text-[#f5f3ec] transition-colors hover:border-[#e3a44e] hover:text-[#e3a44e]"
                        >
                          Open ↗
                        </a>
                      </div>
                    </div>
                  </div>
                );
              })}
            </section>
          )}

          {active === "articles" && (
            <section className="mt-[18px] max-w-[780px]">
              {list.map((it, i) => (
                <article
                  key={it.id}
                  className="pb-[26px]"
                  style={{
                    marginBottom: i === list.length - 1 ? 0 : 26,
                    borderBottom: i === list.length - 1 ? "none" : "1px solid #232220",
                  }}
                >
                  <div className="flex items-baseline justify-between gap-4">
                    <span className="text-[11px] font-semibold uppercase text-[#b4b1a8]" style={{ letterSpacing: "0.09em" }}>
                      {it.source}
                    </span>
                    {it.read_time && (
                      <span className="whitespace-nowrap font-mono text-[11px] text-[#56534c]">
                        {it.read_time} min read
                      </span>
                    )}
                  </div>
                  <a href={it.url ?? "#"} target="_blank" rel="noopener noreferrer">
                    <h2 className="display mt-2.5 text-[28px] font-bold leading-[1.18] tracking-[-0.01em] text-[#f5f3ec]">
                      {withHighlight(it.title, it.highlight, 3)}
                    </h2>
                  </a>
                  {it.summary && (
                    <p className="serif mt-3 text-[18px] leading-[1.55] text-[#a3a097]">{it.summary}</p>
                  )}
                  <div className="mt-4 flex items-center gap-3.5">
                    {reactions(it, true)}
                    {timeAgo(it.published_at, now) && (
                      <span className="font-mono text-[11px] text-[#56534c]">
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
    </div>
  );
}
