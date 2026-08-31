# Wortins — Persona QA + Honest Feedback (re-run)

**Run:** 2026-06-30 (autonomous, post-changes re-run)
**Target:** local dev `localhost:3000` (Next 16.2.9), fresh server, against prod Supabase.
**Brief:** Re-run the whole thing after app changes. **Be brutally honest, especially about onboarding.** No cheerleading.
**Method:** drive the real UI as skeptical first-time personas; DOM extraction + console/network/server-log capture.

> Legend: ✅ good · ⚠️ works-but-rough · ❌ broken/bad · 💡 idea · 🗣️ subjective UX opinion

---

## TL;DR — honest verdict

**Bottom line:** The product is in genuinely good shape and the hard part — the personalization engine — **works and differentiates correctly**. The damage is concentrated in two places: a **critical empty-feed bug for new users**, and an **onboarding calibration that can't capture a tools/applied taste**. Everything else is polish.

### 🔴 Critical — fix first
1. **New user → empty feed.** When today's edition isn't curated yet (e.g. just after midnight, like now on July 1), a freshly-onboarded user lands on "No stories filed." The personalized feed hard-defaults to *today*; the public home already falls back to the latest non-empty edition — make the feed do the same. This is the worst moment in the product (blank reward after a 4-screen signup).

### 🟠 High
2. **Calibration pool bias.** The 12-article sample isn't balanced across the 10 taste categories, so whether you can express a taste is luck-of-the-draw: Drama persona → Big-lab 43% (great); Builder → New tools **9%**, Technical **0%**; Policy Wonk → Policy **0%**, flat mix. **Stratify the 12-article sample to cover all categories** (the ~41 pool is balanced; the *sample* isn't). Critical because "New Tools" is a flagship section.
3. **Tools titles show raw GitHub slugs** (`NotASithLord/peerd`, `usestrix/strix`) instead of the tool name. Strip the `owner/`.
4. **Imageless lead → empty dark box.** `.news-photo` renders a filled dark frame even with no image. Only render it when an image src exists.

### 🟡 Medium / polish
5. **Public/default daily order is corporate-first** (Nvidia/DeepSeek/EU before the applied/indie stories you want on top). Personalized users get it re-sorted, but **logged-out visitors + crawlers see the off-taste order** — an SEO-facing issue. Likely caused by non-contiguous daily `rank` values.
6. **Email required before any value** in onboarding (friction); consider optional or post-mix.
7. **Onboarding Step 1**: form crammed upper-left in a big empty canvas; START button looks disabled (washed-out vs the strong oxblood NEXT).
8. **12 calibration screens is long** for a "two-minute" promise; slider defaults to neutral so tap-through emits no signal.
9. **Recency**: stale stories (up to ~12 days old) can lead the daily feed; add recency decay to scoring.
10. Smaller: tab order differs public vs personalized; onboarding mix shows 0% but `/tune` enforces a 2% floor; mobile header/tab wrapping.

### ✅ Working well — don't touch
- **Personalization differentiates correctly** (Drama 43% big-lab/29% drama vs Builder 35% culture/9% tools → visibly different feeds).
- **All controls verified**: Refresh (instant, with toast), Explore more, day arrows, dark mode, `/tune`, and the **read→return→"How was this read?"→record** loop end-to-end.
- **Floors + source caps met**; entity diversity good; **all sampled links resolve** (no 404s/soft-404s).
- **New dynamic OG images render**; public/SEO routes healthy; **dark mode is polished**; Funding section is strong.

> ⚠️ Tested against a **live-editing target** — during the run you fixed the brand ("Wotins"→"Wortins"), shipped the OG images, and briefly broke the build (missing `@/lib/og`, self-resolved). A few observations were mid-edit states, noted inline.

---

## Onboarding walkthrough (primary focus)

Full flow: **Name/Email gate → 12-article slider calibration → "Your mix" editor → Continue → feed.**

### Step 1 — Name/Email gate
- ✅ Tasteful editorial design (oxblood "W" mark, serif headline "Let's tune your briefing.", paper grain). On-brand.
- ⚠️ **Layout is crammed into the upper-left** with a huge empty canvas to the right/below. On a 1280px desktop it reads as unfinished / not centered. Needs a max-width centered column or vertical centering.
- ⚠️ **START button looks disabled even when it's the primary CTA** — washed-out dusty pink, weak contrast. (Compare to the strong oxblood NEXT/CONTINUE later — START should match those.)
- ⚠️ **Email is required before any value is shown.** Asking for an email at step 0 is a known conversion killer. Consider making email optional, or collecting it *after* the "Your mix" reveal (deliver value first).
- 🗣️ "Two minutes" promise vs a **12-screen** calibration is optimistic.

### Step 2 — Calibration (12 articles, 0-6 slider)
- ✅ **Strong screen.** Clear "ARTICLE n OF 12" progress bar, attractive newsprint cards, intuitive slider (SKIP ↔ DEFINITELY), solid oxblood NEXT.
- ⚠️ **12 is long** — most calibrations stop at 5-8. Real drop-off risk before the payoff. Consider 7-8, or "you can stop anytime after 5."
- ⚠️ **Slider defaults to neutral (3).** A user who just taps NEXT 12× emits zero signal and still gets a "personalized" mix. No nudge to actually move it, no "you haven't rated any yet" guard.
- ❌ **Calibration pool looks skewed toward finance/corporate.** The sample this run surfaced was heavy on money/markets/geopolitics: #1 Goldman Sachs FOMO (Fortune), #10 "Cognition raises $1B at $25B valuation" (TechCrunch), #11 "DeepSeek V4… US-China rivalry." If the 12 shown aren't balanced across all 10 taste categories, a user simply **cannot express** a tools/technical/applied taste — there's nothing in those categories to rate up. (Memory says the ~41-article pool is balanced; the **12-article sample** may not be.)

### Step 3 — "Your mix" editor
- ✅ **Good payoff + transparency.** "Here's what we picked up. Drag any bar to tune the intensity, it always totals 100%." Human-readable category names (Big-lab power plays, Drama & personalities, Money deals & funding, Jobs & future of work…) — genuinely no-jargon, matches the promise. Editable bars auto-normalize to 100%. Nice.
- ⚠️ Same left-aligned/empty-canvas layout issue as Step 1.
- ❌ **The mix didn't reflect the persona's intent.** With a tools/applied/technical-up, finance/policy-down rating pattern, the result was **Culture & society 35%, Drama 18%, Global 18%, Jobs 18%, New tools 9%, Technical & research 0%**. The *down* votes landed correctly (Money/Policy/Strategy/Big-lab all 0-3%), but the *up* votes didn't: **New tools 9% and Technical 0% is backwards for a "builder,"** and Culture 35% dominates without my having deliberately favored it. Two likely causes worth checking: (a) **pool skew** (above) starves the tools/technical categories of any article to rate up; (b) **opaque article→category mapping** — applied/science/quirky stories (NASA medic, Vesuvius scroll, glaciers, ConlangCrafter) appear to tag as "Culture & society" rather than "Technical & research" or "New tools," so a maker's enthusiasm pools into Culture.
  - *Caveat:* my 12 ratings were applied by a keyword heuristic, so the exact percentages are approximate — but the structural result (a builder landing at 9% tools / 0% technical) is the real signal. **For an app whose flagship section is literally "New Tools," the calibration under-weighting tools is a notable mismatch.**
- 💡 Consider showing, on this screen, *which articles drove each category* (a one-line "because you liked X"), so the mix feels earned rather than mysterious.

---

## Public / SEO layer ✅ (+ new OG images)
- ✅ All public routes 200 (home, `/section/*`, `/edition/[date]`, robots, sitemap, llms.txt); `/tune` correctly 307s logged-out. Live prod home/robots/sitemap also 200.
- ✅ **Your new dynamic OG images work**: `/opengraph-image` → 200 `image/png` (~54KB), `/section/daily/opengraph-image` → 200 (~58KB). One TODO done.
- ✅ Brand now consistent **"Wortins"** everywhere (the earlier "Wotins" home title was fixed mid-session).
- ⚠️ Public home **default order** is corporate/geopolitics-first (the inverted-rank issue from Phase A); personalized users get it re-sorted, but **crawlers + first-time logged-out visitors see the off-taste order**. This is the main SEO-facing content issue.

## Dark mode ✅
Warm "night newsprint" — terracotta accent on near-black, cream text. No contrast problems across feed, tools list, funding. Toggle persists. Looks genuinely good.

## Mobile (375×812)
- ✅ Reflows to a single column; type is readable; tabs/controls all present and tappable.
- ❌ **Imageless lead → empty dark box.** The `.news-photo` frame renders with a filled dark background (`rgb(30,26,20)`) even when the story has no image, producing a large empty rectangle above the lead headline (seen on Persona 3's GitHub-Copilot lead). **Fix: only render `.news-photo` when an image src exists; otherwise use the text-forward lead.** (Many daily items have no image, so this hits whenever such a story lands in the lead slot — desktop too, just less obvious.)
- ⚠️ Header greeting "Welcome back, QA Policy Wonk" wraps to ~4 lines on mobile; the "Welcome back" + "Updated" + Refresh/Tune/Light row is cramped. Minor polish.
- ⚠️ Tab labels wrap mid-word ("DAILY AI" / "NEW TOOLS" stack). Minor.

---

## Feed + controls

### ❌❌ CRITICAL — new user lands on an EMPTY feed
The clock rolled to **July 1**; the July 1 edition isn't curated yet. A freshly-onboarded user (`QA Indie Builder`) landed on:
> "No stories filed for July 1 yet. We only began keeping the archive recently." + a "Back to Today" button (which does nothing useful — today *is* empty).

This is the **single worst moment in the product**: the reward for finishing a 4-screen onboarding is a blank page. Root cause: the **personalized feed hard-defaults to "today,"** while the **public logged-out home falls back to the latest non-empty edition** (it cheerfully showed June 30 all run). The two surfaces are inconsistent.
- **Fix:** when today's edition is empty, the personalized feed should fall back to the most recent non-empty edition (like the public home does) with a small "July 1 edition arrives ~7am" note — never show a brand-new user an empty page. The masthead also says "Updated 1h ago" while the body says "no stories," which is contradictory.
- ✅ Mitigation that exists: the ‹ day-arrow recovers June 30 correctly, and "Back to Today" works — so the bug is purely the *default landing day* choice.

### ✅ Personalization works (and visibly so)
On June 30 the personalized feed for this Culture/applied-leaning persona reordered the daily section to lead with **Pixi AR app → ConlangCrafter → Vesuvius scroll decipher** — i.e., the applied/maker/quirky stories that sit at **ranks 40-43 in the default/public order are surfaced to the top**, while corporate/funding (Moonshot $30B, EU Parliament, Nvidia) dropped down. Same edition, taste-sorted. This is the feature working as intended. 👏
- ✅ Daily "magazine front page" layout (big lead + image, right-rail "more today") looks genuinely good.
- 🔗 Internal chain is consistent: **ratings → mix → feed** all agree (Culture-heavy mix → culture/applied stories on top). The weak link is upstream (ratings→mix tag mapping), not the feed.

### ⚠️ Recency vs. taste tradeoff
The taste-sorted lead story is labeled **"12D AGO — 3 MIN READ"** (Pixi, published Jun 18). Personalization is surfacing the best *taste* match even when it's stale. For a "daily briefing," a 12-day-old lead is odd. Consider a recency decay in scoring so a great-but-old story can't lead today's edition.

### Controls present (verified rendering)
Masthead shows: ↻ REFRESH, TUNE, ☾ Dark, day arrows ‹ ›, four tabs (DAILY AI · NEW TOOLS · ARTICLES · FUNDING — note this order differs from the public home's DAILY · FUNDING · TOOLS · ARTICLES), "Back to Today", edition stamp (EDITION№ 414 · JUL 1). Functional tests below.

**Control results (Persona 1):**
- ✅ **Refresh** — instant, stays on the current day, no spinner/error, confirms with a toast ("You're up to date" / "N new stories"). Good, "never feels dead."
- ✅ **Tabs** switch cleanly (Daily/Tools/Articles/Funding); **"Explore more ↓"** present to page through the rest.
- ✅ **Tools title bug confirmed live in UI** — list shows `inkeep/open-knowledge`, `perplexityai/bumblebee`, `browser-use/video-use`, `usestrix/strix`, `NotASithLord/peerd` (raw GitHub `owner/repo`). Descriptions are excellent; only the titles are wrong.
- ✅ **Read-feedback prompt verified end-to-end** — opening a story sets a pending `{id,tags,ts,rank}` (in-memory + sessionStorage); on return it records a dwell signal and shows **"HOW WAS THIS READ? Bad / Neutral / Good"** on that card. Correctly ignores <1500ms bounces. *Note:* it gates on `document.visibilityState === "visible"` (right for real new-tab returns); it only failed under automation because the headless preview tab reports "hidden" — not a product bug.
- ⚠️ **Tab-order inconsistency**: public home = Daily · Funding · Tools · Articles; personalized feed = Daily · Tools · Articles · Funding. Pick one.

---

## Persona differentiation

| | **Persona 1 — Indie Builder** | **Persona 2 — Drama Junkie** |
|---|---|---|
| Rated up | tools / applied / technical | lab rivalry / power / personalities |
| Top mix categories | Culture 35%, Drama 18%, Global 18% | **Big-lab power 43%, Drama 29%**, Money 14% |
| New tools % | 9% | 0% |
| Daily lead (June 30) | Pixi AR → ConlangCrafter → Vesuvius | Zhipu GLM → "Americans choose Chinese AI" → Pentagon China list |

- ✅ **The personalization engine differentiates clearly and correctly** — two opposite rating patterns produce two opposite mixes and two different daily orderings; the applied/maker lead stories correctly vanish from the Drama persona's top.
- ⚠️ **Calibration pool is biased toward funding/corporate/rivalry.** Across both runs the 12 sampled articles were dominated by money/markets/geopolitics (Goldman FOMO, Cognition $1B, Sierra $950M, DeepMind talent, Meta poaching, chip-export, DeepSeek). A drama/funding taste is easy to express; a **tools/applied taste has almost nothing to rate up** → why the builder landed at 9% tools / 0% technical. **Fix: balance the 12-article calibration sample across all 10 categories** (it samples from a ~41 pool; enforce category coverage in the sample, not just the pool).
- ⚠️ **Daily-inventory mismatch for the drama taste.** A "big-lab power/drama" lover surfaces *China/geopolitics* in Daily rather than juicy *OpenAI-vs-Anthropic personality* stories — because your daily taste-cap pushes big-lab drama into **Articles/Funding**. Their best content is in another tab than the one the feed opens on. Consider, for a very lab-power-leaning user, opening on or promoting the Articles section, or letting a little more lab-drama into Daily for them.

**Persona 3 (Policy Wonk) & Persona 4 (Skimmer) — degradation cases:**
- **Skimmer** (tapped through all 12 without moving the slider) → mix is a **perfectly uniform 10% × 10 categories.** Graceful (no crash) but anticlimactic: a 12-screen "we'll learn your taste" flow that ends in identical bars reads as "we learned nothing." Argues for forcing a real choice per card (no neutral default), or shortening + seeding a smarter prior.
- **Sensitivity flag:** Policy Wonk gave mostly-neutral ratings + ~2 positives and got **5 categories at 20% and 5 at exactly 0%** — i.e., a couple of votes *zeroed out half the taxonomy*. The mapping seems over-sensitive at low signal; a couple of clicks shouldn't eliminate 5 categories. Worth checking the normalization (floor/zeroing) at low interaction counts.

## Content & taste (today's edition)

See **Phase A** above (floors ✅, caps ✅; daily ordering inverted on the public view, tools title bug, recency). The personalized feed *fixes* the ordering per-user, so the inverted-default-order issue mainly hurts the **logged-out/SEO** view.

---

## Bugs / cleanup

_(pending)_
