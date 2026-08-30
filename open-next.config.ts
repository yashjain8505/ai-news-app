import { defineCloudflareConfig } from "@opennextjs/cloudflare";
import r2IncrementalCache from "@opennextjs/cloudflare/overrides/incremental-cache/r2-incremental-cache";

// The incremental cache is not optional here, and not only for revalidation:
// OpenNext serves *prerendered* pages out of it too, so with no cache configured
// every statically generated route 404s. That is how /blog/<slug> broke on the
// first local run.
//
// R2 rather than the static-assets cache, because that one is documented as
// read-only ("only for applications that do NOT want revalidation"). The blog
// would be fine with it — its content is fixed at build time — but the news
// surfaces (/, /section/*, /story/*, the sitemap) read Supabase on a 30-minute
// revalidate and the curator publishes three times a day, so freezing them at
// build time would quietly stop the site updating.
//
// R2 rather than KV because of write volume: KV's free tier allows 1,000 writes
// a day, and ~220 revalidating routes under crawler traffic can exceed that
// easily. R2's free tier allows roughly 33,000 writes a day.
export default defineCloudflareConfig({
  incrementalCache: r2IncrementalCache,
});
