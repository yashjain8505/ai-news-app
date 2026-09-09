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

// Read the secret INSIDE the request, not at module scope: on Workers the
// bindings are bound per-request, so a module-scope read can capture undefined
// depending on when the isolate first evaluates this file.
function authorized(request: NextRequest): { ok: true } | { ok: false; why: string } {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) return { ok: false, why: "worker-has-no-SUPABASE_SERVICE_ROLE_KEY" };
  const header = request.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!token) return { ok: false, why: "request-sent-no-bearer-token" };
  const a = Buffer.from(token, "utf8");
  const b = Buffer.from(serviceKey, "utf8");
  // Lengths distinguish "the two secrets are different values" from "the env is
  // missing" without revealing either one. This is logged, never returned: the
  // endpoint is public, and a caller who can read the expected length learns
  // something about the key. (That distinction is what proved, on 2026-09-09,
  // that the Worker's SUPABASE_SERVICE_ROLE_KEY was an 11-char placeholder
  // rather than a real key — the cause of every 401 since Aug 28.)
  if (a.length !== b.length) {
    return { ok: false, why: `token-length-mismatch(sent=${a.length},expected=${b.length})` };
  }
  return timingSafeEqual(a, b) ? { ok: true } : { ok: false, why: "token-same-length-but-different-value" };
}

export async function GET(request: NextRequest) {
  const auth = authorized(request);
  if (!auth.ok) {
    // Detail goes to the Worker log (`wrangler tail`), never to the caller.
    console.log(`brief-input 401: ${auth.why}`);
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
