import { Item, Section } from "@/lib/types";
import { SECTION_SEO } from "@/lib/seo";
import { timeAgo } from "@/lib/time";

// Server-rendered, non-personalized, semantic view for the public/crawlable pages.
// Plain HTML (no client JS) for fast LCP and clean extraction by crawlers + AI engines.
// With `limit`, it renders a front-page slice (lead + a few) plus "All <section>" links;
// without it, the full list (used by /edition and /section archive pages).

const ORDER: Section[] = ["daily", "funding", "tools", "articles"];

// Route a headline to its /story page only once that page is a real landing
// (i.e. it carries an original take). Until then, link out to the source — a
// safe progressive rollout. Internal story links open in the same tab; external
// source links open in a new tab.
function headlineLink(it: Item): {
  href: string;
  target?: string;
  rel?: string;
} {
  if (it.wortins_take) return { href: `/story/${it.slug}` };
  return { href: it.url ?? "#", target: "_blank", rel: "noopener noreferrer" };
}

// Prefer our original take (fuller, TLDR-style) over the one-line source dek, so
// every listing item carries real, readable, original content.
function blurb(it: Item): string | null {
  return it.wortins_take || it.summary || null;
}

function group(items: Item[]): Record<Section, Item[]> {
  const g: Record<Section, Item[]> = { daily: [], tools: [], articles: [], funding: [] };
  for (const it of items) g[it.section]?.push(it);
  return g;
}

function Meta({ it, now, size }: { it: Item; now: number; size: number }) {
  const ago = timeAgo(it.published_at, now);
  return (
    <div className="mono" style={{ fontSize: size, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--dim)" }}>
      {it.source}
      {it.published_at && (
        <>
          {" · "}
          <time dateTime={it.published_at}>{ago}</time>
        </>
      )}
    </div>
  );
}

export default function PublicEdition({
  items,
  now,
  showSectionHeaders = true,
  limit,
}: {
  items: Item[];
  now: number;
  showSectionHeaders?: boolean;
  limit?: number;
}) {
  const g = group(items);
  // The lead image of the first non-empty section is the LCP element — load it
  // eagerly with high priority instead of lazily.
  const firstSection = ORDER.find((s) => (g[s]?.length ?? 0) > 0);
  return (
    <div>
      {ORDER.map((sec) => {
        const all = g[sec];
        if (!all || all.length === 0) return null;
        const list = limit ? all.slice(0, limit) : all;
        const hasMore = limit != null && all.length > limit;
        const eagerLead = sec === firstSection;
        return (
          <section key={sec} style={{ marginBottom: 44 }}>
            {showSectionHeaders && (
              <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, borderBottom: "1px solid var(--ruleStrong)", paddingBottom: 8, marginBottom: 18 }}>
                <h2 className="display" style={{ fontSize: 24, color: "var(--ink)", margin: 0 }}>
                  {SECTION_SEO[sec].label}
                </h2>
                {hasMore && (
                  <a href={`/section/${sec}`} className="mono" style={{ fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--accent)", textDecoration: "none", whiteSpace: "nowrap" }}>
                    All {SECTION_SEO[sec].label} &rarr;
                  </a>
                )}
              </div>
            )}
            <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
              {list.map((it, i) => {
                const notLast = i !== list.length - 1;
                return (
                  <li key={it.id} style={{ padding: "16px 0", borderBottom: notLast ? "1px solid var(--rule)" : "none" }}>
                    {i === 0 ? (
                      <article>
                        {it.image_url && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img className="news-photo" src={it.image_url} alt={it.title} loading={eagerLead ? "eager" : "lazy"} fetchPriority={eagerLead ? "high" : "auto"} style={{ width: "100%", height: 230, objectFit: "cover", marginBottom: 12 }} />
                        )}
                        <Meta it={it} now={now} size={11} />
                        <h3 className="display" style={{ fontSize: "clamp(23px,3vw,31px)", lineHeight: 1.1, margin: "8px 0 0", color: "var(--ink)" }}>
                          <a {...headlineLink(it)} style={{ color: "inherit", textDecoration: "none" }}>
                            {it.title}
                          </a>
                        </h3>
                        {blurb(it) && (
                          <p className="serif" style={{ fontSize: 17, lineHeight: 1.55, color: "var(--muted)", margin: "10px 0 0", maxWidth: "62ch" }}>
                            {blurb(it)}
                          </p>
                        )}
                      </article>
                    ) : (
                      <article style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>
                        {it.image_url && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img className="news-photo" src={it.image_url} alt={it.title} loading="lazy" width={96} height={66} style={{ width: 96, height: 66, objectFit: "cover", flexShrink: 0 }} />
                        )}
                        <div style={{ minWidth: 0 }}>
                          <Meta it={it} now={now} size={10} />
                          <h3 className="display" style={{ fontSize: 18, lineHeight: 1.2, margin: "5px 0 0", color: "var(--ink)" }}>
                            <a {...headlineLink(it)} style={{ color: "inherit", textDecoration: "none" }}>
                              {it.title}
                            </a>
                          </h3>
                          {blurb(it) && (
                            <p className="serif" style={{ fontSize: 14, lineHeight: 1.5, color: "var(--dim)", margin: "7px 0 0", display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                              {blurb(it)}
                            </p>
                          )}
                        </div>
                      </article>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
