// Bundle content/blog/*.md into a JSON module at build time.
//
// The blog used to be read with fs.readdirSync at request time. That works on a
// Node server and nowhere else: Cloudflare Workers, and edge runtimes generally,
// have no filesystem. The sitemap and the .md twin route both need blog data at
// runtime (the sitemap mixes it with live Supabase rows), so making the blog
// pages static was not enough on its own.
//
// Reading the repository at build time and emitting the result is portable, and
// it is also just correct: the content ships with the deployment and cannot
// change between builds, so there was never a reason to touch the disk per
// request.
//
// Output is gitignored — `prebuild`/`predev` regenerate it, so the robot's
// commits never carry a second copy of every post.

import { readdirSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const BLOG_DIR = path.join(root, "content", "blog");
const OUT = path.join(root, "src", "generated", "blog-content.json");

let files = [];
try {
  files = readdirSync(BLOG_DIR).filter((f) => f.endsWith(".md"));
} catch {
  // No content directory is a valid state (a fresh clone, a preview branch).
  // Emit an empty index rather than failing the build.
}

const entries = files.map((file) => ({
  slug: file.replace(/\.md$/, ""),
  raw: readFileSync(path.join(BLOG_DIR, file), "utf8"),
}));

mkdirSync(path.dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify(entries));

const kb = (JSON.stringify(entries).length / 1024).toFixed(0);
console.log(`blog index: ${entries.length} posts → src/generated/blog-content.json (${kb} KB)`);
