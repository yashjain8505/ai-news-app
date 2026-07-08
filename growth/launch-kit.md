# Wortins Launch Kit — ready-to-post copy

Paste-ready posts for the top channels from `distribution-channels.md`. Positioning throughout: **a personalized daily AI briefing that skips the big-lab hype** — emerging startups, real tools, applied AI, and funding, tuned to you. Voice: honest founder, signal over hype, no marketing fluff.

Swap `wortins.com` if you use a UTM'd link. Reply to every comment within ~2 hours on launch day.

---

## One-liners (reuse everywhere)

- **Tagline:** Your daily AI briefing, tuned to you — beyond the big-lab hype.
- **Sub:** Five minutes of AI news that actually matters to *you*, not another OpenAI press release.
- **Value prop (1 sentence):** Wortins curates the day's most interesting AI news across tools, funding, and applied AI, caps the big-lab noise, and tunes the feed to your taste.

---

## 1. Show HN (Hacker News) — the flagship launch

**Post between Tue–Thu, ~8–10am ET. Title format matters — no hype, no emoji.**

**Title:**
`Show HN: Wortins – a personalized AI news briefing beyond the big-lab hype`

**Text (first comment / the post body):**
```
Hi HN. My AI news was 90% OpenAI/Google headlines and 10% of what I actually
cared about — the small tools, applied stuff, funding, and the weird
second-order consequences. So I built Wortins.

It curates a daily AI briefing (refreshed 3x/day) across four sections —
Daily, New Tools, Funding, Interesting Articles — and deliberately caps
big-lab coverage in favor of emerging startups and builders. You answer a few
questions and the feed tunes to your topics and how technical you want it; it
then learns from what you open vs. scroll past (no dwell-time tracking — reading
speed is noise; the signal is what you click vs. skip).

Every story gets an original 2–3 paragraph summary so you can decide what's
worth your time without opening 12 tabs. Free, and you can read the whole thing
without an account; sign in only to personalize.

Stack: Next.js + Supabase + Vercel, curated by a scheduled LLM pipeline with
dedup + a taste model. Happy to go into the curation/dedup/ranking details.

https://wortins.com
```

**Reply-ready follow-ups:**
- *How is this different from TLDR AI / Ben's Bites?* → "Those are one-size-fits-all editorial. Wortins personalizes per reader and deliberately down-weights megacap news so smaller tools/startups actually surface."
- *How does curation work?* → "LLM pipeline pulls from a wide source set 3x/day, dedups by topic, tags each story to a taxonomy, and writes an original summary. One story per topic, never all-megacap."

---

## 2. r/SideProject — best warm-audience launch

**Size ~735k, built for this. Post with a short demo GIF of the personalize flow.**

**Title:**
`I built a personalized AI news briefing that skips the big-lab hype — feedback welcome`

**Body:**
```
I got tired of AI news being 90% OpenAI headlines, so I built Wortins: a daily
AI briefing that tunes to you.

The hook: answer 6 quick questions (your topics + how technical you want it) and
the feed rebuilds around your taste. It learns from what you actually open vs.
scroll past, and it caps big-lab coverage so smaller tools, applied AI, and
funding actually surface.

- 4 sections: Daily AI, New Tools, Funding, Interesting Articles
- 2–3 paragraph original summary on every story (decide before you click out)
- Free, no login to read; sign in only to personalize
- Next.js + Supabase + Vercel

Would love feedback on the onboarding + whether the feed feels "tuned" to you:
https://wortins.com
```
*Reply to every comment. If someone shares what they'd want, tune it live and reply "done."*

---

## 3. r/LLMDevs — value-first, not a pitch

**Contribute for ~2 weeks first if you haven't. Then post as a curated resource.**

**Title:**
`How I curate a personalized AI news feed (dedup + taste model) — and a free tool that does it`

**Body:**
```
Sharing the approach behind a daily AI briefing I built. The interesting bits:

- Source diversity: pull wide 3x/day, cap any single outlet + any single company
- Dedup: one story per topic; the next item must be a clearly different subject
- Taste model: per-user tag weights, learned from click-vs-skip (dwell time is
  noise — reading speed varies too much to mean anything)
- Original 2–3 paragraph summaries so the reader decides before clicking out

The tool is free and live at https://wortins.com if you want to see the output.
Happy to answer curation/ranking questions.
```

---

## 4. X / Twitter — launch thread

```
1/ Most "AI news" is just OpenAI's press releases with extra steps.

I built Wortins to fix that: a daily AI briefing tuned to you — that surfaces
the small tools, applied AI, and funding the big feeds bury.

Free: wortins.com

2/ Answer a few questions → the feed rebuilds around your topics and how
technical you want it. Then it learns from what you open vs. scroll past.

No dwell-time tracking. The signal is what you click, not how slow you read.

3/ 4 sections — Daily AI, New Tools, Funding, Articles — refreshed 3x a day,
with a 2–3 paragraph original summary on every story so you decide what's worth
your time without 12 open tabs.

4/ It deliberately caps big-lab coverage, so emerging startups and builders
actually show up instead of the same 5 megacaps.

Read the whole thing free, no account needed: wortins.com
```

---

## 5. Product Hunt (when you're ready for the bigger push)

- **Name:** Wortins
- **Tagline:** Your daily AI briefing, tuned to you — beyond the big labs
- **Description:**
```
Wortins is a personalized daily AI news briefing. It curates the most
interesting AI stories across tools, funding, and applied AI 3x a day, caps the
big-lab hype, and tunes the feed to your taste. Every story gets an original 2–3
paragraph summary so you get the signal in five minutes. Free.
```
- **First comment (maker):** the honest "why I built this" from the Show HN body.

---

## Launch-day checklist

1. **Pre-flight:** make sure a fresh edition dropped that morning, the personalize flow works end-to-end, and the newsletter welcome email fires.
2. **Order:** Show HN first (morning ET) → r/SideProject same day → X thread → r/LLMDevs a day or two later (value-first) → Product Hunt as a separate bigger push.
3. **Be present:** reply to every comment within ~2h for the first day. That's what keeps posts alive.
4. **Don't:** cross-post the identical text everywhere the same hour, use marketing language on Reddit/HN, or post to ⛔ self-promo-banned subs (see the channel guide).
5. **Capture:** every visitor can subscribe to the newsletter from the masthead — that's your retention loop, so a spike converts into a list.
```
