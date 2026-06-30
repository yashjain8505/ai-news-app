import { SITE } from "@/lib/seo";
import { getLatestEditionDate, getEditionItems } from "@/lib/publicData";

// RSS feed at /feed.xml — distribution + extra discovery surface for readers
// and aggregators. Cached for 30 min.
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
      const desc = [it.source, it.summary].filter(Boolean).join(" — ");
      const pub = it.published_at ? new Date(it.published_at).toUTCString() : null;
      return `    <item>
      <title>${esc(it.title)}</title>
      <link>${esc(it.url ?? SITE.url)}</link>
      <guid isPermaLink="false">${esc(it.id)}</guid>${pub ? `\n      <pubDate>${pub}</pubDate>` : ""}${desc ? `\n      <description>${esc(desc)}</description>` : ""}
    </item>`;
    })
    .join("\n");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>${esc(`${SITE.name} — ${SITE.tagline}`)}</title>
    <link>${SITE.url}</link>
    <description>${esc(SITE.description)}</description>
    <language>en</language>
${entries}
  </channel>
</rss>`;

  return new Response(xml, {
    headers: { "Content-Type": "application/rss+xml; charset=utf-8" },
  });
}
