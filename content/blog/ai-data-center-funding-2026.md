---
title: AI Data Center Funding 2026: Who's Raising to Power the Compute Boom
description: A roundup of 2026's biggest AI data center and infrastructure funding rounds — Crusoe, Baseten, Together AI, Etched and Omen AI — and why power and compute capacity are now the real bottleneck.
date: 2026-07-08
updated: 2026-07-08
category: funding
keyword: ai data center funding
tags: ["AI data center funding", "AI infrastructure", "AI compute", "funding roundup"]
related: ["baseten-funding", "together-ai-funding", "biggest-ai-funding-rounds-2026"]
faq: [{"q":"Why is so much funding going into AI data centers right now?","a":"Because compute and power, not model quality, have become the limiting factor for scaling AI. Every major AI product needs GPU capacity to run on, and building that capacity requires massive up-front capital for chips, buildings, and electricity — so investors are funding the physical layer directly."},{"q":"What is the biggest AI data center funding round of 2026 so far?","a":"Crusoe is reportedly in talks to raise around $3 billion at a roughly $30 billion valuation, which would make it the largest of this group. That round is unconfirmed as of this writing."},{"q":"What's the difference between an AI neocloud and a traditional data center company?","a":"A neocloud like Together AI or Baseten builds and rents out infrastructure specifically optimized for AI training and inference, often on Nvidia GPUs, rather than general-purpose cloud computing. Traditional data center companies increasingly serve the same demand but with a broader mix of workloads."},{"q":"Why are chip startups like Etched raising alongside data center companies?","a":"Because the physical AI stack runs from silicon to power to buildings, and investors are backing the whole chain. Etched's transformer-specific chips run inside the same data centers that Crusoe and Baseten are building, so its funding is part of the same infrastructure story."}]
---

**AI's biggest constraint in 2026 isn't model quality — it's power and compute capacity, and investors are pouring billions into the companies that supply it.** In the past few months alone, five companies spanning data centers, inference infrastructure, chips, and cooling have raised or are reportedly raising a combined total north of $5.8 billion. Here's the roundup.

| Company | Amount | Valuation | Focus |
|---|---|---|---|
| Crusoe | ~$3B (reportedly in talks) | ~$30B | AI data centers + energy |
| Baseten | $1.5B Series F | ~$13B | AI inference infrastructure |
| Together AI | $800M Series C | $8.3B | AI inference neocloud |
| Etched | $500M | $5B | Transformer ASIC chips |
| [Omen AI](/blog/omen-ai-funding) | $31M Series A | — | Data-center cooling / thermal |

## Crusoe — ~$3B in talks at a ~$30B valuation

Crusoe is reportedly in talks to raise roughly **$3 billion** at a valuation near **$30 billion**. Nothing here is finalized — this is being described as talks, not a signed term sheet, so treat the figures as directional rather than confirmed. Crusoe's pitch combines AI data centers with its own energy sourcing, including stranded and flared gas, which lets it stand up compute capacity in places the traditional grid can't easily serve. If it closes anywhere near that number, it would be the largest round in this roundup by a wide margin. Full details: [/blog/crusoe-funding](/blog/crusoe-funding).

## Baseten — $1.5B Series F at ~$13B

Baseten raised a **$1.5 billion Series F** at roughly a **$13 billion valuation**, putting it firmly in the top tier of AI inference infrastructure companies. Baseten's business is running other companies' models in production — the unglamorous but increasingly critical layer between "we trained a model" and "the model serves real traffic reliably." A raise this size at this valuation says investors think inference, not just training, is where the durable infrastructure spend is heading. More on the round: [/blog/baseten-funding](/blog/baseten-funding).

## Together AI — $800M Series C at $8.3B

Together AI closed an **$800 million Series C** at an **$8.3 billion valuation**, led by Aramco Ventures — itself a signal of how much sovereign energy capital is flowing into AI compute. Together AI is a neocloud that rents out Nvidia GPU clusters for training and inference, with a focus on serving open-source models cheaper than closed platforms. Alongside the raise, the company secured commitments for **more than 500 megawatts of compute capacity** to be built independently by its investors — arguably as important a number as the funding itself. Full breakdown: [/blog/together-ai-funding](/blog/together-ai-funding).

## Etched — $500M at $5B

Etched raised **$500 million** at a **$5 billion valuation** to keep building its transformer-specific ASIC chips — silicon designed to run transformer-architecture models faster and cheaper than general-purpose GPUs. Unlike Nvidia's flexible-but-general chips, Etched is betting that if transformers remain the dominant AI architecture, purpose-built silicon wins on efficiency. Those chips ultimately live inside the same data centers Crusoe and Together AI are building, which is why chip funding and data center funding are really the same story told from different layers. Details: [/blog/etched-funding](/blog/etched-funding).

## Omen AI — $31M Series A

[Omen AI](/blog/omen-ai-funding) raised a **$31 million Series A** for AI data-center cooling and thermal management — a much smaller check, but a telling one. As data centers pack in denser, hotter GPU clusters, cooling has gone from an afterthought to its own funded category. Another infrastructure-layer startup, [Stathera](/blog/stathera-funding), raised a **$55M Series B** in the same window for silicon timing chips that keep dense AI data centers synchronized — a sign the buildout is being funded down to its smallest components.

## Why compute is the new bottleneck

Look at these five rounds together and a pattern jumps out: **almost none of this money is going toward building better models.** It's going toward the physical stack underneath them — GPUs, buildings, power contracts, cooling systems, and specialized chips.

That's a meaningful shift from the earlier phase of the AI boom, when funding concentrated in model labs racing to ship the next capability jump. In 2026, the constraint has moved downstream. Every AI product — chatbots, agents, coding tools, inference APIs — ultimately needs somewhere to run, and that somewhere requires megawatts of power and acres of GPU racks that take years to plan and build. Capital is following the bottleneck.

A few things stand out across this group:

1. **Energy is now a funding thesis, not a footnote.** Crusoe builds its own energy sourcing into its data centers. Together AI's round was led by an oil major's venture arm. Power availability, not chip availability, is increasingly the gating factor on how fast new capacity comes online.
2. **Inference is pulling ahead of training in investor attention.** Baseten and Together AI are both fundamentally inference businesses. As more AI spend shifts from one-time training runs to constant, high-volume inference traffic, that's where the recurring revenue — and the recurring infrastructure need — lives.
3. **The stack is getting funded end to end.** Chips (Etched), compute rental (Crusoe, Together AI), inference serving (Baseten), and even cooling (Omen AI) are all raising simultaneously. That's a sign investors see the physical AI supply chain as a single, still-underbuilt market rather than a handful of unrelated bets.

For a broader view of how these rounds stack up against other major 2026 raises, see [/blog/biggest-ai-funding-rounds-2026](/blog/biggest-ai-funding-rounds-2026).

---

*Following AI funding? Wortins tracks the biggest raises, valuations, and acquisitions daily in the [AI Funding Tracker](/funding).*
