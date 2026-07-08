---
title: AI Chip Startup Funding 2026: The Nvidia Challengers Raising Big
description: A roundup of AI chip startups raising major rounds in 2026 — Etched, Oxmiq Labs, Groq and Cerebras — and how each is attacking Nvidia's margins with specialized silicon or IP licensing.
date: 2026-07-08
updated: 2026-07-08
category: funding
keyword: ai chip startup funding
tags: ["AI chips", "Nvidia challengers", "Semiconductor funding", "AI infrastructure"]
related: ["etched-funding", "oxmiq-funding", "biggest-ai-funding-rounds-2026"]
faq: [{"q":"Which AI chip startups raised the most funding in 2026?","a":"Cerebras closed a $1 billion Series H at a roughly $23 billion valuation in February 2026, and Groq raised $650 million in June 2026 on top of a $750 million round in late 2025. Etched raised $500 million at a $5 billion valuation, and Oxmiq Labs raised a $35 million Series A."},{"q":"How are AI chip startups challenging Nvidia?","a":"Most take one of two paths: building specialized ASICs that do one thing (like transformer inference) far more efficiently than Nvidia's general-purpose GPUs, or licensing chip IP and architecture so other companies can build custom silicon without Nvidia's margins baked in."},{"q":"What does Oxmiq Labs actually make?","a":"Oxmiq Labs doesn't manufacture chips. Founded by ex-Intel, AMD and Apple GPU chief Raja Koduri, it licenses AI chip IP and architecture to other companies, positioning itself as a picks-and-shovels layer beneath the chip market rather than a chipmaker itself."},{"q":"Is Nvidia losing market share to these startups?","a":"Not yet in any material way — Nvidia still dominates AI training and inference hardware. But the volume and size of funding into alternatives in 2026 shows investors betting that specialized and licensed silicon will erode Nvidia's margins over time, especially in inference."}]
---

**AI chip startups pulled in well over $2 billion in disclosed funding in the first half of 2026 alone, as investors bet that Nvidia's dominance — and its margins — won't go unchallenged forever.** The approaches vary wildly: some are building purpose-built ASICs that do one job better than a general-purpose GPU, others are licensing chip IP so anyone can build custom silicon without paying the Nvidia tax. Here's who's raising, how much, and what it says about where the money thinks the chip market is headed.

## The 2026 AI chip funding roundup

| Company | Amount | Valuation | Approach |
|---|---|---|---|
| Etched | $500M | $5B | Transformer-only ASIC ("Sohu") |
| Cerebras | $1B (Series H) | ~$23B | Wafer-scale AI chips |
| Groq | $650M (June 2026) | ~$6.9B (Sept 2025 round) | LPU inference chips |
| Oxmiq Labs | $35M (Series A) | Not disclosed | AI chip IP licensing |

## Etched — betting the whole company on transformers

**Etched raised $500 million at a $5 billion valuation**, building a chip so specialized it can only run one kind of model architecture: transformers. Its "Sohu" chip strips out everything a general-purpose GPU needs for flexibility, in exchange for speed on the exact workload most of the industry runs today — large language models. That's a real bet, not a hedge: if transformers get replaced by a different architecture, the chip is dead weight. But with **roughly $1 billion in chip orders** already lined up, customers are voting that the bet pays off before that happens. Full breakdown of the round and Etched's roadmap is at [/blog/etched-funding](/blog/etched-funding).

## Oxmiq Labs — skipping the fab entirely

**Oxmiq Labs raised a $35 million Series A**, co-led by Fundomo and Samsung Catalyst Fund, bringing its total funding to around $60 million. The company was founded by **Raja Koduri**, the GPU architect who's held chief roles at Intel, AMD and Apple. What makes Oxmiq different from the rest of this list is that it doesn't make chips at all — it **licenses AI chip IP and architecture** to companies that want to build custom silicon without starting from zero or handing Nvidia their margin. It's a bet on a less obvious but arguably lower-risk thesis: even if you don't know which startup's ASIC wins, someone will need the underlying IP to build it. More on the round at [/blog/oxmiq-funding](/blog/oxmiq-funding).

## Groq — inference speed as the whole pitch

Groq isn't new to this list, but 2026 has been a big year for it. After a **$750 million round at a $6.9 billion valuation** in September 2025, the company came back for another **$650 million in growth capital in June 2026**, led by Disruptive and Infinitum. Groq's LPU (Language Processing Unit) architecture is built specifically for fast, cheap inference rather than training — a bet that as AI shifts from "training frontier models" to "serving billions of queries a day," inference economics start to matter more than raw training throughput. Notably, Groq also signed a non-exclusive licensing deal with Nvidia worth roughly $20 billion late in 2025 — a sign that even the incumbent is hedging by getting close to the challengers rather than only competing with them.

## Cerebras — going big instead of going narrow

Where Etched and Groq narrow their focus, Cerebras goes the other direction: wafer-scale chips that are physically enormous, trading manufacturing complexity for raw compute density. The company closed a **$1 billion Series H at roughly a $23 billion valuation** in February 2026, led by Tiger Global with AMD among the participants — notable, since AMD is itself trying to chip away at Nvidia's GPU dominance. Cerebras has also re-launched its IPO process, reportedly targeting a raise in the $4.8-5 billion range at a valuation north of $50 billion, which would make it the biggest public test yet of whether investors believe an Nvidia alternative can trade at scale.

## Why startups are attacking the AI chip market

Nvidia's gross margins on AI chips have been the industry's biggest open secret and its biggest target. Every company on this list is chasing some version of the same idea: **Nvidia's margin is someone else's opportunity**, whether that's a narrower, faster chip for one workload (Etched, Groq), a bigger chip that avoids networking overhead entirely (Cerebras), or IP that lets other companies skip Nvidia altogether (Oxmiq).

None of these companies threaten Nvidia's position in 2026 — it still controls the overwhelming majority of AI training and inference hardware, and switching costs (CUDA, existing infrastructure, developer familiarity) are real. But the amount of capital flowing into alternatives — over $2 billion into just four companies this year — tells you where sophisticated investors think the multi-year risk sits. Inference, in particular, looks like the most contested front: it's higher volume, more cost-sensitive, and less locked into Nvidia's software moat than training ever was.

For a broader look at how this year's chip rounds stack up against the rest of the market, see [Wortins' roundup of the biggest AI funding rounds of 2026](/blog/biggest-ai-funding-rounds-2026).

## FAQ

**Which AI chip startups raised the most funding in 2026?**
Cerebras closed a $1 billion Series H at a roughly $23 billion valuation in February 2026, and Groq raised $650 million in June 2026 on top of a $750 million round in late 2025. Etched raised $500 million at a $5 billion valuation, and Oxmiq Labs raised a $35 million Series A.

**How are AI chip startups challenging Nvidia?**
Most take one of two paths: building specialized ASICs that do one thing (like transformer inference) far more efficiently than Nvidia's general-purpose GPUs, or licensing chip IP and architecture so other companies can build custom silicon without Nvidia's margins baked in.

**What does Oxmiq Labs actually make?**
Oxmiq Labs doesn't manufacture chips. Founded by ex-Intel, AMD and Apple GPU chief Raja Koduri, it licenses AI chip IP and architecture to other companies, positioning itself as a picks-and-shovels layer beneath the chip market rather than a chipmaker itself.

**Is Nvidia losing market share to these startups?**
Not yet in any material way — Nvidia still dominates AI training and inference hardware. But the volume and size of funding into alternatives in 2026 shows investors betting that specialized and licensed silicon will erode Nvidia's margins over time, especially in inference.

---

*Following AI funding? Wortins tracks the biggest raises, valuations, and acquisitions daily in the [AI Funding Tracker](/funding).*
