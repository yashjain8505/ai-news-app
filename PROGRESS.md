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
- [x] Keyword research (grounded on funding companies in Supabase `items`)
- [x] Content plan → `growth/blog-plan.md` (30 posts: 22 per-company + 5 roundups + 3 explainers)
- [x] Blog infra built + typechecks clean + COMMITTED (commit 93434e4)
- [~] Write posts (funding/valuation wedge first)  ← IN PROGRESS
- [ ] Optimization plan doc
- [ ] Commit + push + PR + final PROGRESS update

## Infra shipped (commit 93434e4)
- `src/lib/blog.ts` (frontmatter loader), `src/components/BlogContent.tsx` (dep-free md renderer)
- `src/app/blog/page.tsx` + `src/app/blog/[slug]/page.tsx` (ISR, BlogPosting+FAQPage+Breadcrumb JSON-LD)
- sitemap + `.md` twins (markdown.ts) + Vary:Accept (next.config) + "Blog" nav link (PublicChrome)
- Reference post: `content/blog/together-ai-funding.md` (the quality template — copy its format)
- Local setup: node_modules + .env.local symlinked from ../ai-news-app (gitignored, do NOT commit)

## Post-writing status (target 20-30)
COMMITTED (9, commit + pilot): together-ai, crusoe, baseten, twelvelabs, venice-ai, etched, carbonsix,
  how-ai-startup-funding-rounds-work, how-ai-startup-valuations-work.
BATCH 2 written (7 done, in content/blog/ but NOT yet committed): mistral, deepseek, kling-ai, generalist-ai,
  flourish, assort-health, even-realities.
BATCH 2 still running (4 subagents): oxmiq, tripo-ai, trase, luxonis.
  → When done: run validator, commit batch 2.

## STILL TO DO (resume here)
1. ROUNDUP HUBS (MANDATORY — per-company posts link to these in-body, so they 404 without them):
   biggest-ai-funding-rounds-2026, ai-data-center-funding-2026, ai-chip-startup-funding-2026,
   physical-ai-robotics-funding-2026, ai-video-startup-funding-2026.
   Best done via sonnet subagents given verified $ data already gathered (see git log/agent reports),
   each linking to the relevant per-company /blog/<slug> pages. Optional extra: ai-unicorns-2026.
2. Validate (node scratchpad/validate-posts.cjs) + `npx tsc --noEmit`.
3. Commit all. Count `ls content/blog/*.md | wc -l` (target 20-30).
4. VERIFY UI (user is visual-sensitive): run dev server on a NON-3000 port (other session owns 3000),
   e.g. `PORT=3100 npm run dev` in the worktree, screenshot /blog + one post desktop+mobile.
5. Push branch `feat/blog-infra`, open PR (gh). Optimization plan already at growth/blog-optimization-plan.md.
6. Final PROGRESS update + leave morning summary.

## Validation before commit (run this)
`node "/private/tmp/claude-501/-Users-earan-Claude-code-personal/d7fba434-35c8-40f3-b13e-20a7908bc902/scratchpad/validate-posts.cjs" .`
(checks every .md has valid one-line JSON faq + title; malformed → loader silently skips it). Then `npx tsc --noEmit`.

## How to resume
1. Read this file. Check the task list (TaskList).
2. `cd` into the worktree. Continue the first unchecked item.
3. Commit after each post/step. Keep this file current.
