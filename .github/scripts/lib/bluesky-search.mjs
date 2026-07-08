#!/usr/bin/env node
// Finds ~5 recent, high-quality Bluesky posts about AI that are good candidates
// for a Wortins account to reply to (organic growth engagement).
//
// Uses the AT Protocol search endpoint app.bsky.feed.searchPosts on the PUBLIC
// AppView (public.api.bsky.app) — no auth required, so this works from CI with
// nothing but a network connection. Self-contained: global fetch only, no npm
// deps, same xrpc-style helper as post-bluesky.mjs.
//
// Strategy: search a rotating set of AI topics with sort=top, merge the results,
// then filter down to English, non-reply, reasonably-long posts with some
// traction that were posted recently, de-duplicated so we never surface more
// than one post per author. Rank by likeCount and return the top `limit`.
//
// Env:
//   BLUESKY_IDENTIFIER   (optional) our own handle — excluded from results so we
//                        never suggest replying to ourselves
//
// Direct run:  node .github/scripts/lib/bluesky-search.mjs

// Public AppView hosts — read-only AT Proto queries, no session/token needed.
// Quirk: app.bsky.feed.searchPosts is served fine (200, no auth) by the primary
// api.bsky.app frontend, but the public.api.bsky.app frontend returns a 403 WAF
// page for that specific endpoint from some networks (CI/egress included). We
// try the primary first and fall back to the public one so we're robust either
// way. Other read endpoints (getProfile, etc.) work on both.
const APPVIEW_HOSTS = ["https://api.bsky.app", "https://public.api.bsky.app"];

// A real UA is polite and avoids the odd bot filter; global fetch's default is
// undici's UA, which some edges treat with suspicion.
const USER_AGENT = "wortins-bsky-search/1.0 (+https://www.wortins.com)";

// Own handle, so we never suggest replying to our own posts. The identifier can
// be a handle or an email; we only match it when it looks like a handle.
const SELF_HANDLE = normalizeHandle(process.env.BLUESKY_IDENTIFIER);

// Rotating set of AI topics. We shuffle and sample a few of these per run so
// repeated runs don't keep hitting the same corner of the firehose.
const TOPICS = [
  "AI agents",
  "LLM",
  "AI startup",
  "open source AI",
  "AI tools",
  "Anthropic",
  "OpenAI",
  "AI regulation",
  "AI research",
];

// Quality thresholds for a good reply target.
const MIN_TEXT_LEN = 40; // long enough to be a real post, not a one-liner
const MIN_LIKES = 3; // some traction, but not so viral we're shouting into a mob
const MAX_AGE_MS = 2 * 24 * 60 * 60 * 1000; // posted within the last ~2 days
const TOPICS_PER_RUN = 6; // how many of the rotating topics to actually query
const PER_QUERY = 25; // results to pull per query before filtering

function normalizeHandle(v) {
  if (!v) return null;
  const s = String(v).trim().toLowerCase();
  // Emails aren't handles; only treat dotted, @-free identifiers as handles.
  if (!s || s.includes("@")) return null;
  return s.replace(/^@/, "");
}

// GET against the public AppView. Mirrors the xrpc() helper in post-bluesky.mjs
// but for read-only queries (searchPosts is a query, i.e. HTTP GET with params).
// Tries each AppView host in turn so a per-host block (see APPVIEW_HOSTS) doesn't
// sink the query; throws with the last error only if every host fails.
async function xrpcGet(nsid, params) {
  const qs = new URLSearchParams(params).toString();
  let lastErr;
  for (const host of APPVIEW_HOSTS) {
    try {
      const res = await fetch(`${host}/xrpc/${nsid}?${qs}`, {
        headers: { Accept: "application/json", "User-Agent": USER_AGENT },
      });
      const text = await res.text();
      if (!res.ok) throw new Error(`${host} → ${res.status} ${text.slice(0, 200)}`);
      return text ? JSON.parse(text) : null;
    } catch (err) {
      lastErr = err;
    }
  }
  throw new Error(`Bluesky ${nsid} failed on all hosts: ${lastErr?.message || "unknown"}`);
}

// Fisher–Yates, so the topic rotation is actually random across runs.
function sample(arr, n) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a.slice(0, n);
}

// rkey = last path segment of the AT uri (at://did/collection/rkey).
function rkeyOf(uri) {
  return (uri || "").split("/").pop();
}

function webUrl(handle, uri) {
  return `https://bsky.app/profile/${handle}/post/${rkeyOf(uri)}`;
}

// Is this post a good reply target? Returns true only if it clears every gate.
function isGoodTarget(post, nowMs) {
  const record = post?.record;
  if (!post?.uri || !record) return false;
  // Skip replies — we want to engage with original posts, not join a thread.
  if (record.reply) return false;

  const text = (record.text || "").trim();
  if (text.length < MIN_TEXT_LEN) return false;

  if ((post.likeCount || 0) < MIN_LIKES) return false;

  const handle = (post.author?.handle || "").toLowerCase();
  if (SELF_HANDLE && handle === SELF_HANDLE) return false;

  const created = Date.parse(record.createdAt || "");
  if (!Number.isFinite(created)) return false;
  if (nowMs - created > MAX_AGE_MS) return false;
  if (created > nowMs + 60_000) return false; // reject obviously-bogus future dates

  return true;
}

// Normalize a raw AppView post into the shape the caller expects.
function toTarget(post) {
  const handle = post.author?.handle || "";
  return {
    uri: post.uri,
    cid: post.cid,
    authorHandle: handle,
    authorDisplay: post.author?.displayName || handle,
    text: (post.record?.text || "").trim(),
    url: webUrl(handle, post.uri),
    likeCount: post.likeCount || 0,
    createdAt: post.record?.createdAt || null,
  };
}

/**
 * Find recent, high-quality AI posts worth replying to.
 *
 * @param {object}  [opts]
 * @param {number}  [opts.limit=5]     max number of targets to return
 * @param {object}  [opts.session]     accepted for API symmetry; searchPosts is
 *                                     public so this is unused (pass null)
 * @returns {Promise<Array<{uri,cid,authorHandle,authorDisplay,text,url,likeCount,createdAt}>>}
 */
export async function findReplyTargets({ limit = 5, session = null } = {}) {
  const nowMs = Date.now();
  const topics = sample(TOPICS, TOPICS_PER_RUN);

  const byUri = new Map();
  for (const topic of topics) {
    // Defensive: one failing query must not kill the whole run.
    try {
      const data = await xrpcGet("app.bsky.feed.searchPosts", {
        q: topic,
        limit: String(PER_QUERY),
        sort: "top",
        lang: "en",
      });
      for (const post of data?.posts || []) {
        if (!isGoodTarget(post, nowMs)) continue;
        // De-dupe by uri; keep whichever copy reports more likes.
        const existing = byUri.get(post.uri);
        if (!existing || (post.likeCount || 0) > (existing.likeCount || 0)) {
          byUri.set(post.uri, post);
        }
      }
    } catch (err) {
      console.error(`  ! searchPosts "${topic}" failed: ${err.message}`);
    }
  }

  // Rank by likeCount desc, then keep at most one post per author.
  const ranked = [...byUri.values()].sort((a, b) => (b.likeCount || 0) - (a.likeCount || 0));
  const seenAuthors = new Set();
  const out = [];
  for (const post of ranked) {
    const handle = (post.author?.handle || "").toLowerCase();
    if (seenAuthors.has(handle)) continue;
    seenAuthors.add(handle);
    out.push(toTarget(post));
    if (out.length >= limit) break;
  }
  return out;
}

// --- Direct-run block --------------------------------------------------------
// Guarded so `import`ing this module never triggers the CLI. Runs the search and
// pretty-prints the results: node .github/scripts/lib/bluesky-search.mjs
// argv[1] may be a relative path, so resolve it to a file:// URL (via the
// pathToFileURL helper) before comparing — a naive `file://${argv[1]}` fails.
const isMain = await (async () => {
  try {
    const { pathToFileURL } = await import("node:url");
    return import.meta.url === pathToFileURL(process.argv[1]).href;
  } catch {
    return false;
  }
})();

if (isMain) {
  findReplyTargets()
    .then((targets) => {
      if (!targets.length) {
        console.log("No reply targets found (all queries filtered out or failed).");
        return;
      }
      console.log(`Found ${targets.length} reply target(s):\n`);
      targets.forEach((t, i) => {
        console.log(`${i + 1}. @${t.authorHandle} (${t.authorDisplay}) · ♥ ${t.likeCount} · ${t.createdAt}`);
        console.log(`   ${t.text.replace(/\s+/g, " ").slice(0, 180)}`);
        console.log(`   ${t.url}`);
        console.log("");
      });
    })
    .catch((e) => {
      console.error(`✗ ${e.message}`);
      process.exit(1);
    });
}
