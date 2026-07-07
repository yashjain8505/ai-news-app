# Wortins Blog — Optimization & Operating Plan

This is the "what to do once it's live" playbook. The blog is built and seeded; this is how you
turn it into compounding organic traffic.

---

## 0. Ship checklist (morning-of)
1. Review the PR (`feat/blog-infra`), skim 3-4 posts for tone/accuracy, merge.
2. Deploy (Vercel auto-deploys `main`). No DB migration needed — the blog is file-based.
3. In GSC → **URL Inspection**, request indexing for `/blog` and your 5-6 best posts (Together AI,
   DeepSeek, Mistral, Baseten, the "biggest AI funding rounds 2026" hub). This jumps the queue vs. waiting for crawl.
4. Confirm the sitemap now lists `/blog/*` (it will auto-include them) — no action, just verify next crawl.

## 1. What to measure (and where)
In **GSC → Search results**, filter Page contains `/blog/` and watch, per post:
- **Impressions** — is Google showing it at all? (coverage/indexing signal)
- **Average position** — are we top-20? top-10? (winnability signal)
- **Clicks + CTR** — is the title/snippet compelling once we rank?
- **Query** tab filtered to each post — what are we *actually* getting shown for (often not the target term)?

Give it **2-4 weeks** before judging anything — new pages sit in Google's "evaluation" window first.

## 2. The weekly loop (15 min)
Every week, pull the `/blog/` rows and sort by impressions:
- **Rising (impressions climbing, position 5-20):** these are *almost* winning. Priority for step 3.
- **Flat at zero after 3-4 weeks:** indexing or relevance problem → step 4.
- **New queries you didn't target:** capture them — they're free keyword research (step 5).

## 3. Double down on winners
When a post gains traction:
- **Expand it** — add sections answering the real queries it's surfacing for (from the Query tab). Length + coverage help.
- **Refresh `updated:`** date when you edit — funding pages benefit from freshness signals.
- **Add/expand the FAQ** to capture "People Also Ask" variants → more featured-snippet + AI-answer surface area.
- **Internal-link into it** from the relevant roundup hub and 2-3 sibling posts (link equity flows to your winner).
- **Spawn siblings** — if "X funding" wins, the same template wins for the next 5 similar companies. Clone the pattern.

## 4. Fix or prune losers
If a post is dead after ~6 weeks:
- **Zero impressions** → indexing issue. Check GSC coverage; request indexing; make sure it's internally linked (orphan pages don't get crawled).
- **Impressions but position 30+** → the query is too competitive or the page is thin. Improve the title (front-load the exact query), tighten the intro answer, add depth, add internal links.
- **Genuinely no demand** → merge it into a roundup and 301 (or just leave it; it costs nothing).
- Never mass-delete — consolidate weak pages into stronger hubs.

## 5. The compounding engine (the real win)
Your unfair advantage: **the funding feed already surfaces new raises daily.** Operationalize it:
- **Rule:** whenever a notable, distinctively-named AI startup raise hits `/funding`, add a `content/blog/<company>-funding.md` within a day or two, following the proven template. Fresh company + near-zero competition = easy long-tail wins, exactly like the GSC queries you already get ("oraclaim funding", "further ai valuation").
- **Cadence:** aim for 3-5 new per-company posts/week. In 3 months that's ~50 pages, each catching a distinct query.
- This can later be **semi-automated** (a draft generated from the funding item + web-verify), but keep a human accuracy pass — Google punishes unedited AI filler.

## 6. Keep the hubs alive ("living trackers")
The roundup pages (`biggest-ai-funding-rounds-2026`, `ai-data-center-funding-2026`, etc.) are your
strongest SEO assets — they target higher-volume terms and collect internal links. Maintain them:
- Add each new raise to the relevant roundup + link to the new per-company post.
- Bump `updated:` monthly. "Updated [current month]" in the title/intro lifts CTR and freshness.
- These hubs rank for the broad terms; the per-company pages rank for the long tail. They feed each other.

## 7. Get them indexed & linked (off-page)
- **Internal links** are done (nav + roundups + related). Keep every new post linked from ≥2 places.
- **A few external links** dramatically speed indexing + ranking for a young domain. Cheap sources:
  drop the roundup in relevant subreddits/newsletters as a *resource* (not spam), and link to blog posts
  from your X/LinkedIn when you cover that company's raise. (Ties into your distribution loop.)

## 8. Metrics to expect (rough)
- **Weeks 1-3:** indexing; near-zero clicks. Normal. Watch impressions start on the distinctive-name posts first.
- **Weeks 4-8:** the winnable long-tail (per-company) pages should start ranking 5-15 and drawing first clicks.
- **Months 2-4:** roundup hubs mature and rank for broader terms; compounding kicks in as page count + links grow.
- Track a simple sheet: post | target query | date live | impressions | position | clicks, updated weekly.

## 9. Phase 2 (optional, later): DB-backed authoring
Current authoring = add a Markdown file (great for you + git review). If you later want to write posts
from an admin UI without touching the repo, add a Supabase `blog_posts` table + `/admin/blog` editor and
switch the loader to read DB-or-files. Not needed to rank — file-based is fully sufficient. Documented here
so the option is on record.

---

**TL;DR:** The template works and the wedge is proven. The whole game now is: (1) get them indexed fast,
(2) add a new per-company page for every notable raise, (3) keep the roundup hubs fresh and cross-linked,
(4) double down weekly on whatever GSC shows is rising. Slow for 3-4 weeks, then compounding.
