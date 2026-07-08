import type { NextRequest } from "next/server";
import { supabaseService } from "@/lib/supabase-service";

// Human-in-the-loop "Post to Bluesky" endpoint for the /social review screen.
// Reuses the exact AT Protocol flow from .github/scripts/post-bluesky.mjs:
// createSession with an APP PASSWORD, then createRecord an app.bsky.feed.post
// with an optional app.bsky.embed.external link card pointing at the edition.
// Guarded by BLUESKY_REVIEW_SECRET so only the operator with the link can post.

export const dynamic = "force-dynamic";

const PDS = "https://bsky.social";
const SITE_URL = (process.env.SITE_URL || "https://www.wortins.com").replace(
  /\/$/,
  ""
);
const MAX_CHARS = 300; // Bluesky post limit (graphemes; we stay under conservatively)

type PostBody = {
  id?: unknown;
  key?: unknown;
  text?: unknown;
  slug?: unknown;
};

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

// Same xrpc helper as post-bluesky.mjs: POST JSON to the PDS, throw on non-2xx.
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
// clip() in post-bluesky.mjs, so a stray dash in edition copy never lands in the card.
function clip(s: string | null | undefined, n: number): string {
  const t = (s || "").replace(/\s+/g, " ").replace(/\s*[—–]\s*/g, ", ").trim();
  return t.length > n ? `${t.slice(0, n - 1).trimEnd()}…` : t;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

export async function POST(req: NextRequest): Promise<Response> {
  let body: PostBody;
  try {
    body = (await req.json()) as PostBody;
  } catch {
    return json({ ok: false, error: "Invalid JSON body." }, 400);
  }

  const secret = process.env.BLUESKY_REVIEW_SECRET;
  if (!secret || body.key !== secret) {
    return json({ ok: false, error: "Not authorized." }, 401);
  }

  const id = typeof body.id === "string" ? body.id : "";
  const slug = typeof body.slug === "string" ? body.slug : null;
  const text = typeof body.text === "string" ? body.text.trim() : "";
  if (!text) return json({ ok: false, error: "Post text is empty." }, 400);
  if (text.length > MAX_CHARS) {
    return json(
      { ok: false, error: `Post is ${text.length} chars, over the ${MAX_CHARS} limit.` },
      400
    );
  }

  const identifier = process.env.BLUESKY_IDENTIFIER;
  const appPassword = process.env.BLUESKY_APP_PASSWORD;
  if (!identifier || !appPassword) {
    return json({ ok: false, error: "Bluesky credentials are not configured." }, 500);
  }

  const svc = supabaseService();
  if (!svc) return json({ ok: false, error: "Database is not configured." }, 500);

  // Look up the queue row for run_date/slot and to build the optional link card.
  const { data: row, error: rowErr } = await svc
    .from("bluesky_queue")
    .select("id, run_date, slot")
    .eq("id", id)
    .maybeSingle<{ id: string; run_date: string; slot: string }>();
  if (rowErr) return json({ ok: false, error: "Could not load the queue row." }, 500);
  if (!row) return json({ ok: false, error: "Queue row not found." }, 404);

  // Best-effort link card to the edition; pull title/description from editions.
  let embed:
    | { $type: "app.bsky.embed.external"; external: BskyExternal }
    | undefined;
  try {
    const editionUrl = `${SITE_URL}/edition/${row.run_date}`;
    const { data: ed } = await svc
      .from("editions")
      .select("headline, synopsis")
      .eq("edition_date", row.run_date)
      .maybeSingle<{ headline: string | null; synopsis: string | null }>();
    const title = clip(ed?.headline || "The Wortins Daily", 120);
    const description = clip(
      ed?.synopsis ||
        "The day's most interesting AI news, tuned to you. Tools, funding, applied AI, beyond the big-lab hype.",
      200
    );
    if (editionUrl && title) {
      embed = {
        $type: "app.bsky.embed.external",
        external: { uri: editionUrl, title, description },
      };
    }
  } catch {
    // Skip the embed if anything about it fails; the text post still goes out.
    embed = undefined;
  }

  // Auth + create the post.
  let uri: string | null = null;
  let handleOrDid = "";
  try {
    const session = await xrpc<BskySession>("com.atproto.server.createSession", {
      identifier,
      password: appPassword,
    });
    const token = session?.accessJwt;
    const did = session?.did;
    if (!token || !did) {
      return json({ ok: false, error: "Bluesky authentication failed." }, 502);
    }
    handleOrDid = session.handle || did;

    const record = {
      $type: "app.bsky.feed.post",
      text,
      createdAt: new Date().toISOString(),
      ...(embed ? { embed } : {}),
    };
    const posted = await xrpc<{ uri?: string }>(
      "com.atproto.repo.createRecord",
      { repo: did, collection: "app.bsky.feed.post", record },
      token
    );
    uri = posted?.uri || null;
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to post to Bluesky.";
    return json({ ok: false, error: msg }, 502);
  }

  const rkey = uri ? uri.split("/").pop() : null;
  const url = rkey ? `https://bsky.app/profile/${handleOrDid}/post/${rkey}` : uri;
  const nowISO = new Date().toISOString();

  // Mark the queue row posted. Best-effort: the post already went out, so a DB
  // hiccup here should not read as a failure to the operator.
  await svc
    .from("bluesky_queue")
    .update({
      status: "posted",
      final_text: text,
      selected_slug: slug,
      posted_uri: uri,
      posted_at: nowISO,
    })
    .eq("id", id);

  // Upsert the per-edition ledger so the CI poster treats this edition as done.
  // Ignore conflicts (a ledger row may already exist for this date).
  await svc
    .from("bluesky_posts")
    .upsert(
      { edition_date: row.run_date, posted_at: nowISO, post_uri: uri },
      { onConflict: "edition_date", ignoreDuplicates: true }
    );

  return json({ ok: true, url });
}
