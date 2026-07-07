# Wortins Blog — Overnight build: ✅ DONE (morning handoff)

**Status:** COMPLETE. Everything is committed, pushed, and in **PR #6**.
There is nothing to resume — the 2:30 AM scheduled task has been disabled.
👉 https://github.com/yashjain8505/ai-news-app/pull/6  (branch `feat/blog-infra`)

## What shipped
A file-based blog at `/blog` targeting the winnable long-tail queries GSC shows Wortins already gets
impressions for (per-company AI funding/valuation lookups).

**Infrastructure (no new deps, no DB, no env, no migration):**
- `src/lib/blog.ts` (frontmatter loader) + `src/components/BlogContent.tsx` (dependency-free Markdown
  renderer, incl. tables) — content lives in `content/blog/*.md`.
- `/blog` index + `/blog/[slug]` (ISR), BlogPosting + FAQPage + BreadcrumbList JSON-LD, canonical, OG.
- Sitemap + `.md` twins + `Vary: Accept` wiring; "Blog" added to the nav.

**Content — 25 posts (all web-verified; "in-talks" rounds flagged):**
- 18 per-company funding deep-dives (Together AI, DeepSeek, Mistral, Baseten, Crusoe, Kling AI, Etched,
  TwelveLabs, Venice AI, CarbonSix, Generalist AI, Flourish, Assort Health, Even Realities, Tripo AI,
  Oxmiq, Luxonis, Trase).
- 5 roundup "living-tracker" hubs (biggest rounds, data-center, chips, video, physical AI) that
  cross-link every per-company post.
- 2 evergreen explainers (how funding rounds work, how valuations work).

**Docs:** `growth/blog-plan.md` (strategy) · `growth/blog-optimization-plan.md` (post-launch playbook).

## Verified
- `npx tsc --noEmit` clean.
- Dev server render check (desktop + mobile): pages render on-brand, tables render correctly, no
  horizontal overflow on mobile, JSON-LD + canonical + `.md` twins all present. (Screenshots shared in chat.)
- All 25 posts parse (validator: 25 OK / 0 bad).

## To ship (your call, in the morning)
1. Review PR #6, skim a few posts, merge → Vercel deploys `main`. No DB step.
2. In GSC, request indexing for `/blog` + the top posts (see `growth/blog-optimization-plan.md`).

## Cleanup notes
- `node_modules` and `.env.local` in this worktree are gitignored (a real `npm ci` was run here for the
  render check). The worktree itself lives at `../wortins-blog-build`; remove with
  `git worktree remove wortins-blog-build` from `ai-news-app` once the PR is merged.
- `.claude/launch.json` gained a `wortins-blog` entry (port 3200) for local preview.
