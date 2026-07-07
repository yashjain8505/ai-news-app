# Wortins — Overnight blog build (feat/blog-infra)

**Started:** 2026-07-08 ~00:15 IST (2026-07-07 ~18:45 UTC)
**Worktree:** `/Users/earan/Claude code personal/wortins-blog-build` (branch `feat/blog-infra`, based on `main` @ 63c246e)
**Resume scheduled:** 2:30 AM IST (21:00 UTC) via scheduled task `wortins-blog-build-resume`

## ⚠️ SAFETY — READ FIRST
- Another Claude session is ACTIVE in `/Users/earan/Claude code personal/ai-news-app` (dev server on :3000, dirty tree). **DO NOT touch that dir, its files, or its git HEAD.** All work happens here in the worktree only.
- Both sessions share the user's 5-hour quota. Be efficient.
- No unattended production deploy. No production Supabase migration applied unattended. Leave everything as a PR + this note for morning review.

## The signal driving everything (from GSC)
Every query Wortins gets is a **per-company AI funding/valuation/revenue lookup**:
"oraclaim funding", "knowlify funding", "further ai funding/valuation/revenue", "ideogram funding",
"snorkel ai valuation", "profound ai funding", "ai startup funding investment rounds latest".
`/section/funding` already pulls the most impressions (32). US = impressions, India = the only clicks.
=> The winnable wedge is **per-company funding/valuation pages** + funding roundups/explainers.

## Design decision (LOCKED)
- **File-based markdown blog** (`content/blog/*.md` w/ frontmatter), rendered via the existing `src/lib/markdown.ts`.
  Rationale: reviewable in the PR, version-controlled, ZERO prod-DB risk overnight, ships all posts on deploy with no migration, and "add a file = new post" is real authoring infra.
- Full SEO parity with story pages: `BlogPosting` JSON-LD, canonical, OG (reuse `og.tsx`), `/blog/[slug].md` twin, sitemap integration.
- Routes: `/blog` (index) + `/blog/[slug]` + `/blog/[slug].md` twin.
- DB-backed `blog_posts` table + `/admin/blog` authoring UI = documented **Phase 2** (in optimization plan), NOT blocking tonight.

## Architecture notes (from reading the repo)
- Supabase `items` table drives sections; `editions` table has headline/synopsis. Anon client + RLS in `publicData.ts`.
- SEO config: `src/lib/seo.ts` (SITE, SECTION_SEO, SECTION_SLUG, absoluteUrl).
- Sitemap: `src/app/sitemap.ts` — add blog slugs + twins here.
- Sections: daily, tools, articles, funding. Funding section SEO label = "AI Funding Tracker".
- **Next.js 16 — breaking changes. Read `node_modules/next/dist/docs/` before writing route code.**

## Plan / status
- [x] Isolated worktree + branch created
- [x] 2:30 AM resume scheduled
- [x] Read repo patterns (seo, sitemap, types, publicData)
- [ ] Keyword research (ground on funding companies in Supabase `items`)  ← IN PROGRESS
- [ ] Content plan (20-30 titles → query → format → build order)
- [ ] Blog infra (routes + SEO + sitemap + markdown rendering)
- [ ] Write 20-30 posts (funding/valuation wedge first)
- [ ] Optimization plan doc
- [ ] Commit + push + PR + final PROGRESS update

## How to resume
1. Read this file. Check the task list (TaskList).
2. `cd` into the worktree. Continue the first unchecked item.
3. Commit after each post/step. Keep this file current.
