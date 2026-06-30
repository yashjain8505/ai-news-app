import { Item, Section } from "@/lib/types";
import { SECTION_SEO } from "@/lib/seo";
import { timeAgo } from "@/lib/time";

// Server-rendered, non-personalized, semantic view used by the public/crawlable
// pages. Plain HTML (no client JS) for fast LCP and clean extraction by crawlers
// and AI answer engines.

const ORDER: Section[] = ["daily", "funding", "tools", "articles"];

function group(items: Item[]): Record<Section, Item[]> {
  const g: Record<Section, Item[]> = { daily: [], tools: [], articles: [], funding: [] };
  for (const it of items) g[it.section]?.push(it);
  return g;
}

export default function PublicEdition({
  items,
  now,
  showSectionHeaders = true,
}: {
  items: Item[];
  now: number;
  showSectionHeaders?: boolean;
}) {
  const g = group(items);
  return (
    <div>
      {ORDER.map((sec) => {
        const list = g[sec];
        if (!list || list.length === 0) return null;
        return (
          <section key={sec} style={{ marginBottom: 48 }}>
            {showSectionHeaders && (
              <h2
                className="display"
                style={{ fontSize: 26, color: "var(--ink)", margin: "0 0 18px", borderBottom: "1px solid var(--ruleStrong)", paddingBottom: 8 }}
              >
                {SECTION_SEO[sec].label}
              </h2>
            )}
            <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
              {list.map((it) => {
                const ago = timeAgo(it.published_at, now);
                return (
                  <li key={it.id} style={{ padding: "18px 0", borderBottom: "1px solid var(--rule)" }}>
                    <article style={{ display: "flex", gap: 18, alignItems: "flex-start" }}>
                      {it.image_url && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          className="news-photo"
                          src={it.image_url}
                          alt={it.title}
                          loading="lazy"
                          width={120}
                          height={80}
                          style={{ width: 120, height: 80, objectFit: "cover", flexShrink: 0 }}
                        />
                      )}
                      <div style={{ minWidth: 0 }}>
                        <div className="mono" style={{ fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--dim)" }}>
                          {it.source}
                          {it.published_at && (
                            <>
                              {" · "}
                              <time dateTime={it.published_at}>{ago}</time>
                            </>
                          )}
                        </div>
                        <h3 className="display" style={{ fontSize: 21, lineHeight: 1.2, margin: "6px 0 0", color: "var(--ink)" }}>
                          <a href={it.url ?? "#"} target="_blank" rel="noopener noreferrer" style={{ color: "inherit", textDecoration: "none" }}>
                            {it.title}
                          </a>
                        </h3>
                        {it.summary && (
                          <p className="serif" style={{ fontSize: 15, lineHeight: 1.55, color: "var(--muted)", margin: "6px 0 0" }}>
                            {it.summary}
                          </p>
                        )}
                      </div>
                    </article>
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
