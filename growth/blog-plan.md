# Wortins Blog — Keyword Research & Content Plan

## The thesis (grounded in GSC data)
Every query Wortins currently earns impressions for is a **per-company AI funding/valuation/revenue lookup**:
`oraclaim funding`, `knowlify funding`, `further ai funding`, `further ai valuation`, `further ai revenue`,
`ideogram funding`, `snorkel ai valuation`, `profound ai funding`, `ai startup funding investment rounds latest`.

These are **winnable long-tail**: distinctive company names with near-zero domain competition (no TechCrunch/Bloomberg
moat on "oraclaim funding"). Searcher intent is crisp: *how much did X raise, at what valuation, from whom, to do what.*
Wortins already aggregates exactly this data in the `items` (section=funding) table.

**Strategy:** build a cluster of **per-company funding/valuation pages** (the wedge) + a few **roundup/tracker hubs**
(internal-link authority) + a couple of **evergreen explainers** (informational long-tail). The roundups link down to the
per-company pages, forming a tight topical cluster (crawl graph + topical authority).

## Query patterns each per-company page targets
For company `X`: `X funding`, `X valuation`, `X series a/b/c`, `X investors`, `X funding round`, `X revenue`,
`how much did X raise`, `who invested in X`, `what does X do`. One page answers all of these.

## Tier 1 — Per-company funding pages (the wedge) — ~22
Grounded in the funding DB. Mega-caps (Microsoft/Qualcomm/Salesforce/SpaceX) excluded — big media owns those.
Each post MUST be fact-checked via web search (exact amount, round, lead investors, valuation, founders, what they do).

1. Together AI — $800M Series C, $8.3B valuation (AI inference cloud)
2. Crusoe — raising ~$3B at ~$30B valuation (AI data centers / energy)
3. Baseten — $1.5B Series F (AI inference)
4. TwelveLabs — $100M Series B (video understanding / "video superintelligence")
5. Venice AI — $65M Series A, unicorn (private, uncensored AI)
6. Etched — ~$5B valuation, $1B chip orders (transformer ASICs, Nvidia challenger)
7. CarbonSix — $40M Series A (physical AI hands for factories, South Korea)
8. Omen AI — $31M Series A (AI data center cooling / fluid intelligence)
9. LinqAlpha — $22M Series A (AI agents for institutional investors)
10. Quantum Systems — $1.2B Series D, $8B valuation (autonomous AI drones, Germany)
11. Higgsfield — eyeing $5B valuation, revenue quadrupled (AI video)
12. AlphaSense — $350M, $7.5B valuation (market intelligence AI)
13. Generalist AI — $400M (robot foundation models)
14. Flourish — $500M (brain-inspired AI, Bezos-backed)
15. Kling AI — $2.8B raise (Kuaishou; Alibaba/Tencent/Baidu)
16. Mistral — raising $3.5B at $23B valuation (open-weight frontier lab)
17. DeepSeek — $7.4B at $50B+ valuation (first funding round)
18. Oxmiq Labs — $35M (Raja Koduri; licenses AI chip IP)
19. Tripo AI — $150M Series A3 (3D generation)
20. Assort Health — $120M Series C, $1.2B valuation (AI patient scheduling agents)
21. Trase — $107M seed (healthcare & defense AI agents)
22. Even Realities — $150M round, $1B valuation (AI smart glasses)

## Tier 2 — Roundup / tracker hubs (internal-link authority) — ~5
23. Biggest AI funding rounds of 2026 (running tracker) — links to every Tier 1 page
24. AI data center funding 2026: who's raising to power the compute boom (Crusoe, Omen, Baseten, Stathera…)
25. AI chip startup funding: the Nvidia challengers (Etched, Oxmiq, …)
26. Physical AI & robotics funding tracker 2026 (CarbonSix, Generalist AI, Quantum Systems, Luxonis…)
27. AI video & media startup funding roundup 2026 (TwelveLabs, Higgsfield, Kling, Tripo…)

## Tier 3 — Evergreen explainers (informational long-tail) — ~3
28. How AI startup funding rounds work: seed to Series F, explained
29. How AI startup valuations are calculated (and why AI multiples are so high)
30. AI unicorns 2026: the newest $1B+ AI startups

## Page template (every post)
- Title: natural + keyword ("<Company> Funding: How Much It Raised, Valuation & Investors")
- H1, then a 2-3 sentence direct answer (the funding fact) — win the featured snippet.
- Sections: What is <Company> / The raise (amount, round, date) / Valuation / Investors / What they'll do with it / Why it matters.
- A short FAQ (BlogPosting + FAQPage JSON-LD) answering the exact query variants.
- Internal links: to the relevant roundup hub + /funding section + 2-3 sibling company pages.
- Link out to the primary source (citation depth), never republish source text.
- 700-1100 words, genuinely useful, original analysis (the "Wortins read" voice).

## SEO wiring
- `/blog` index + `/blog/[slug]` (ISR, mirrors story page), BlogPosting + FAQPage + Breadcrumb JSON-LD, canonical, OG.
- `/blog/[slug].md` twins (extend renderMarkdown) + sitemap inclusion + Vary:Accept in next.config.
- All indexable (original content), unlike thin story pages.

## Facts discipline
Cheaper-model subagents draft, but MUST web-verify every number. Wortins DB gives the seed fact; web search confirms
amount/round/investors/valuation/founders. No invented figures. Opus reviews for accuracy + voice before commit.
