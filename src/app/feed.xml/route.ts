import { SITE } from "@/lib/seo";
import { getLatestEditionDate, getEditionItems } from "@/lib/publicData";

// RSS feed at /feed.xml · distribution + extra discovery surface for readers
// and aggregators. Cached for 30 min.
//
// Items link to OUR story pages (each already credits and links the source
// prominently), with the original article credited in the description — so
// syndication drives readers to Wortins instead of straight past it.
export const revalidate = 1800;

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export async function GET() {
  const date = await getLatestEditionDate();
  const items = date ? await getEditionItems(date) : [];
  const entries = items
    .slice(0, 40)
    .map((it) => {
      const storyUrl = `${SITE.url}/story/${it.slug}`;
      const credit = it.source
        ? `Read the original at ${it.source}: ${it.url ?? storyUrl}`
        : null;
      const desc = [it.summary, credit].filter(Boolean).join(" · ");
      const pub = it.published_at ? new Date(it.published_at).toUTCString() : null;
      return `    <item>
      <title>${esc(it.title)}</title>
      <link>${esc(storyUrl)}</link>
      <guid isPermaLink="false">${esc(it.id)}</guid>${pub ? `\n      <pubDate>${pub}</pubDate>` : ""}${desc ? `\n      <description>${esc(desc)}</description>` : ""}
    </item>`;
    })
    .join("\n");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${esc(`${SITE.name} · ${SITE.tagline}`)}</title>
    <link>${SITE.url}</link>
    <atom:link href="${SITE.url}/feed.xml" rel="self" type="application/rss+xml"/>
    <description>${esc(SITE.description)}</description>
    <language>en</language>
${entries}
  </channel>
</rss>`;

  return new Response(xml, {
    headers: { "Content-Type": "application/rss+xml; charset=utf-8" },
  });
}
