// Builds the query set for the AI-visibility tracker: the head GEO queries
// Wortins wants to own, plus each blog post's `keyword:`. To cover the whole
// (growing) corpus over time rather than only the newest posts, blog keywords
// are ROTATED — least-recently-checked first, using the last check time from the
// `ai_visibility` table. Writes /tmp/visibility-queries.json, capped at
// MAX_QUERIES so a run stays cheap.
//
// Indexing gate (added 2026-09-09). A blog keyword whose target page Google has
// not indexed cannot be cited by anything that searches the web, so "not cited"
// for it would say nothing about the content. Those queries are logged straight
// to the table as `indexed=false` (an indexing problem, not a content gap) and
// are NOT handed to the checker. Indexed-ness comes from the site's own
// /api/seo/indexed endpoint (Search Console URL Inspection behind it); when the
// endpoint is unavailable the query is checked anyway with indexed=null.

import fs from "node:fs";

const DIR = "content/blog";
const MAX = parseInt(process.env.MAX_QUERIES || "12", 10);
const SUPABASE_URL = process.env.SUPABASE_URL || "";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || "";
const SITE_URL = (process.env.SITE_URL || "https://www.wortins.com").replace(/\/+$/, "");

// The head terms the whole GEO strategy is aimed at — always checked.
const HEAD = [
  "AI funding tracker",
  "biggest AI funding rounds 2026",
  "AI IPOs 2026",
  "biggest AI acquisitions 2026",
  "latest AI news today",
];

const sbHeaders = { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` };

// last check time (ms) per query, so we can re-check the stalest first.
async function lastCheckedMap() {
  const map = new Map();
  if (!SUPABASE_URL || !SERVICE_KEY) return map;
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/ai_visibility?select=query,checked_at&order=checked_at.desc`,
      { headers: sbHeaders },
    );
    if (!res.ok) return map;
    const rows = await res.json();
    for (const r of rows) {
      const k = String(r.query || "").toLowerCase();
      if (k && !map.has(k)) map.set(k, Date.parse(r.checked_at) || 0); // desc order → first = newest
    }
  } catch (e) {
    console.log("last-checked lookup skipped:", e.message);
  }
  return map;
}

// Every blog post's keyword, with the page it is meant to surface.
function blogKeywords() {
  const out = [];
  const seen = new Set();
  try {
    for (const f of fs.readdirSync(DIR).filter((f) => f.endsWith(".md"))) {
      const raw = fs.readFileSync(`${DIR}/${f}`, "utf8");
      const m = raw.match(/^keyword:\s*(.+)$/m);
      if (!m) continue;
      const kw = m[1].trim().replace(/^["']|["']$/g, "");
      const k = kw.toLowerCase();
      if (kw && !seen.has(k)) {
        seen.add(k);
        out.push({ query: kw, target_url: `${SITE_URL}/blog/${f.replace(/\.md$/, "")}` });
      }
    }
  } catch (e) {
    console.log("no blog dir / read error:", e.message);
  }
  return out;
}

// Ask the site whether Google has indexed each page. Returns a Map url → result
// ({ indexed, coverageState, lastCrawl }) or an empty Map when unavailable.
async function indexedStatus(urls) {
  const map = new Map();
  if (urls.length === 0 || !SERVICE_KEY) return map;
  try {
    const res = await fetch(`${SITE_URL}/api/seo/indexed`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-seo-token": SERVICE_KEY },
      body: JSON.stringify({ urls }),
      signal: AbortSignal.timeout(60_000),
    });
    if (!res.ok) {
      console.log(`indexed check unavailable (HTTP ${res.status}) — checking without the gate`);
      return map;
    }
    const j = await res.json();
    for (const r of j.results ?? []) map.set(r.url, r);
  } catch (e) {
    console.log("indexed check skipped:", e.message);
  }
  return map;
}

// Record an unindexed target straight to the table: no web search needed, and
// the row must never read as a content gap.
async function logUnindexed(entry, status) {
  if (!SUPABASE_URL || !SERVICE_KEY) return;
  const notes = `Target page not indexed by Google (${status.coverageState ?? "unknown state"}; last crawl ${status.lastCrawl ? status.lastCrawl.slice(0, 10) : "never"}). Indexing problem, not a content gap — fix crawl/indexing, do not write more.`;
  const body = {
    query: entry.query,
    engine: "index-check",
    cited: false,
    indexed: false,
    target_url: entry.target_url,
    best_position: null,
    wortins_url: null,
    top_sources: [],
    notes,
  };
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/ai_visibility`, {
      method: "POST",
      headers: { ...sbHeaders, "content-type": "application/json", Prefer: "return=minimal" },
      body: JSON.stringify(body),
    });
    if (!res.ok) console.log(`could not log unindexed row for "${entry.query}": HTTP ${res.status}`);
  } catch (e) {
    console.log(`could not log unindexed row for "${entry.query}":`, e.message);
  }
}

const checked = await lastCheckedMap();
const headSet = new Set(HEAD.map((q) => q.toLowerCase()));

// Blog keywords, least-recently-checked first (never-checked = 0 = first).
const rotated = blogKeywords()
  .filter((e) => !headSet.has(e.query.toLowerCase()))
  .sort((a, b) => (checked.get(a.query.toLowerCase()) ?? 0) - (checked.get(b.query.toLowerCase()) ?? 0));

const slots = Math.max(0, MAX - HEAD.length);
// Look a little past the slot count so unindexed pages can be skipped without
// leaving the checker short of queries.
const candidates = rotated.slice(0, slots * 2);
const status = await indexedStatus(candidates.map((c) => c.target_url));

const blogList = [];
let skipped = 0;
for (const c of candidates) {
  if (blogList.length >= slots) break;
  const s = status.get(c.target_url);
  if (s && s.indexed === false) {
    await logUnindexed(c, s);
    skipped++;
    continue;
  }
  blogList.push({ ...c, indexed: s ? Boolean(s.indexed) : null });
}

const list = [
  ...HEAD.map((q) => ({ query: q, target_url: null, indexed: null })),
  ...blogList,
];
fs.writeFileSync("/tmp/visibility-queries.json", JSON.stringify(list, null, 2));
console.log(
  `visibility queries (${list.length} of ${HEAD.length + rotated.length} total; stalest first; ${skipped} unindexed target(s) logged and skipped):`,
);
for (const e of list) {
  const t = checked.get(e.query.toLowerCase());
  const idx = e.indexed === null ? "" : e.indexed ? " · indexed" : " · NOT indexed";
  console.log(`  - ${e.query}${t ? ` (last ${new Date(t).toISOString().slice(0, 10)})` : " (never)"}${idx}`);
}
