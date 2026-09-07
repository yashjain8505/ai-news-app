import { absoluteUrl } from "@/lib/seo";

// /rss.xml is the other guessed feed path — 301 to the real feed.
export function GET() {
  return Response.redirect(absoluteUrl("/feed.xml"), 301);
}
