"use client";

import { useRef, type ReactNode } from "react";
import { Item } from "@/lib/types";

const WEEK = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

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

export default function Hero({
  items,
  bigDate,
  fullDate,
  today,
}: {
  items: Item[];
  bigDate: string;
  fullDate: string;
  today: string;
}) {
  const scroller = useRef<HTMLUListElement>(null);
  if (!items.length) return null;

  const right = items.slice(0, 2);
  const carousel = items.length > 2 ? items.slice(2) : items;

  function move(dir: number) {
    const el = scroller.current;
    if (el) el.scrollBy({ left: dir * el.clientWidth, behavior: "smooth" });
  }

  return (
    <section className="mb-14">
      <div className="mb-3 flex gap-4 text-sm text-neutral-500">
        {WEEK.map((d) => (
          <span key={d} className={d === today ? "font-medium text-[#cdff3a]" : ""}>
            {d}
          </span>
        ))}
      </div>
      <div className="mb-7 flex items-end justify-between">
        <h2 className="display text-5xl font-extrabold leading-none text-white sm:text-6xl">
          {bigDate}
        </h2>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-neutral-700 px-3 py-1.5 text-xs text-[#cde87a]">
          <span className="h-1.5 w-1.5 rounded-full bg-[#cdff3a]" />
          New today
        </span>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.55fr_1fr]">
        <div>
          <ul
            ref={scroller}
            className="flex snap-x snap-mandatory gap-4 overflow-x-auto pb-1 [scrollbar-width:none]"
          >
            {carousel.map((it) => (
              <li key={it.id} className="w-full shrink-0 snap-start">
                <a
                  href={it.url ?? "#"}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block overflow-hidden rounded-2xl border border-neutral-800 bg-[#141416] transition-colors hover:border-neutral-600"
                >
                  <div className="aspect-video w-full bg-neutral-900">
                    {it.image_url && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={it.image_url}
                        alt=""
                        onError={hideImg}
                        className="h-full w-full object-cover"
                      />
                    )}
                  </div>
                  <div className="p-5">
                    <div className="mb-2 text-xs text-neutral-500">
                      {it.source} · {fullDate}
                    </div>
                    <h3 className="display text-2xl font-extrabold leading-tight text-white sm:text-[28px]">
                      {withHighlight(it.title, it.highlight)}
                    </h3>
                    {it.summary && (
                      <p className="serif mt-2.5 line-clamp-2 text-sm leading-relaxed text-neutral-400">
                        {it.summary}
                      </p>
                    )}
                  </div>
                </a>
              </li>
            ))}
          </ul>
          {carousel.length > 1 && (
            <div className="mt-3 flex justify-end gap-2">
              <button
                onClick={() => move(-1)}
                aria-label="Previous"
                className="flex h-9 w-9 items-center justify-center rounded-full border border-neutral-700 text-neutral-300 transition-colors hover:border-neutral-500 hover:text-white"
              >
                ←
              </button>
              <button
                onClick={() => move(1)}
                aria-label="Next"
                className="flex h-9 w-9 items-center justify-center rounded-full border border-neutral-700 text-neutral-300 transition-colors hover:border-neutral-500 hover:text-white"
              >
                →
              </button>
            </div>
          )}
        </div>

        <div className="flex flex-col gap-4">
          {right.map((it) => (
            <a
              key={it.id}
              href={it.url ?? "#"}
              target="_blank"
              rel="noopener noreferrer"
              className="block flex-1 rounded-2xl border border-neutral-800 bg-[#141416] p-5 transition-colors hover:border-neutral-600"
            >
              <div className="mb-2 text-xs text-neutral-500">
                {it.source} · {fullDate}
              </div>
              <h3 className="display text-xl font-bold leading-snug text-white">
                {withHighlight(it.title, it.highlight)}
              </h3>
              {it.summary && (
                <p className="serif mt-2.5 line-clamp-3 text-sm leading-relaxed text-neutral-400">
                  {it.summary}
                </p>
              )}
            </a>
          ))}
        </div>
      </div>
    </section>
  );
}
