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
  const compact = active === "daily";

  function vote(id: string, rating: "good" | "bad", e?: MouseEvent) {
    e?.preventDefault();
    e?.stopPropagation();
    setVotes((v) => ({ ...v, [id]: rating }));
    startTransition(() => {
      recordFeedback(id, rating);
    });
  }

  function voteButton(it: Item, rating: "good" | "bad", small: boolean) {
    const sel = votes[it.id] === rating;
    const good = rating === "good";
    if (small) {
      return (
        <button
          onClick={(e) => vote(it.id, rating, e)}
          aria-label={good ? "Good" : "Not for me"}
          className={`flex h-7 w-7 items-center justify-center rounded-full text-xs backdrop-blur transition-colors ${
            sel
              ? good
                ? "bg-emerald-500 text-white"
                : "bg-rose-500 text-white"
              : "bg-black/45 text-white hover:bg-black/65"
          }`}
        >
          {good ? "👍" : "👎"}
        </button>
      );
    }
    return (
      <button
        onClick={(e) => vote(it.id, rating, e)}
        className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
          sel
            ? good
              ? "border-emerald-500 bg-emerald-50 text-emerald-700"
              : "border-rose-500 bg-rose-50 text-rose-700"
            : "border-neutral-200 text-neutral-500 hover:border-neutral-400"
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
              className={`shrink-0 whitespace-nowrap rounded-full px-4 py-2 text-sm font-medium transition-colors ${
                isActive
                  ? "bg-neutral-900 text-white"
                  : "border border-neutral-200 bg-white text-neutral-600 hover:border-neutral-400"
              }`}
            >
              {s.label}
              <span className="ml-2 text-xs opacity-60">
                {grouped[s.key]?.length ?? 0}
              </span>
            </button>
          );
        })}
      </nav>
      <p className="mb-5 text-sm text-neutral-500">{current.blurb}</p>

      <ul
        className={
          compact
            ? "grid grid-cols-2 gap-3 lg:grid-cols-3"
            : "grid grid-cols-1 gap-4 sm:grid-cols-2"
        }
      >
        {list.map((it) =>
          compact ? (
            <li
              key={it.id}
              className="relative aspect-[4/3] overflow-hidden rounded-xl border border-neutral-200 bg-neutral-900"
            >
              <a
                href={it.url ?? "#"}
                target="_blank"
                rel="noopener noreferrer"
                className="block h-full w-full"
              >
                {it.image_url && (
                  <img
                    src={it.image_url}
                    alt=""
                    loading="lazy"
                    onError={(e) => {
                      e.currentTarget.style.display = "none";
                    }}
                    className="absolute inset-0 h-full w-full object-cover"
                  />
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-black/10" />
                <h3 className="absolute inset-x-0 bottom-0 line-clamp-4 p-2.5 text-[13px] font-semibold leading-snug text-white">
                  {it.title}
                </h3>
              </a>
              <div className="absolute right-1.5 top-1.5 flex gap-1">
                {voteButton(it, "good", true)}
                {voteButton(it, "bad", true)}
              </div>
            </li>
          ) : (
            <li
              key={it.id}
              className="flex flex-col overflow-hidden rounded-2xl border border-neutral-200 bg-white transition-shadow hover:shadow-md"
            >
              <a
                href={it.url ?? "#"}
                target="_blank"
                rel="noopener noreferrer"
                className="block"
              >
                <div className="relative aspect-video w-full bg-gradient-to-br from-neutral-100 to-neutral-200">
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
                    <span className="absolute left-2 top-2 rounded-full bg-black/70 px-2 py-0.5 text-xs font-medium text-white">
                      {it.traction}
                    </span>
                  )}
                </div>
                <div className="p-4">
                  <h3 className="line-clamp-2 font-semibold leading-snug text-neutral-900">
                    {it.title}
                  </h3>
                  {it.summary && (
                    <p className="mt-1.5 line-clamp-3 text-sm leading-relaxed text-neutral-600">
                      {it.summary}
                    </p>
                  )}
                </div>
              </a>
              <div className="mt-auto flex gap-2 px-4 pb-4">
                {voteButton(it, "good", false)}
                {voteButton(it, "bad", false)}
              </div>
            </li>
          )
        )}
        {list.length === 0 && (
          <li className="col-span-full rounded-2xl border border-dashed border-neutral-200 p-8 text-center text-sm text-neutral-400">
            Nothing here yet.
          </li>
        )}
      </ul>
    </div>
  );
}
