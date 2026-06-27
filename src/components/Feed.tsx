"use client";

import { useMemo, useState, useTransition } from "react";
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

  function vote(id: string, rating: "good" | "bad") {
    setVotes((v) => ({ ...v, [id]: rating }));
    startTransition(() => {
      recordFeedback(id, rating);
    });
  }

  return (
    <div>
      <nav className="flex flex-wrap gap-2 mb-2">
        {SECTIONS.map((s) => {
          const isActive = s.key === active;
          return (
            <button
              key={s.key}
              onClick={() => setActive(s.key)}
              className={`rounded-full px-4 py-2 text-sm font-medium transition-colors ${
                isActive
                  ? "bg-neutral-900 text-white"
                  : "bg-white text-neutral-600 border border-neutral-200 hover:border-neutral-400"
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
      <p className="text-sm text-neutral-500 mb-6">{current.blurb}</p>

      <ul className="space-y-4">
        {list.map((it, i) => {
          const voted = votes[it.id];
          return (
            <li
              key={it.id}
              className="group rounded-2xl border border-neutral-200 bg-white p-5 transition-shadow hover:shadow-md"
            >
              <div className="flex gap-4">
                <span className="mt-1 select-none text-sm font-semibold tabular-nums text-neutral-300">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <div className="flex-1">
                  <a
                    href={it.url ?? "#"}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-lg font-semibold leading-snug text-neutral-900 hover:text-indigo-600"
                  >
                    {it.title}
                  </a>
                  {it.summary && (
                    <p className="mt-1.5 text-[15px] leading-relaxed text-neutral-600">
                      {it.summary}
                    </p>
                  )}
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                    <div className="flex flex-wrap items-center gap-2 text-xs text-neutral-500">
                      {it.source && (
                        <span className="rounded-full bg-neutral-100 px-2.5 py-1 font-medium">
                          {it.source}
                        </span>
                      )}
                      {it.author && <span>{it.author}</span>}
                      {it.traction && (
                        <span className="text-neutral-400">· {it.traction}</span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => vote(it.id, "good")}
                        className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                          voted === "good"
                            ? "border-emerald-500 bg-emerald-50 text-emerald-700"
                            : "border-neutral-200 text-neutral-500 hover:border-emerald-400 hover:text-emerald-600"
                        }`}
                      >
                        👍 Good
                      </button>
                      <button
                        onClick={() => vote(it.id, "bad")}
                        className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                          voted === "bad"
                            ? "border-rose-500 bg-rose-50 text-rose-700"
                            : "border-neutral-200 text-neutral-500 hover:border-rose-400 hover:text-rose-600"
                        }`}
                      >
                        👎 Not for me
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </li>
          );
        })}
        {list.length === 0 && (
          <li className="rounded-2xl border border-dashed border-neutral-200 p-8 text-center text-sm text-neutral-400">
            Nothing here yet.
          </li>
        )}
      </ul>
    </div>
  );
}
