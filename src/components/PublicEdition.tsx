import { Item, Section } from "@/lib/types";
import { SECTION_SEO } from "@/lib/seo";
import { timeAgo } from "@/lib/time";
import Img from "@/components/Img";

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

// `wortins_take` is 2-3 paragraphs (130-220 words) written for the STORY page.
// The edition lead rendered ALL of it inside a single <p>, so the paragraph
// breaks were lost too and ~200 words arrived as one unbroken block before the
// reader ever reached the second headline. That is the whole "not reader
// friendly" complaint: the page reads as an essay, not an edition.
// The lead now gets the first paragraph - the "what happened" - and the rest is
// one click away on the story page.
function firstPara(text: string | null | undefined): string | null {
  if (!text) return null;
  const first = String(text).split(/\n\s*\n/)[0]?.trim();
  return first || null;
}
function leadBlurb(it: Item): string | null {
  return firstPara(it.wortins_take) || it.summary || null;
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

// One story in the right-hand rail: headline, source, three clamped lines. No
// image - a column of 96px thumbnails is what made the page read as a list of
// identical rows rather than a page with a front.
function RailItem({ it, now }: { it: Item; now: number }) {
  return (
    <article style={{ padding: "13px 0", borderBottom: "1px solid var(--rule)" }}>
      <Meta it={it} now={now} size={10} />
      <h3 className="display" style={{ fontSize: 17, lineHeight: 1.22, margin: "5px 0 0", color: "var(--ink)" }}>
        <a {...headlineLink(it)} style={{ color: "inherit", textDecoration: "none" }}>
          {it.title}
        </a>
      </h3>
      {blurb(it) && (
        <p
          className="serif"
          style={{ fontSize: 13.5, lineHeight: 1.5, color: "var(--dim)", margin: "6px 0 0", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}
        >
          {blurb(it)}
        </p>
      )}
    </article>
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
            {(() => {
              const [lead, ...rest] = list;
              // Two columns once there is enough to fill a rail. Below that a
              // rail would sit half empty and look broken, so the section keeps
              // the plain stack. This is the same 1.62fr/1fr grid the homepage
              // lead already uses, and the same shape the FT and Bloomberg front
              // pages use: one story with a picture, a column of headlines
              // beside it. It also fills the dead right-hand half of the page,
              // where a full-width photo used to sit above a 62-character
              // column of text.
              const twoCol = list.length >= 4;
              const rail = twoCol ? rest.slice(0, 4) : [];
              const below = twoCol ? rest.slice(4) : rest;
              const LeadArticle = (
                <article>
                  {lead.image_url && (
                    <Img className="news-photo" src={lead.image_url} width={1200} alt={lead.title} loading={eagerLead ? "eager" : "lazy"} fetchPriority={eagerLead ? "high" : "auto"} style={{ width: "100%", height: 260, objectFit: "cover", marginBottom: 12 }} />
                  )}
                  <Meta it={lead} now={now} size={11} />
                  <h3 className="display" style={{ fontSize: "clamp(26px,3.4vw,38px)", lineHeight: 1.06, margin: "8px 0 0", color: "var(--ink)" }}>
                    <a {...headlineLink(lead)} style={{ color: "inherit", textDecoration: "none" }}>
                      {lead.title}
                    </a>
                  </h3>
                  {leadBlurb(lead) && (
                    <p className="serif" style={{ fontSize: 17, lineHeight: 1.55, color: "var(--muted)", margin: "10px 0 0", maxWidth: "62ch" }}>
                      {leadBlurb(lead)}
                    </p>
                  )}
                  <a {...headlineLink(lead)} className="mono" style={{ display: "inline-block", marginTop: 10, fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--accent)", textDecoration: "none" }}>
                    Read the full story &rarr;
                  </a>
                </article>
              );
              return (
                <>
                  {twoCol ? (
                    <div className="bs-lead">
                      <div>{LeadArticle}</div>
                      <div className="bs-rail">
                        {rail.map((it) => (
                          <RailItem key={it.id} it={it} now={now} />
                        ))}
                      </div>
                    </div>
                  ) : (
                    LeadArticle
                  )}
                  {below.length > 0 && (
                    <ul style={{ listStyle: "none", margin: "22px 0 0", padding: 0, borderTop: "1px solid var(--ruleStrong)" }}>
                      {below.map((it, i) => (
                        <li key={it.id} style={{ padding: "16px 0", borderBottom: i !== below.length - 1 ? "1px solid var(--rule)" : "none" }}>
                          <article style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>
                            {it.image_url && (
                              <Img className="news-photo" src={it.image_url} width={200} alt={it.title} loading="lazy" style={{ width: 96, height: 66, objectFit: "cover", flexShrink: 0 }} />
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
                        </li>
                      ))}
                    </ul>
                  )}
                </>
              );
            })()}
          </section>
        );
      })}
    </div>
  );
}
