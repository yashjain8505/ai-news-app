import type { NextRequest } from "next/server";
import { inspectUrl, gscConfigured, type UrlInspection } from "@/lib/gsc";
import { SITE } from "@/lib/seo";

// Is each of these wortins.com pages in Google's index? Search Console URL
// Inspection behind the service-role token (the only caller is our own CI: the
// AI-visibility tracker). Returns 200 with `indexed: null` per URL when Search
// Console isn't connected, so the caller degrades to "unknown" instead of
// failing its run.

export const dynamic = "force-dynamic";

const MAX_URLS = 50;
const CONCURRENCY = 3; // the inspection quota is generous, not unlimited

export async function POST(req: NextRequest) {
  const token = req.headers.get("x-seo-token");
  const expected = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!expected || token !== expected) {
    return new Response("unauthorized", { status: 401 });
  }

  let urls: string[] = [];
  try {
    const body = (await req.json()) as { urls?: unknown };
    urls = Array.isArray(body.urls)
      ? body.urls.filter((u): u is string => typeof u === "string")
      : [];
  } catch {
    return Response.json({ error: "body must be JSON {urls: string[]}" }, { status: 400 });
  }
  // Only our own pages can be inspected on our property anyway; refuse the rest
  // up front so a bad caller gets a clear answer.
  const own = urls
    .filter((u) => u === SITE.url || u.startsWith(`${SITE.url}/`))
    .slice(0, MAX_URLS);
  if (own.length === 0) {
    return Response.json({ error: `urls must be ${SITE.url} pages` }, { status: 400 });
  }

  const noStore = { headers: { "cache-control": "no-store" } };
  if (!gscConfigured) {
    return Response.json(
      {
        results: own.map(
          (url): UrlInspection => ({
            url,
            indexed: null,
            verdict: null,
            coverageState: null,
            lastCrawl: null,
            error: "gsc not configured",
          }),
        ),
      },
      noStore,
    );
  }

  const results: UrlInspection[] = [];
  for (let i = 0; i < own.length; i += CONCURRENCY) {
    results.push(...(await Promise.all(own.slice(i, i + CONCURRENCY).map(inspectUrl))));
  }
  return Response.json({ results }, noStore);
}
