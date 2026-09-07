import { SITE } from "@/lib/seo";
import { getNewsSitemapStories } from "@/lib/publicData";

// Google News sitemap: ONLY the last ~48h of story pages, with news: tags —
// Google reads news sitemaps for fresh articles and ignores older entries.
// The regular /sitemap.xml still lists everything; this is the fast lane that
// (with the NewsArticle schema the story pages already carry) qualifies pages
// for Google News / Top Stories. Submit once in Search Console.
export const revalidate = 900;

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export async function GET() {
  const stories = await getNewsSitemapStories(48);
  const urls = stories
    .map((s) => {
      const when = s.published_at ?? s.created_at;
      return `  <url>
    <loc>${SITE.url}/story/${esc(s.slug)}</loc>
    <news:news>
      <news:publication>
        <news:name>${esc(SITE.name)}</news:name>
        <news:language>en</news:language>
      </news:publication>
      <news:publication_date>${new Date(when).toISOString()}</news:publication_date>
      <news:title>${esc(s.title)}</news:title>
    </news:news>
  </url>`;
    })
    .join("\n");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:news="http://www.google.com/schemas/sitemap-news/0.9">
${urls}
</urlset>`;

  return new Response(xml, {
    headers: { "Content-Type": "application/xml; charset=utf-8" },
  });
}
