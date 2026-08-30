// File-based blog engine. Posts live as Markdown files in `content/blog/*.md`
// with a small frontmatter block. No database and no runtime env needed — the
// blog renders purely from the repo, so it ships on deploy and is fully
// reviewable in the PR. (A DB-backed authoring path is a documented Phase 2.)
//
// Frontmatter values are parsed as: JSON when they start with [ { or " ,
// otherwise the raw (quote-trimmed) string. Authoring is one file per post.

import fs from "node:fs";
import path from "node:path";

export interface BlogFaq {
  q: string;
  a: string;
}

export interface BlogPost {
  slug: string;
  title: string;
  description: string;
  date: string; // ISO published date (YYYY-MM-DD or full ISO)
  updated?: string; // ISO last-updated date
  releaseOn?: string; // YYYY-MM-DD; hide from the site until this date (see isReleased)
  tags: string[];
  keyword?: string; // primary target query, for our own tracking
  category?: string; // e.g. "funding"
  hero?: string; // absolute image URL for OG/hero
  faq: BlogFaq[];
  related: string[]; // sibling post slugs to cross-link
  body: string; // markdown body (frontmatter stripped)
  readingTime: number; // minutes
}

const BLOG_DIR = path.join(process.cwd(), "content", "blog");

// Parse a `key: value` frontmatter block delimited by leading/trailing `---`.
// Returns the data map + the remaining markdown body.
export function parseFrontmatter(raw: string): {
  data: Record<string, unknown>;
  body: string;
} {
  const text = raw.replace(/^﻿/, "").replace(/\r\n/g, "\n");
  const m = text.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!m) return { data: {}, body: text.trim() };

  const data: Record<string, unknown> = {};
  for (const line of m[1].split("\n")) {
    if (!line.trim() || /^\s*#/.test(line)) continue;
    const idx = line.indexOf(":");
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    const rest = line.slice(idx + 1).trim();
    if (!key) continue;
    if (/^[[{"]/.test(rest)) {
      try {
        data[key] = JSON.parse(rest);
        continue;
      } catch {
        // fall through to raw string
      }
    }
    data[key] = rest.replace(/^["']|["']$/g, "");
  }
  return { data, body: m[2].trim() };
}

function asStringArray(v: unknown): string[] {
  if (Array.isArray(v)) return v.map(String);
  if (typeof v === "string" && v.trim())
    return v.split(",").map((s) => s.trim()).filter(Boolean);
  return [];
}

function asFaq(v: unknown): BlogFaq[] {
  if (!Array.isArray(v)) return [];
  return v
    .map((f) => {
      if (f && typeof f === "object" && "q" in f && "a" in f) {
        return { q: String((f as BlogFaq).q), a: String((f as BlogFaq).a) };
      }
      return null;
    })
    .filter((f): f is BlogFaq => f !== null);
}

export function readingTime(body: string): number {
  const words = body.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 200));
}

function toPost(slug: string, raw: string): BlogPost | null {
  const { data, body } = parseFrontmatter(raw);
  const title = typeof data.title === "string" ? data.title : "";
  if (!title) return null; // a post without a title is malformed — skip it
  const description =
    typeof data.description === "string" ? data.description : "";
  const date = typeof data.date === "string" ? data.date : "";
  return {
    slug,
    title,
    description,
    date,
    updated: typeof data.updated === "string" ? data.updated : undefined,
    releaseOn: typeof data.releaseOn === "string" ? data.releaseOn : undefined,
    tags: asStringArray(data.tags),
    keyword: typeof data.keyword === "string" ? data.keyword : undefined,
    category: typeof data.category === "string" ? data.category : undefined,
    hero: typeof data.hero === "string" ? data.hero : undefined,
    faq: asFaq(data.faq),
    related: asStringArray(data.related),
    body,
    readingTime: readingTime(body),
  };
}

// Staged release.
//
// `releaseOn` holds a post back until a given date. It exists for ONE job:
// draining a backlog gradually instead of publishing it in a single deploy.
// A young domain that doubles its page count overnight is a pattern search
// engines treat as a quality signal, and not a good one.
//
// Posts without `releaseOn` publish immediately — that is the normal path, and
// what every robot-authored post does. Once a backlog's dates have all passed
// the field is inert and can be stripped.
//
// Note for anyone adding `releaseOn` to newly committed posts: the IndexNow
// step in the publishing workflows submits every URL in the commit, so it would
// announce a URL that is not live yet. Gate the backlog, not new work.
export function isReleased(post: BlogPost, today: string): boolean {
  return !post.releaseOn || post.releaseOn <= today;
}

export function todayIso(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

// Module-level cache (posts are immutable within a process). Keyed by slug.
let cache: Map<string, BlogPost> | null = null;

function loadAll(): Map<string, BlogPost> {
  if (cache) return cache;
  const today = todayIso();
  const map = new Map<string, BlogPost>();
  let files: string[] = [];
  try {
    files = fs.readdirSync(BLOG_DIR);
  } catch {
    cache = map; // no content dir yet — empty blog, not an error
    return map;
  }
  for (const file of files) {
    if (!file.endsWith(".md")) continue;
    const slug = file.replace(/\.md$/, "");
    try {
      const raw = fs.readFileSync(path.join(BLOG_DIR, file), "utf8");
      const post = toPost(slug, raw);
      // Filter here, not in each caller: the sitemap, the index,
      // generateStaticParams and related-post resolution all read through
      // loadAll(), so one gate keeps them from ever disagreeing about what
      // exists — an unreleased post must not be linked to or listed either.
      if (post && isReleased(post, today)) map.set(slug, post);
    } catch {
      // skip unreadable file
    }
  }
  cache = map;
  return map;
}

// All published posts, newest first.
export function getAllBlogPosts(): BlogPost[] {
  return [...loadAll().values()].sort((a, b) =>
    (b.date || "").localeCompare(a.date || "")
  );
}

export function getBlogPostBySlug(slug: string): BlogPost | null {
  return loadAll().get(slug) ?? null;
}

export function getBlogSlugs(): string[] {
  return getAllBlogPosts().map((p) => p.slug);
}

// Resolve a post's `related` slugs to real posts; fall back to newest siblings
// (same category) so every post links out into the cluster even if unset.
export function getRelatedBlogPosts(post: BlogPost, limit = 4): BlogPost[] {
  const all = loadAll();
  const picked: BlogPost[] = [];
  const seen = new Set<string>([post.slug]);
  for (const slug of post.related) {
    const p = all.get(slug);
    if (p && !seen.has(slug)) {
      picked.push(p);
      seen.add(slug);
    }
    if (picked.length >= limit) return picked;
  }
  for (const p of getAllBlogPosts()) {
    if (picked.length >= limit) break;
    if (seen.has(p.slug)) continue;
    if (post.category && p.category !== post.category) continue;
    picked.push(p);
    seen.add(p.slug);
  }
  return picked;
}
