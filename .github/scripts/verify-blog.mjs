// Post-write guard for the funding-blog pipeline. HTTP-checks the cited source of
// every freshly-drafted post and DELETES any whose primary source can't be reached
// (404 / 410 / DNS or connection failure) — so an auto-drafted post with a
// fabricated or dead citation never reaches the PR. Blocked-by-bot responses
// (401 / 403 / 405 / 429) count as "exists but gated" and are kept; 5xx counts as
// "up but erroring" and is kept with a flag. Also flags internal /blog links whose
// target file is missing. Always exits 0 — the workflow decides if any survived.

import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const BLOG_DIR = "content/blog";

// Newly written (untracked) markdown files under content/blog.
function newPosts() {
  const out = execSync(`git ls-files --others --exclude-standard -- ${BLOG_DIR}`, {
    encoding: "utf8",
  });
  return out
    .split("\n")
    .map((s) => s.trim())
    .filter((f) => f.endsWith(".md"));
}

function sourceUrls(body) {
  const urls = [];
  let m;
  const src = /^Source:.*?\((https?:\/\/[^)\s]+)\)/gim;
  while ((m = src.exec(body))) urls.push(m[1]);
  if (urls.length === 0) {
    const any = /\]\((https?:\/\/[^)\s]+)\)/g;
    while ((m = any.exec(body))) urls.push(m[1]);
  }
  return [...new Set(urls)];
}

function internalSlugs(body) {
  const slugs = [];
  let m;
  const re = /\]\(\/blog\/([a-z0-9-]+)\)/gi;
  while ((m = re.exec(body))) slugs.push(m[1]);
  return [...new Set(slugs)];
}

// Returns { ok, status, flag? }. ok=false means the source is dead → drop.
async function checkUrl(url) {
  const headers = {
    "user-agent":
      "Mozilla/5.0 (compatible; WortinsBot/1.0; +https://www.wortins.com)",
    accept: "text/html,application/xhtml+xml,*/*",
  };
  for (let attempt = 0; attempt < 3; attempt++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 15000);
    try {
      const res = await fetch(url, {
        method: "GET",
        redirect: "follow",
        headers,
        signal: ctrl.signal,
      });
      clearTimeout(timer);
      const s = res.status;
      if (s === 404 || s === 410) return { ok: false, status: s };
      if (s >= 500) return { ok: true, status: s, flag: `source returned ${s}` };
      return { ok: true, status: s }; // 2xx/3xx and 401/403/405/429 => exists
    } catch {
      clearTimeout(timer);
      if (attempt === 2) return { ok: false, status: 0 }; // DNS/connection failure
      await new Promise((r) => setTimeout(r, 1500));
    }
  }
  return { ok: false, status: 0 };
}

const files = newPosts();
const existing = new Set(
  fs
    .readdirSync(BLOG_DIR)
    .filter((f) => f.endsWith(".md"))
    .map((f) => f.replace(/\.md$/, ""))
);

const kept = [];
const dropped = [];
const flags = [];

for (const file of files) {
  const slug = path.basename(file, ".md");
  const raw = fs.readFileSync(file, "utf8");
  const srcs = sourceUrls(raw);

  if (srcs.length === 0) {
    fs.rmSync(file);
    dropped.push(`\`${slug}\` — no source link in the post`);
    continue;
  }

  const primary = srcs[0];
  const r = await checkUrl(primary);
  if (!r.ok) {
    fs.rmSync(file);
    dropped.push(
      `\`${slug}\` — source ${r.status === 0 ? "unreachable" : r.status}: ${primary}`
    );
    continue;
  }
  if (r.flag) flags.push(`\`${slug}\` — ${r.flag} (source likely fine, just erroring)`);
  for (const s of internalSlugs(raw)) {
    if (!existing.has(s)) flags.push(`\`${slug}\` — internal link \`/blog/${s}\` has no matching file`);
  }
  kept.push(slug);
  console.log(`  ok  ${slug}  (${r.status})  ${primary}`);
}

const lines = [
  `Verified ${files.length} drafted post(s): **${kept.length} kept**, **${dropped.length} dropped**.`,
];
if (dropped.length) lines.push("", "**Dropped — dead or absent source:**", ...dropped.map((d) => `- ${d}`));
if (flags.length) lines.push("", "**Flags — review:**", ...flags.map((f) => `- ${f}`));
const summary = lines.join("\n");

fs.writeFileSync("/tmp/verify-blog.md", summary + "\n");
console.log("\n" + summary);
