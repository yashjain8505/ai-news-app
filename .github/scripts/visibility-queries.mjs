// Builds the query set for the AI-visibility tracker: the head GEO queries
// Wortins wants to own, plus each blog post's `keyword:`. To cover the whole
// (growing) corpus over time rather than only the newest posts, blog keywords
// are ROTATED — least-recently-checked first, using the last check time from the
// `ai_visibility` table. Writes /tmp/visibility-queries.json, capped at
// MAX_QUERIES so a run stays cheap.

import fs from "node:fs";

const DIR = "content/blog";
const MAX = parseInt(process.env.MAX_QUERIES || "12", 10);
const SUPABASE_URL = process.env.SUPABASE_URL || "";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || "";

// The head terms the whole GEO strategy is aimed at — always checked.
const HEAD = [
  "AI funding tracker",
  "biggest AI funding rounds 2026",
  "AI IPOs 2026",
  "biggest AI acquisitions 2026",
  "latest AI news today",
];

// last check time (ms) per query, so we can re-check the stalest first.
async function lastCheckedMap() {
  const map = new Map();
  if (!SUPABASE_URL || !SERVICE_KEY) return map;
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/ai_visibility?select=query,checked_at&order=checked_at.desc`,
      { headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` } },
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

// Collect every blog post's keyword.
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
        out.push(kw);
      }
    }
  } catch (e) {
    console.log("no blog dir / read error:", e.message);
  }
  return out;
}

const checked = await lastCheckedMap();
const headSet = new Set(HEAD.map((q) => q.toLowerCase()));

// Blog keywords, least-recently-checked first (never-checked = 0 = first).
const rotated = blogKeywords()
  .filter((kw) => !headSet.has(kw.toLowerCase()))
  .sort((a, b) => (checked.get(a.toLowerCase()) ?? 0) - (checked.get(b.toLowerCase()) ?? 0));

const list = [...HEAD, ...rotated].slice(0, MAX);
fs.writeFileSync("/tmp/visibility-queries.json", JSON.stringify(list, null, 2));
console.log(`visibility queries (${list.length} of ${HEAD.length + rotated.length} total; stalest first):`);
for (const q of list) {
  const t = checked.get(q.toLowerCase());
  console.log(`  - ${q}${t ? ` (last ${new Date(t).toISOString().slice(0, 10)})` : " (never)"}`);
}
