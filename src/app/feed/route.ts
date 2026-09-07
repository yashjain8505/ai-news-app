import { absoluteUrl } from "@/lib/seo";

// /feed is what people (and feed readers) guess first — 301 to the real feed.
export function GET() {
  return Response.redirect(absoluteUrl("/feed.xml"), 301);
}
