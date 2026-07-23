// Builds the query set for the AI-visibility tracker: the head GEO queries
// Wortins wants to own, plus the `keyword:` each blog post targets. Writes
// /tmp/visibility-queries.json, capped at MAX_QUERIES so a run stays cheap.

import fs from "node:fs";

const DIR = "content/blog";
const MAX = parseInt(process.env.MAX_QUERIES || "12", 10);

// The head terms the whole GEO strategy is aimed at.
const HEAD = [
  "AI funding tracker",
  "biggest AI funding rounds 2026",
  "AI IPOs 2026",
  "biggest AI acquisitions 2026",
  "latest AI news today",
];

const set = new Set(HEAD.map((q) => q.toLowerCase()));
const queries = [...HEAD];

try {
  const files = fs
    .readdirSync(DIR)
    .filter((f) => f.endsWith(".md"))
    // newest posts first by name isn't reliable; use mtime where available.
    .map((f) => ({ f, m: fs.statSync(`${DIR}/${f}`).mtimeMs }))
    .sort((a, b) => b.m - a.m)
    .map((x) => x.f);

  for (const f of files) {
    if (queries.length >= MAX) break;
    const raw = fs.readFileSync(`${DIR}/${f}`, "utf8");
    const m = raw.match(/^keyword:\s*(.+)$/m);
    if (!m) continue;
    const kw = m[1].trim().replace(/^["']|["']$/g, "");
    if (kw && !set.has(kw.toLowerCase())) {
      set.add(kw.toLowerCase());
      queries.push(kw);
    }
  }
} catch (e) {
  console.log("no blog dir / read error:", e.message);
}

const list = queries.slice(0, MAX);
fs.writeFileSync("/tmp/visibility-queries.json", JSON.stringify(list, null, 2));
console.log(`visibility queries (${list.length}):`);
for (const q of list) console.log("  -", q);
