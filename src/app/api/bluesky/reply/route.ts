import type { NextRequest } from "next/server";
import { supabaseService } from "@/lib/supabase-service";

// Human-in-the-loop "Post reply" endpoint for the /social review screen. Same AT
// Protocol flow as the post route, but the created record carries a `reply` with
// root + parent pointing at the target post (for v1 root == parent is fine).
// Guarded by BLUESKY_REVIEW_SECRET.

export const dynamic = "force-dynamic";

const PDS = "https://bsky.social";
const MAX_CHARS = 300; // Bluesky post limit (graphemes)

type ReplyBody = {
  id?: unknown;
  key?: unknown;
  text?: unknown;
};

type BskySession = {
  accessJwt?: string;
  did?: string;
  handle?: string;
};

// Same xrpc helper as post-bluesky.mjs.
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

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

// Build app.bsky.richtext link facets for any URLs in the text, so a pasted
// wortins.com article link renders as a real clickable link on Bluesky. Offsets
// are UTF-8 byte positions, per the AT Protocol facet spec.
type LinkFacet = {
  index: { byteStart: number; byteEnd: number };
  features: Array<{ $type: "app.bsky.richtext.facet#link"; uri: string }>;
};
function linkFacets(text: string): LinkFacet[] {
  const facets: LinkFacet[] = [];
  const enc = new TextEncoder();
  const re = /https?:\/\/[^\s\])]+/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const url = m[0].replace(/[.,;:!?)\]]+$/, ""); // drop trailing punctuation
    const start = m.index;
    const end = start + url.length;
    facets.push({
      index: {
        byteStart: enc.encode(text.slice(0, start)).length,
        byteEnd: enc.encode(text.slice(0, end)).length,
      },
      features: [{ $type: "app.bsky.richtext.facet#link", uri: url }],
    });
  }
  return facets;
}

export async function POST(req: NextRequest): Promise<Response> {
  let body: ReplyBody;
  try {
    body = (await req.json()) as ReplyBody;
  } catch {
    return json({ ok: false, error: "Invalid JSON body." }, 400);
  }

  const secret = process.env.BLUESKY_REVIEW_SECRET;
  if (!secret || body.key !== secret) {
    return json({ ok: false, error: "Not authorized." }, 401);
  }

  const id = typeof body.id === "string" ? body.id : "";
  const text = typeof body.text === "string" ? body.text.trim() : "";
  if (!text) return json({ ok: false, error: "Reply text is empty." }, 400);
  if (text.length > MAX_CHARS) {
    return json(
      { ok: false, error: `Reply is ${text.length} chars, over the ${MAX_CHARS} limit.` },
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

  // Load the target post's uri + cid to thread the reply.
  const { data: row, error: rowErr } = await svc
    .from("bluesky_reply_queue")
    .select("id, target_uri, target_cid")
    .eq("id", id)
    .maybeSingle<{ id: string; target_uri: string; target_cid: string }>();
  if (rowErr) return json({ ok: false, error: "Could not load the reply row." }, 500);
  if (!row) return json({ ok: false, error: "Reply row not found." }, 404);
  if (!row.target_uri || !row.target_cid) {
    return json({ ok: false, error: "Reply target is missing uri or cid." }, 400);
  }

  // Auth + create the reply.
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

    const ref = { uri: row.target_uri, cid: row.target_cid };
    const facets = linkFacets(text);
    const record = {
      $type: "app.bsky.feed.post",
      text,
      createdAt: new Date().toISOString(),
      reply: { root: ref, parent: ref },
      ...(facets.length ? { facets } : {}),
    };
    const posted = await xrpc<{ uri?: string }>(
      "com.atproto.repo.createRecord",
      { repo: did, collection: "app.bsky.feed.post", record },
      token
    );
    uri = posted?.uri || null;
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to post the reply.";
    return json({ ok: false, error: msg }, 502);
  }

  const rkey = uri ? uri.split("/").pop() : null;
  const url = rkey ? `https://bsky.app/profile/${handleOrDid}/post/${rkey}` : uri;

  // Mark the reply row posted (best-effort; the reply already went out).
  await svc
    .from("bluesky_reply_queue")
    .update({
      status: "posted",
      final_reply: text,
      posted_uri: uri,
      posted_at: new Date().toISOString(),
    })
    .eq("id", id);

  return json({ ok: true, url });
}
