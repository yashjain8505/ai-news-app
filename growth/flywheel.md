# Wortins SEO/GEO flywheel

A self-running loop that grows organic + AI-search traffic without hand-work.
Everything below runs in GitHub Actions on the Claude subscription (no API key)
and writes to the live site + Supabase.

```
        ┌─────────────────────────────────────────────────────────┐
        │                                                         │
   (1) MEASURE                                                    │
   ai-visibility.yml (weekly)                                     │
   → for head GEO queries + every blog keyword, check if          │
     wortins.com is cited by AI search → log to `ai_visibility`   │
        │                                                         │
        ▼                                                         │
   (2) TARGET                                                     │
   gather prompts read the gaps:                                  │
   • ai_visibility rows where cited = false  (we're losing)       │
   • /api/seo/opportunities  (GSC: impressions but page 2-3)      │
   • the funding feed  (new rounds with no post)                  │
        │                                                         │
        ▼                                                         │
   (3) GENERATE                                                   │
   blog-funding.yml (Mon/Thu) → per-company funding deep-dives    │
   blog-keywords.yml (Tue/Fri) → best-of / vs / alternatives /    │
                                 pricing buy-intent articles      │
   → verify every source (verify-blog.mjs, drops dead citations)  │
        │                                                         │
        ▼                                                         │
   (4) PUBLISH                                                    │
   both robots → commit verified posts straight to main          │
   → Vercel deploys → ping IndexNow → sitemap + markdown twins    ┘
        │
        └──► re-measured next week → the gap list shrinks, repeat
```

## The pieces

| Job | Schedule | Does | Output |
|---|---|---|---|
| `ai-visibility.yml` | Wed | Checks if we're cited for target queries | rows in `ai_visibility` |
| `blog-funding.yml` | Mon, Thu | New AI funding rounds → deep-dives | commits to `main` + IndexNow |
| `blog-keywords.yml` | Tue, Fri | Buy-intent queries → useful articles | commits to `main` + IndexNow |
| `daily-edition.yml` | 3×/day | The daily news feed (pre-existing) | Supabase `items` |
| `/api/seo/opportunities` | on-demand | GSC "winnable" queries, for the gather step | JSON (service-key guarded) |
| `verify-blog.mjs` | — | HTTP-verifies each post's source; drops dead ones | — |

## What makes it a flywheel
The **measure** step feeds the **target** step: queries where `ai_visibility.cited = false`
become the top priority for the content robots, and once we publish + rank for them,
the next measurement flips them to `cited = true` and the robots move to the next gap.
GSC opportunities and the funding feed are the other two input streams.

## Operating it
- **Nothing to do day-to-day.** The crons run it. Funding posts land as a PR to glance at;
  keyword posts publish themselves (source-verified).
- **Manual run:** Actions tab → pick a workflow → "Run workflow" (or `gh workflow run <file>`).
- **Tune volume:** each content workflow has a `max_posts` input (default 4–5).

## One switch to unlock full power
- **GSC feed** — set `GSC_SERVICE_ACCOUNT_B64` in Vercel (already used by `/admin/seo`).
  Then `/api/seo/opportunities` returns real Search Console gaps and the keyword robot
  targets what you're *already* getting impressions for. Until then it seeds from the
  niche + the visibility gaps (still works).

Both content robots now commit straight to `main` after source-verification (no PR
gate needed), so nothing else is required to run hands-off. To add a human review
gate back, flip a robot's final step to `peter-evans/create-pull-request` and enable
Settings → Actions → "Allow GitHub Actions to create and approve pull requests".

## Guardrails
- Every generated post's source is HTTP-verified; a dead/fabricated citation is dropped
  before publish. Funding facts come from the already-vetted curator feed.
- Both robots publish directly to main after that verification (see the note above to
  add a human PR gate back if you want one).
- No paid link schemes — growth is content + AEO (markdown twins) only.
