// Markdown "twin" generator. For every primary HTML page we can serve a clean,
// JS-free Markdown rendering that AI crawlers and answer engines can read and
// cite directly. Built from the SAME data functions the HTML pages use, so the
// twin never drifts from what a human sees.
//
// renderMarkdown(path) returns the body + a token estimate, or null for a path
// that has no twin (so the caller can 404).

import { SITE, SECTION_SEO, SLUG_SECTION, absoluteUrl, sectionPath } from "@/lib/seo";
import {
  getSectionItems,
  getEditionItems,
  getAllEditionDates,
  getEditionHeadlines,
  getStoryBySlug,
  getRelatedStories,
  getEditionSynopsis,
  newestPublishedAt,
} from "@/lib/publicData";
import { SITE_FAQ, SECTION_FAQ } from "@/lib/faq";
import type { Item, Section } from "@/lib/types";

const SECTIONS: Section[] = ["daily", "tools", "articles", "funding"];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function oneLine(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

function prettyDate(date: string): string {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
}

function isoDay(date: string): string {
  return `${date}T12:00:00Z`;
}

// Rough token estimate for the X-Markdown-Tokens header (~4 chars/token).
export function estimateTokens(text: string): number {
  return Math.max(1, Math.ceil(text.length / 4));
}

function faqBlock(faq: { q: string; a: string }[]): string[] {
  const out = ["## Frequently asked questions", ""];
  for (const f of faq) {
    out.push(`### ${f.q}`, "", oneLine(f.a), "");
  }
  return out;
}

// One story rendered as a compact markdown block. Includes the internal page
// link, the external source (citation), and the original take or summary.
function storyLines(it: Item): string[] {
  const lines: string[] = [];
  lines.push(`### [${oneLine(it.title)}](${absoluteUrl(`/story/${it.slug}`)})`);
  const meta: string[] = [];
  if (it.source) meta.push(`Source: ${it.source}`);
  if (it.author) meta.push(it.author);
  if (it.published_at)
    meta.push(prettyDate(it.published_at.slice(0, 10)));
  if (meta.length) lines.push("", `_${meta.join(" · ")}_`);
  const body = it.wortins_take?.trim() || it.summary?.trim();
  if (body) lines.push("", oneLine(body));
  if (it.url) lines.push("", `[Read the full story at ${it.source ?? "the source"}](${it.url})`);
  lines.push("");
  return lines;
}

function header(title: string, description?: string): string[] {
  const out = [`# ${title}`, ""];
  if (description) out.push(`> ${oneLine(description)}`, "");
  return out;
}

function footer(): string[] {
  return [
    "---",
    "",
    `_Curated and written by [${SITE.name}](${SITE.url}) — ${SITE.tagline}. Every story links to its original source; the "${SITE.name} read" on each is our own original analysis. [About Wortins & our editorial approach](${absoluteUrl("/about")})._`,
    "",
  ];
}

async function renderHome(): Promise<string> {
  const [items, dates] = await Promise.all([
    getSectionItems("daily", 20),
    getAllEditionDates(),
  ]);
  const out = header(`${SITE.name} — ${SITE.tagline}`, SITE.description);
  out.push(
    `${SITE.name} curates AI news across four sections, each item linking to its original source, with an original ${SITE.name} take written per story. Use it to find emerging startups, new AI products and launches, applied real-world AI, notable funding, and genuine breakthroughs.`,
    "",
    "## Sections",
    ""
  );
  for (const s of SECTIONS) {
    const meta = SECTION_SEO[s];
    if (meta) out.push(`- [${meta.label}](${absoluteUrl(sectionPath(s))}): ${oneLine(meta.description)}`);
  }
  out.push("", "## Latest AI news", "");
  for (const it of items) out.push(...storyLines(it));
  if (dates.length) {
    out.push("## Recent editions", "");
    for (const d of dates.slice(0, 10))
      out.push(`- [${SITE.name} for ${prettyDate(d)}](${absoluteUrl(`/edition/${d}`)})`);
    out.push("");
  }
  out.push(...faqBlock(SITE_FAQ));
  out.push(...footer());
  return out.join("\n");
}

async function renderSection(section: Section): Promise<string> {
  const meta = SECTION_SEO[section];
  if (!meta) return "";
  const items = await getSectionItems(section, 40);
  const out = header(meta.title, meta.description);
  out.push(`Part of [${SITE.name}](${SITE.url}) — ${SITE.tagline}.`, "");
  out.push(`## ${meta.label}`, "");
  for (const it of items) out.push(...storyLines(it));
  const faq = SECTION_FAQ[section];
  if (faq) out.push(...faqBlock(faq));
  out.push(...footer());
  return out.join("\n");
}

async function renderStory(slug: string): Promise<string | null> {
  const item = await getStoryBySlug(slug);
  if (!item) return null;
  const related = await getRelatedStories(item, 6);
  const take = item.wortins_take?.trim();
  const description = take || item.summary?.trim() || SITE.description;
  const sectionLabel = SECTION_SEO[item.section]?.label ?? item.section;
  const published = (item.published_at ?? item.created_at)?.slice(0, 10);

  const out = header(item.title, description);
  const meta: string[] = [`Section: [${sectionLabel}](${absoluteUrl(sectionPath(item.section))})`];
  if (item.source) meta.push(`Source: ${item.source}`);
  if (item.author) meta.push(`By ${item.author}`);
  if (published) meta.push(`Published ${prettyDate(published)}`);
  out.push(`_${meta.join(" · ")}_`, "");

  if (take) {
    out.push(`## ${SITE.name}' read`, "", oneLine(take), "");
  } else if (item.summary) {
    out.push(oneLine(item.summary), "");
  }
  if (item.url) {
    out.push("## Source", "", `[Read the full story at ${item.source ?? "the source"}](${item.url})`, "");
  }
  // Extra external references from related coverage strengthen citation depth.
  const external = related.filter((r) => r.url);
  if (external.length) {
    out.push("## Related coverage", "");
    for (const r of external) {
      out.push(
        `- [${oneLine(r.title)}](${absoluteUrl(`/story/${r.slug}`)})${r.source ? ` — [${r.source}](${r.url})` : ""}`
      );
    }
    out.push("");
  }
  out.push(...footer());
  return out.join("\n");
}

async function renderEdition(date: string): Promise<string | null> {
  const [items, syn] = await Promise.all([
    getEditionItems(date),
    getEditionSynopsis(date),
  ]);
  if (items.length === 0) return null;
  const pretty = prettyDate(date);
  const modified = newestPublishedAt(items) ?? isoDay(date);

  const out = header(
    syn?.headline ?? `AI news for ${pretty}`,
    syn?.synopsis ?? `${SITE.name}' curated AI briefing for ${pretty}.`
  );
  out.push(`_${SITE.name} AI briefing · ${pretty} · Updated ${modified.slice(0, 10)}_`, "");

  // Group items by section, in the canonical order.
  for (const s of SECTIONS) {
    const inSection = items.filter((it) => it.section === s);
    if (!inSection.length) continue;
    const label = SECTION_SEO[s]?.label ?? s;
    out.push(`## ${label}`, "");
    for (const it of inSection) out.push(...storyLines(it));
  }
  out.push(...footer());
  return out.join("\n");
}

async function renderEditionsArchive(): Promise<string> {
  const [dates, headlines] = await Promise.all([
    getAllEditionDates(),
    getEditionHeadlines(),
  ]);
  const out = header(
    `All editions — the ${SITE.name} AI briefing archive`,
    `Every daily ${SITE.name} AI briefing in one place: browse the full archive of editions.`
  );
  out.push(`## The archive (${dates.length} editions)`, "");
  for (const d of dates)
    out.push(`- [${headlines.get(d) ?? `AI news for ${prettyDate(d)}`}](${absoluteUrl(`/edition/${d}`)}) — ${prettyDate(d)}`);
  out.push("");
  out.push(...footer());
  return out.join("\n");
}

function renderAbout(): string {
  const out = header(
    "About Wortins — who we are & how the briefing works",
    "Wortins is a daily AI news briefing that curates the most interesting stories across the AI world and writes an original take on each."
  );
  out.push(
    `${SITE.name} is a daily AI news briefing. Every day it curates the most interesting stories across the AI world — emerging startups, real product launches, applied real-world AI, notable funding, and genuine breakthroughs — and writes an original take on each, so you get the signal without the noise or the hype.`,
    "",
    "## Our editorial approach",
    "",
    `${SITE.name} deliberately looks beyond the big-lab press cycle. Megacap corporate news is capped in favour of the builders, tools, and applied AI that don't always make the front page. Every story links to its original source, and the "${SITE.name} read" on each is our own words — original analysis, never a republished article.`,
    ""
  );
  out.push(...faqBlock(SITE_FAQ));
  out.push(...footer());
  return out.join("\n");
}

function renderContact(): string {
  const out = header("Contact Wortins", "Get in touch with Wortins — feedback, tips, story suggestions, and partnership enquiries.");
  out.push(
    "Feedback, a story tip, a correction, or a partnership idea? We'd like to hear it.",
    "",
    `- Email: [hello@wortins.com](mailto:hello@wortins.com)`,
    `- On X: [@wortins](https://x.com/wortins)`,
    ""
  );
  out.push(...footer());
  return out.join("\n");
}

export type Twin = { body: string; tokens: number };

// Map a request path to its Markdown twin. Returns null when no twin exists.
export async function renderMarkdown(path: string): Promise<Twin | null> {
  const clean = path.replace(/\/+$/, "") || "/";
  let body: string | null = null;

  if (clean === "/") body = await renderHome();
  else if (clean === "/about") body = renderAbout();
  else if (clean === "/contact") body = renderContact();
  else if (clean === "/editions") body = await renderEditionsArchive();
  else if (SLUG_SECTION[clean.slice(1)]) body = await renderSection(SLUG_SECTION[clean.slice(1)] as Section);
  else if (clean.startsWith("/section/")) {
    const s = clean.slice("/section/".length);
    if (SECTIONS.includes(s as Section)) body = await renderSection(s as Section);
  } else if (clean.startsWith("/story/")) {
    body = await renderStory(clean.slice("/story/".length));
  } else if (clean.startsWith("/edition/")) {
    const d = clean.slice("/edition/".length);
    if (DATE_RE.test(d)) body = await renderEdition(d);
  }

  if (body == null) return null;
  return { body, tokens: estimateTokens(body) };
}

// The set of static (non-parameterized) paths that have a twin — used by the
// sitemap to advertise the .md URLs.
export const STATIC_TWIN_PATHS = [
  "/",
  ...SECTIONS.map((s) => sectionPath(s)),
  "/editions",
  "/about",
  "/contact",
];

// Path -> its .md twin URL path (home maps to /index.md).
export function twinPath(path: string): string {
  const clean = path.replace(/\/+$/, "");
  return clean === "" || clean === "/" ? "/index.md" : `${clean}.md`;
}
