import type { NextRequest } from "next/server";
import { supabaseService } from "@/lib/supabase-service";

// Cron-poked drip poster. Finds approved `bluesky_scheduled` rows that are now
// due and posts each to Bluesky, linking to that story's own /story/<slug> page.
// Reuses the exact AT Protocol flow from /api/bluesky/post: createSession with an
// app password, an app.bsky.embed.external link card (title/description clipped,
// best-effort uploaded thumb), then createRecord an app.bsky.feed.post.
// Auth is a bearer token so the GitHub Actions heartbeat (see
// .github/workflows/bluesky-drip.yml) can poke it: it sends
// `Authorization: Bearer <BLUESKY_REVIEW_SECRET>`.

export const dynamic = "force-dynamic";

const PDS = "https://bsky.social";
const SITE_URL = (process.env.SITE_URL || "https://www.wortins.com").replace(
  /\/$/,
  ""
);
const BATCH = 10; // due rows handled per poke; the cron ticks often enough

type BskySession = {
  accessJwt?: string;
  did?: string;
  handle?: string;
};

type BskyBlob = Record<string, unknown>;

type BskyExternal = {
  uri: string;
  title: string;
  description: string;
  thumb?: BskyBlob;
};

type ScheduledRow = {
  id: string;
  story_slug: string;
  text: string;
};

// Same xrpc helper as post/route.ts: POST JSON to the PDS, throw on non-2xx.
async function xrpc<T = unknown>(
  nsid: string,
  body: unknown,
  token?: string
): Promise<T> {
  const res = await fetch(`${PDS}/xrpc/${nsid}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Bluesky ${nsid}: ${res.status} ${text.slice(0, 300)}`);
  return (text ? JSON.parse(text) : null) as T;
}

// Normalize whitespace + strip em/en dashes (house style: commas), matching the
// clip() in post/route.ts, so a stray dash in story copy never lands in the card.
function clip(s: string | null | undefined, n: number): string {
  const t = (s || "").replace(/\s+/g, " ").replace(/\s*[—–]\s*/g, ", ").trim();
  return t.length > n ? `${t.slice(0, n - 1).trimEnd()}…` : t;
}

// Best-effort: upload a story image as the link-card thumbnail (same shape as
// post-bluesky.mjs). Returns the blob ref, or null on any failure so the post
// still goes out without a thumb.
async function uploadThumb(
  imageUrl: string,
  token: string
): Promise<BskyBlob | null> {
  try {
    const r = await fetch(imageUrl);
    if (!r.ok) return null;
    const type = r.headers.get("content-type") || "image/jpeg";
    if (!type.startsWith("image/")) return null;
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.length > 976_000) return null; // ~1MB blob cap
    const res = await fetch(`${PDS}/xrpc/com.atproto.repo.uploadBlob`, {
      method: "POST",
      headers: { "Content-Type": type, Authorization: `Bearer ${token}` },
      body: buf,
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { blob?: BskyBlob };
    return data?.blob || null;
  } catch {
    return null;
  }
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

export async function POST(req: NextRequest): Promise<Response> {
  // Auth: `Authorization: Bearer <BLUESKY_REVIEW_SECRET>`.
  const secret = process.env.BLUESKY_REVIEW_SECRET;
  const authHeader = req.headers.get("authorization") || "";
  const token = authHeader.startsWith("Bearer ")
    ? authHeader.slice("Bearer ".length).trim()
    : "";
  if (!secret || token !== secret) {
    return json({ ok: false, error: "Not authorized." }, 401);
  }

  const svc = supabaseService();
  if (!svc) return json({ ok: false, error: "Database is not configured." }, 500);

  // Due = pending and scheduled_for at or before now, oldest first.
  const { data: due, error: dueErr } = await svc
    .from("bluesky_scheduled")
    .select("id, story_slug, text")
    .eq("status", "pending")
    .lte("scheduled_for", new Date().toISOString())
    .order("scheduled_for", { ascending: true })
    .limit(BATCH)
    .returns<ScheduledRow[]>();
  if (dueErr) return json({ ok: false, error: "Could not load scheduled posts." }, 500);
  if (!due || due.length === 0) return json({ ok: true, posted: 0 });

  const identifier = process.env.BLUESKY_IDENTIFIER;
  const appPassword = process.env.BLUESKY_APP_PASSWORD;
  if (!identifier || !appPassword) {
    return json({ ok: false, error: "Bluesky credentials are not configured." }, 500);
  }

  // Authenticate once for the whole batch.
  let accessJwt: string;
  let did: string;
  try {
    const session = await xrpc<BskySession>("com.atproto.server.createSession", {
      identifier,
      password: appPassword,
    });
    if (!session?.accessJwt || !session?.did) {
      return json({ ok: false, error: "Bluesky authentication failed." }, 502);
    }
    accessJwt = session.accessJwt;
    did = session.did;
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Bluesky authentication failed.";
    return json({ ok: false, error: msg }, 502);
  }

  let posted = 0;
  let failed = 0;

  for (const row of due) {
    try {
      // Best-effort link card to this story's own page. Missing item copy falls
      // back to sensible defaults; the post always links to /story/<slug>.
      const { data: item } = await svc
        .from("items")
        .select("title, summary, image_url")
        .eq("slug", row.story_slug)
        .eq("is_active", true)
        .maybeSingle<{
          title: string | null;
          summary: string | null;
          image_url: string | null;
        }>();

      const external: BskyExternal = {
        uri: `${SITE_URL}/story/${row.story_slug}`,
        title: clip(item?.title || "Wortins", 120),
        description: clip(
          item?.summary ||
            "The day's most interesting AI news, tuned to you.",
          200
        ),
      };
      if (item?.image_url) {
        const thumb = await uploadThumb(item.image_url, accessJwt);
        if (thumb) external.thumb = thumb;
      }
      const embed = { $type: "app.bsky.embed.external" as const, external };

      const record = {
        $type: "app.bsky.feed.post",
        text: row.text,
        createdAt: new Date().toISOString(),
        embed,
      };
      const res = await xrpc<{ uri?: string }>(
        "com.atproto.repo.createRecord",
        { repo: did, collection: "app.bsky.feed.post", record },
        accessJwt
      );

      await svc
        .from("bluesky_scheduled")
        .update({
          status: "posted",
          posted_uri: res?.uri || null,
          posted_at: new Date().toISOString(),
        })
        .eq("id", row.id);
      posted += 1;
    } catch (e) {
      // One bad row must not block the rest: mark it failed and continue.
      const msg = e instanceof Error ? e.message : "Failed to post.";
      await svc
        .from("bluesky_scheduled")
        .update({ status: "failed", error: msg.slice(0, 500) })
        .eq("id", row.id);
      failed += 1;
    }
  }

  return json({ ok: true, posted, failed });
}
