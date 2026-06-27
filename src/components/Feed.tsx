"use client";

import { useMemo, useState, useTransition, type MouseEvent } from "react";
import { Item, Section, SECTIONS } from "@/lib/types";
import { recordFeedback } from "@/app/actions";

export default function Feed({ items }: { items: Item[] }) {
  const [active, setActive] = useState<Section>("daily");
  const [votes, setVotes] = useState<Record<string, "good" | "bad">>({});
  const [, startTransition] = useTransition();

  const grouped = useMemo(() => {
    const g: Record<Section, Item[]> = { daily: [], tools: [], articles: [] };
    for (const it of items) g[it.section]?.push(it);
    return g;
  }, [items]);

  const current = SECTIONS.find((s) => s.key === active)!;
  const list = grouped[active] ?? [];

  function vote(id: string, rating: "good" | "bad", e?: MouseEvent) {
    e?.preventDefault();
    e?.stopPropagation();
    setVotes((v) => ({ ...v, [id]: rating }));
    startTransition(() => {
      recordFeedback(id, rating);
    });
  }

  function voteButton(it: Item, rating: "good" | "bad") {
    const sel = votes[it.id] === rating;
    const good = rating === "good";
    return (
      <button
        onClick={(e) => vote(it.id, rating, e)}
        className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
          sel
            ? good
              ? "border-[#cdff3a] bg-[#cdff3a]/15 text-[#cdff3a]"
              : "border-rose-500 bg-rose-500/15 text-rose-400"
            : "border-neutral-700 text-neutral-400 hover:border-neutral-500 hover:text-neutral-200"
        }`}
      >
        {good ? "👍 Good" : "👎 Not for me"}
      </button>
    );
  }

  return (
    <div>
      <nav className="-mx-5 mb-2 flex gap-2 overflow-x-auto px-5 pb-1 [scrollbar-width:none]">
        {SECTIONS.map((s) => {
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
              <span className="ml-2 text-xs opacity-70">
                {grouped[s.key]?.length ?? 0}
              </span>
            </button>
          );
        })}
      </nav>
      <p className="mb-6 text-sm text-neutral-500">{current.blurb}</p>

      <ul className="grid grid-cols-1 gap-6 sm:grid-cols-2">
        {list.map((it) => (
          <li
            key={it.id}
            className="flex flex-col overflow-hidden rounded-2xl border border-neutral-800 bg-[#141416] transition-colors hover:border-neutral-600"
          >
            <a
              href={it.url ?? "#"}
              target="_blank"
              rel="noopener noreferrer"
              className="block"
            >
              <div className="relative aspect-video w-full bg-neutral-900">
                {it.image_url && (
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
              </div>
              <div className="p-5">
                <h3 className="text-xl font-bold leading-tight text-white">
                  {it.title}
                </h3>
                {it.summary && (
                  <p className="serif mt-2.5 text-[15px] leading-relaxed text-neutral-400">
                    {it.summary}
                  </p>
                )}
              </div>
            </a>
            <div className="mt-auto flex gap-2 px-5 pb-5">
              {voteButton(it, "good")}
              {voteButton(it, "bad")}
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
