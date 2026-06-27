"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
  type MouseEvent,
  type ReactNode,
} from "react";
import { Item, Section, SECTIONS } from "@/lib/types";
import { recordSignal } from "@/app/actions";

type Day = { label: string; big: string; full: string };

function withHighlight(title: string, h: string | null): ReactNode {
  if (!h) return title;
  const i = title.indexOf(h);
  if (i < 0) return title;
  return (
    <>
      {title.slice(0, i)}
      <span style={{ borderBottom: "4px solid #cdff3a" }}>{h}</span>
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
}: {
  items: Item[];
  days: Day[];
  todayIdx: number;
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
  const scroller = useRef<HTMLUListElement>(null);

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
  const isTools = active === "tools";
  const featured = list.slice(0, 5);
  const right = list.slice(5, 7);
  const fullDate = days[sel]?.full ?? "";

  useEffect(() => {
    if (!isToday || isTools) return;
    const el = scroller.current;
    if (!el || featured.length <= 1) return;
    const id = setInterval(() => {
      if (el.scrollLeft + el.clientWidth >= el.scrollWidth - 8) {
        el.scrollTo({ left: 0, behavior: "smooth" });
      } else {
        el.scrollBy({ left: el.clientWidth, behavior: "smooth" });
      }
    }, 5000);
    return () => clearInterval(id);
  }, [active, sel, isToday, isTools, featured.length]);

  function signal(it: Item, action: "like" | "less", e: MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    setSignals((s) => ({ ...s, [it.id]: action }));
    startTransition(() => {
      recordSignal(it.id, action, it.tags ?? []);
    });
  }

  function controls(it: Item) {
    const s = signals[it.id];
    return (
      <div className="absolute right-2 top-2 flex gap-1.5">
        <button title="More like this" aria-label="More like this" onClick={(e) => signal(it, "like", e)}
          className={`flex h-8 w-8 items-center justify-center rounded-full backdrop-blur transition-colors ${s === "like" ? "bg-[#cdff3a] text-black" : "bg-black/55 text-white hover:bg-black/75"}`}>
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill={s === "like" ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8l1.1 1L12 21l7.7-7.6 1.1-1a5.5 5.5 0 0 0 0-7.8z" /></svg>
        </button>
        <button title="Less like this" aria-label="Less like this" onClick={(e) => signal(it, "less", e)}
          className={`flex h-8 w-8 items-center justify-center rounded-full backdrop-blur transition-colors ${s === "less" ? "bg-neutral-200 text-black" : "bg-black/55 text-white hover:bg-black/75"}`}>
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14" /></svg>
        </button>
      </div>
    );
  }

  function move(dir: number) {
    const el = scroller.current;
    if (el) el.scrollBy({ left: dir * el.clientWidth, behavior: "smooth" });
  }

  function refresh() {
    const len = (grouped[active] ?? []).length;
    if (!len) return;
    const step = Math.max(1, Math.floor(len / 2));
    setOffsets((o) => ({ ...o, [active]: (o[active] + step) % len }));
    scroller.current?.scrollTo({ left: 0 });
  }

  return (
    <div>
      <div className="mb-3 flex gap-1 text-sm">
        {days.map((d, i) => (
          <button
            key={d.label}
            onClick={() => setSel(i)}
            className={`rounded-md px-2 py-1 transition-colors ${
              i === sel
                ? "font-medium text-[#cdff3a]"
                : "text-neutral-500 hover:text-neutral-300"
            }`}
          >
            {d.label}
          </button>
        ))}
      </div>
      <div className="mb-7 flex items-end justify-between">
        <h2 className="display text-4xl font-extrabold leading-none text-white sm:text-5xl">
          {days[sel]?.big}
        </h2>
        {isToday && (
          <div className="flex items-center gap-2.5">
            <button
              onClick={refresh}
              aria-label="Refresh stories"
              className="inline-flex items-center gap-1.5 rounded-full border border-neutral-700 px-3 py-1.5 text-xs text-neutral-300 transition-colors hover:border-[#cdff3a] hover:text-[#cdff3a]"
            >
              <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 12a9 9 0 0 1 15-6.7L21 8" />
                <path d="M21 3v5h-5" />
                <path d="M21 12a9 9 0 0 1-15 6.7L3 16" />
                <path d="M3 21v-5h5" />
              </svg>
              Refresh
            </button>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-neutral-700 px-3 py-1.5 text-xs text-[#cde87a]">
              <span className="h-1.5 w-1.5 rounded-full bg-[#cdff3a]" />
              New today
            </span>
          </div>
        )}
      </div>

      {!isToday ? (
        <div className="mt-2 rounded-2xl border border-dashed border-neutral-800 p-14 text-center">
          <p className="text-neutral-400">No stories archived for {days[sel]?.big} yet.</p>
          <p className="mt-1 text-sm text-neutral-600">We only started keeping the archive today.</p>
          <button
            onClick={() => setSel(todayIdx)}
            className="mt-5 rounded-full bg-[#cdff3a] px-4 py-2 text-sm font-semibold text-black"
          >
            Back to today
          </button>
        </div>
      ) : (
        <>
          <nav className="-mx-5 flex gap-2 overflow-x-auto px-5 pb-1 [scrollbar-width:none]">
            {SECTIONS.map((s) => {
              const isActive = s.key === active;
              return (
                <button key={s.key} onClick={() => setActive(s.key)}
                  className={`shrink-0 whitespace-nowrap rounded-full px-4 py-2 text-sm font-semibold transition-colors ${isActive ? "bg-[#cdff3a] text-black" : "border border-neutral-700 bg-transparent text-neutral-400 hover:border-neutral-500 hover:text-white"}`}>
                  {s.label}
                </button>
              );
            })}
          </nav>
          <p className="mb-6 mt-2 text-sm text-neutral-500">{current.blurb}</p>

          {isTools ? (
            <ul className="overflow-hidden rounded-2xl border border-neutral-800 bg-[#141416]">
              {list.map((it, i) => {
                const isSkill = it.title.toLowerCase().includes("skill");
                const s = signals[it.id];
                return (
                  <li key={it.id} className="flex items-center gap-3 border-b border-neutral-800 p-4 last:border-b-0 sm:gap-4">
                    <span className="hidden h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-neutral-800 text-sm font-bold text-neutral-400 sm:flex">{i + 1}</span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <a href={it.url ?? "#"} target="_blank" rel="noopener noreferrer">
                          <h3 className="font-bold text-white hover:text-[#cdff3a]">{it.title.replace(/\s*\(Claude skill\)$/, "")}</h3>
                        </a>
                        <span className="rounded-full border border-neutral-700 px-2 py-0.5 text-[11px] font-medium text-neutral-400">{isSkill ? "Claude skill" : "Tool"}</span>
                        {it.traction && <span className="text-[11px] text-neutral-500">{it.traction}</span>}
                      </div>
                      {it.summary && <p className="serif mt-0.5 line-clamp-1 text-sm text-neutral-400">{it.summary}</p>}
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5">
                      <button title="More like this" aria-label="More like this" onClick={(e) => signal(it, "like", e)}
                        className={`flex h-8 w-8 items-center justify-center rounded-full transition-colors ${s === "like" ? "bg-[#cdff3a] text-black" : "text-neutral-500 hover:text-white"}`}>
                        <svg viewBox="0 0 24 24" className="h-4 w-4" fill={s === "like" ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8l1.1 1L12 21l7.7-7.6 1.1-1a5.5 5.5 0 0 0 0-7.8z" /></svg>
                      </button>
                      <a href={it.url ?? "#"} target="_blank" rel="noopener noreferrer" className="rounded-full border border-neutral-700 px-3.5 py-1.5 text-xs font-semibold text-white transition-colors hover:border-[#cdff3a] hover:text-[#cdff3a]">Open ↗</a>
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : (
            <>
              <div className="grid gap-6 lg:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]">
                <div className="min-w-0">
                  <ul ref={scroller} className="flex snap-x snap-mandatory gap-4 overflow-x-auto pb-1 [scrollbar-width:none]">
                    {featured.map((it) => (
                      <li key={it.id} className="w-full min-w-0 shrink-0 snap-start">
                        <div className="overflow-hidden rounded-2xl border border-neutral-800 bg-[#141416]">
                          <a href={it.url ?? "#"} target="_blank" rel="noopener noreferrer" className="relative block">
                            <div className="relative h-56 w-full bg-neutral-900 sm:h-64">
                              {it.image_url && (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={it.image_url} alt="" onError={hideImg} className="h-full w-full object-cover" />
                              )}
                              {controls(it)}
                            </div>
                          </a>
                          <div className="p-5">
                            <div className="mb-2 text-xs text-neutral-500">{it.source} · {fullDate}</div>
                            <a href={it.url ?? "#"} target="_blank" rel="noopener noreferrer">
                              <h3 className="display text-2xl font-extrabold leading-tight text-white">{withHighlight(it.title, it.highlight)}</h3>
                            </a>
                            {it.summary && <p className="serif mt-2.5 line-clamp-2 text-sm leading-relaxed text-neutral-400">{it.summary}</p>}
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                  {featured.length > 1 && (
                    <div className="mt-3 flex justify-end gap-2">
                      <button onClick={() => move(-1)} aria-label="Previous" className="flex h-9 w-9 items-center justify-center rounded-full border border-neutral-700 text-neutral-300 transition-colors hover:border-neutral-500 hover:text-white">←</button>
                      <button onClick={() => move(1)} aria-label="Next" className="flex h-9 w-9 items-center justify-center rounded-full border border-neutral-700 text-neutral-300 transition-colors hover:border-neutral-500 hover:text-white">→</button>
                    </div>
                  )}
                </div>

                <div className="flex flex-col gap-4">
                  {right.map((it) => (
                    <a key={it.id} href={it.url ?? "#"} target="_blank" rel="noopener noreferrer" className="block rounded-2xl border border-neutral-800 bg-[#141416] p-5 transition-colors hover:border-neutral-600">
                      <div className="mb-2 text-xs text-neutral-500">{it.source} · {fullDate}</div>
                      <h3 className="display text-lg font-bold leading-snug text-white">{withHighlight(it.title, it.highlight)}</h3>
                      {it.summary && <p className="serif mt-2 line-clamp-3 text-sm leading-relaxed text-neutral-400">{it.summary}</p>}
                    </a>
                  ))}
                </div>
              </div>

              {list.length > 0 && (
                <>
                  <h3 className="mb-4 mt-12 text-sm font-medium uppercase tracking-wide text-neutral-500">All stories</h3>
                  <ul className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
                    {list.map((it) => (
                      <li key={it.id}>
                        <div className="flex h-full flex-col overflow-hidden rounded-2xl border border-neutral-800 bg-[#141416]">
                          <a href={it.url ?? "#"} target="_blank" rel="noopener noreferrer" className="relative block">
                            <div className="relative h-40 w-full bg-neutral-900">
                              {it.image_url && (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={it.image_url} alt="" loading="lazy" onError={hideImg} className="h-full w-full object-cover" />
                              )}
                              {controls(it)}
                            </div>
                          </a>
                          <div className="flex flex-1 flex-col p-4">
                            <a href={it.url ?? "#"} target="_blank" rel="noopener noreferrer">
                              <h3 className="text-base font-bold leading-snug text-white">{it.title}</h3>
                            </a>
                            {it.summary && <p className="serif mt-2 line-clamp-2 text-sm leading-relaxed text-neutral-400">{it.summary}</p>}
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
