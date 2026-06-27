"use client";

import { useMemo, useState, useTransition, type MouseEvent } from "react";
import { Item, Section, SECTIONS } from "@/lib/types";
import { recordSignal } from "@/app/actions";

export default function Feed({ items }: { items: Item[] }) {
  const [active, setActive] = useState<Section>("tools");
  const [signals, setSignals] = useState<Record<string, "like" | "less">>({});
  const [, startTransition] = useTransition();

  const grouped = useMemo(() => {
    const g: Record<Section, Item[]> = { daily: [], tools: [], articles: [] };
    for (const it of items) g[it.section]?.push(it);
    return g;
  }, [items]);

  const current = SECTIONS.find((s) => s.key === active)!;
  const list = grouped[active] ?? [];
  const featured = list[0];
  const rest = list.slice(1);

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
        <button
          title="More like this"
          aria-label="More like this"
          onClick={(e) => signal(it, "like", e)}
          className={`flex h-8 w-8 items-center justify-center rounded-full backdrop-blur transition-colors ${
            s === "like"
              ? "bg-[#cdff3a] text-black"
              : "bg-black/55 text-white hover:bg-black/75"
          }`}
        >
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill={s === "like" ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8l1.1 1L12 21l7.7-7.6 1.1-1a5.5 5.5 0 0 0 0-7.8z" />
          </svg>
        </button>
        <button
          title="Less like this"
          aria-label="Less like this"
          onClick={(e) => signal(it, "less", e)}
          className={`flex h-8 w-8 items-center justify-center rounded-full backdrop-blur transition-colors ${
            s === "less"
              ? "bg-neutral-200 text-black"
              : "bg-black/55 text-white hover:bg-black/75"
          }`}
        >
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 12h14" />
          </svg>
        </button>
      </div>
    );
  }

  return (
    <div>
      <nav className="-mx-5 mb-2 flex gap-2 overflow-x-auto px-5 pb-1 [scrollbar-width:none]">
        {SECTIONS.filter((s) => s.key !== "daily").map((s) => {
          const isActive = s.key === active;
          return (
            <button
              key={s.key}
              onClick={() => setActive(s.key)}
              className={`shrink-0 whitespace-nowrap rounded-full px-4 py-2 text-sm font-semibold transition-colors ${
                isActive
                  ? "bg-[#cdff3a] text-black"
                  : "border border-neutral-700 bg-transparent text-neutral-400 hover:border-neutral-500 hover:text-white"
              }`}
            >
              {s.label}
            </button>
          );
        })}
      </nav>
      <p className="mb-6 text-sm text-neutral-500">{current.blurb}</p>

      <ul className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {featured && (
          <li className="sm:col-span-2 lg:col-span-3">
            <div className="group overflow-hidden rounded-2xl border border-neutral-800 bg-[#141416] transition-colors hover:border-neutral-600 sm:flex">
              <a
                href={featured.url ?? "#"}
                target="_blank"
                rel="noopener noreferrer"
                className="relative block sm:w-3/5"
              >
                <div className="relative aspect-video w-full bg-neutral-900">
                  {featured.image_url && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={featured.image_url}
                      alt=""
                      onError={(e) => {
                        e.currentTarget.style.display = "none";
                      }}
                      className="h-full w-full object-cover"
                    />
                  )}
                  {featured.traction && (
                    <span className="absolute left-2.5 top-2.5 rounded-full bg-black/75 px-2.5 py-1 text-xs font-medium text-white">
                      {featured.traction}
                    </span>
                  )}
                  {controls(featured)}
                </div>
              </a>
              <div className="flex flex-col justify-center p-5 sm:w-2/5 sm:p-7">
                <a
                  href={featured.url ?? "#"}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <h3 className="text-2xl font-extrabold leading-tight text-white sm:text-3xl">
                    {featured.title}
                  </h3>
                </a>
                {featured.summary && (
                  <p className="serif mt-3 text-base leading-relaxed text-neutral-400">
                    {featured.summary}
                  </p>
                )}
              </div>
            </div>
          </li>
        )}

        {rest.map((it) => (
          <li key={it.id}>
            <div className="group flex h-full flex-col overflow-hidden rounded-2xl border border-neutral-800 bg-[#141416] transition-colors hover:border-neutral-600">
              <a
                href={it.url ?? "#"}
                target="_blank"
                rel="noopener noreferrer"
                className="block"
              >
                <div className="relative aspect-video w-full bg-neutral-900">
                  {it.image_url && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={it.image_url}
                      alt=""
                      loading="lazy"
                      onError={(e) => {
                        e.currentTarget.style.display = "none";
                      }}
                      className="h-full w-full object-cover"
                    />
                  )}
                  {it.traction && (
                    <span className="absolute left-2.5 top-2.5 rounded-full bg-black/75 px-2.5 py-1 text-xs font-medium text-white">
                      {it.traction}
                    </span>
                  )}
                  {controls(it)}
                </div>
              </a>
              <div className="flex flex-1 flex-col p-4">
                <a
                  href={it.url ?? "#"}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <h3 className="text-lg font-bold leading-snug text-white">
                    {it.title}
                  </h3>
                </a>
                {it.summary && (
                  <p className="serif mt-2 line-clamp-3 text-sm leading-relaxed text-neutral-400">
                    {it.summary}
                  </p>
                )}
              </div>
            </div>
          </li>
        ))}

        {list.length === 0 && (
          <li className="col-span-full rounded-2xl border border-dashed border-neutral-700 p-8 text-center text-sm text-neutral-500">
            Nothing here yet.
          </li>
        )}
      </ul>
    </div>
  );
}
