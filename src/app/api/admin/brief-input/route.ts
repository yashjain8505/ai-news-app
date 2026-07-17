import type { NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { getAnalyticsOverview, normalizeRange } from "@/lib/analyticsData";

// Machine-to-machine endpoint for the analytics-brief GitHub workflow. It returns
// the SAME computed AnalyticsOverview the dashboard renders (GA + Supabase), so
// the workflow doesn't have to duplicate any of that logic — it just fetches
// this, pipes it to the `claude` CLI, and stores the result.
//
// Auth: a bearer token that must equal SUPABASE_SERVICE_ROLE_KEY. That key is
// already a Vercel var here AND a GitHub secret (SUPABASE_SERVICE_KEY) on the
// workflow side, so this needs no new secret. Anyone holding it already has full
// DB access, so gating admin analytics behind it leaks nothing new.

export const dynamic = "force-dynamic";

const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

function authorized(request: NextRequest): boolean {
  if (!SERVICE_KEY) return false;
  const header = request.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!token) return false;
  const a = Buffer.from(token, "utf8");
  const b = Buffer.from(SERVICE_KEY, "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export async function GET(request: NextRequest) {
  if (!authorized(request)) {
    return new Response("Unauthorized\n", { status: 401 });
  }
  const range = normalizeRange(
    request.nextUrl.searchParams.get("range") ?? undefined
  );
  const overview = await getAnalyticsOverview(range);
  return Response.json(overview, {
    headers: { "Cache-Control": "no-store" },
  });
}
