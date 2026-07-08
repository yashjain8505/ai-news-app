#!/usr/bin/env node
// Posts the day's Wortins edition to Bluesky as a short post + link card.
//
// Uses the AT Protocol (Bluesky's official, free API) — unlike Substack there's
// no Cloudflare wall, so this works reliably from CI. Flow: open a session with
// an APP PASSWORD (not the account login), optionally upload the lead image as a
// link-card thumbnail, then create an app.bsky.feed.post record with an external
// embed pointing at the edition. Self-contained: global fetch only, no npm deps.
// Idempotent per edition_date via the bluesky_posts ledger.
//
// Env:
//   SUPABASE_URL           (default: the project URL below)
//   SUPABASE_SERVICE_KEY   service-role key (CI). For a local DRY_RUN read you
//                          can pass SUPABASE_ANON_KEY instead (active items are
//                          public), but the ledger write needs the service key.
//   BLUESKY_IDENTIFIER     handle (e.g. wortins.bsky.social) or account email
//   BLUESKY_APP_PASSWORD   an App Password (Settings > App Passwords), NOT the
//                          account's login password
//   SITE_URL               (default https://www.wortins.com)
//   EDITION_DATE           (optional YYYY-MM-DD; default = latest edition w/ items)
//   DAILY_COUNT            (default 3) top stories considered for the card image
//   DRY_RUN=1              build + print the post, send nothing
//   FORCE=1                post even if this edition was already posted

const SUPABASE_URL =
  process.env.SUPABASE_URL || "https://zrjbzowohsgjbrhsldfi.supabase.co";
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY;
const IDENTIFIER = process.env.BLUESKY_IDENTIFIER;
const APP_PASSWORD = process.env.BLUESKY_APP_PASSWORD;
const SITE_URL = (process.env.SITE_URL || "https://www.wortins.com").replace(/\/$/, "");
const PDS = "https://bsky.social";
const DRY_RUN = process.env.DRY_RUN === "1" || process.env.DRY_RUN === "true";
const FORCE = process.env.FORCE === "1" || process.env.FORCE === "true";
const DAILY_COUNT = Math.max(1, Number(process.env.DAILY_COUNT) || 3);
const MAX_CHARS = 300; // Bluesky post limit (graphemes; we stay comfortably under)

function die(msg) {
  console.error(`✗ ${msg}`);
  process.exit(1);
}

async function sb(path, init) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
  });
  if (!res.ok) throw new Error(`Supabase ${path} → ${res.status} ${(await res.text()).slice(0, 200)}`);
  const t = await res.text();
  return t ? JSON.parse(t) : null;
}

async function xrpc(nsid, body, token) {
  const res = await fetch(`${PDS}/xrpc/${nsid}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Bluesky ${nsid} → ${res.status} ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : null;
}

function clip(s, n) {
  s = (s || "").replace(/\s+/g, " ").trim();
  return s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s;
}

function buildText(edition, daily) {
  const tag = "New tools, funding, applied AI, minus the big-lab hype. The 5-minute briefing 👇";
  const head = edition?.headline?.trim() || daily[0]?.title?.trim() || "The day's most interesting AI news";
  const reserve = tag.length + 2 + 4; // blank line + "🗞️ " prefix
  return `🗞️ ${clip(head, MAX_CHARS - reserve)}\n\n${tag}`;
}

// Best-effort: upload the lead story image as the link-card thumbnail.
async function uploadThumb(imageUrl, token) {
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
    return (await res.json())?.blob || null;
  } catch {
    return null;
  }
}

async function main() {
  if (!SUPABASE_KEY) die("SUPABASE_SERVICE_KEY (or SUPABASE_ANON_KEY for a dry run) is required");
  // Not configured yet -> skip cleanly (exit 0) instead of failing every day.
  if ((!IDENTIFIER || !APP_PASSWORD) && !DRY_RUN) {
    console.log("BLUESKY_IDENTIFIER / BLUESKY_APP_PASSWORD not set, skipping. Add the secrets to enable Bluesky posting.");
    return;
  }

  let dateISO = process.env.EDITION_DATE || "";
  if (!dateISO) {
    const latest = await sb("items?is_active=eq.true&select=edition_date&order=edition_date.desc&limit=1");
    dateISO = latest?.[0]?.edition_date || "";
  }
  if (!dateISO) die("No edition with items found");

  if (!FORCE) {
    const already = await sb(`bluesky_posts?edition_date=eq.${dateISO}&select=posted_at,post_uri`);
    if (already?.length) {
      console.log(`✓ Already posted ${dateISO}${already[0].post_uri ? ` (${already[0].post_uri})` : ""}. Skipping (FORCE=1 to repost).`);
      return;
    }
  }

  const items = await sb(
    `items?is_active=eq.true&edition_date=eq.${dateISO}&section=eq.daily&select=title,source,rank,slug,image_url&order=rank.asc`
  );
  if (!items?.length) die(`No active daily items for ${dateISO}`);
  const daily = items.slice(0, DAILY_COUNT);
  const editionRows = await sb(`editions?edition_date=eq.${dateISO}&select=headline,synopsis`);
  const edition = editionRows?.[0] || null;

  const editionUrl = `${SITE_URL}/edition/${dateISO}`;
  const text = buildText(edition, daily);
  const cardTitle = clip(edition?.headline || "The Wortins Daily", 120);
  const cardDesc = clip(
    edition?.synopsis ||
      "The day's most interesting AI news, tuned to you. Tools, funding, applied AI, beyond the big-lab hype.",
    200
  );

  console.log(`→ Edition ${dateISO} · ${daily.length} stories · ${editionUrl}`);
  console.log("─".repeat(56));
  console.log(text);
  console.log(`[card] ${cardTitle} · ${cardDesc}`);
  console.log("─".repeat(56));

  if (DRY_RUN) {
    console.log("\n[DRY RUN] Nothing posted.");
    return;
  }

  const session = await xrpc("com.atproto.server.createSession", {
    identifier: IDENTIFIER,
    password: APP_PASSWORD,
  });
  const token = session?.accessJwt;
  const did = session?.did;
  if (!token || !did) die("Bluesky auth failed (no session token). Check BLUESKY_IDENTIFIER / BLUESKY_APP_PASSWORD.");

  const thumbUrl = daily.find((d) => d.image_url)?.image_url || null;
  const thumb = thumbUrl ? await uploadThumb(thumbUrl, token) : null;

  const record = {
    $type: "app.bsky.feed.post",
    text,
    createdAt: new Date().toISOString(),
    embed: {
      $type: "app.bsky.embed.external",
      external: { uri: editionUrl, title: cardTitle, description: cardDesc, ...(thumb ? { thumb } : {}) },
    },
  };
  const posted = await xrpc(
    "com.atproto.repo.createRecord",
    { repo: did, collection: "app.bsky.feed.post", record },
    token
  );
  const uri = posted?.uri || null;
  const rkey = uri ? uri.split("/").pop() : null;
  const postUrl = rkey ? `https://bsky.app/profile/${session.handle || did}/post/${rkey}` : uri;
  console.log(`✓ Posted → ${postUrl}`);

  await sb("bluesky_posts", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates" },
    body: JSON.stringify({ edition_date: dateISO, posted_at: new Date().toISOString(), post_uri: uri }),
  });
  console.log(`✓ Recorded post for ${dateISO}.`);
}

main().catch((e) => die(e.message));
