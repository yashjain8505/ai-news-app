---
title: SAP Acquires Prior Labs: SAP's Bid for a European Frontier AI Lab
description: SAP agreed to acquire German AI startup Prior Labs in May 2026, with plans to invest over €1 billion over four years. The deal price itself was undisclosed — here's what it means.
date: 2026-07-08
updated: 2026-07-08
category: acquisitions
keyword: sap prior labs acquisition
tags: ["SAP", "Prior Labs", "AI acquisitions", "tabular foundation models", "TabPFN", "European AI"]
related: ["biggest-ai-acquisitions-2026", "mistral-funding", "biggest-ai-funding-rounds-2026"]
faq: [{"q":"How much did SAP pay for Prior Labs?","a":"The acquisition price was not disclosed. SAP has committed to invest more than €1 billion in Prior Labs over the next four years as a separate, publicly stated growth commitment — that figure is not the purchase price."},{"q":"When did SAP acquire Prior Labs?","a":"SAP announced the definitive agreement to acquire Prior Labs on May 4, 2026. The deal was expected to close in Q2 or Q3 2026, subject to regulatory approval."},{"q":"What does Prior Labs do?","a":"Prior Labs builds tabular foundation models (TFMs), including its TabPFN model family, which are AI models purpose-built to make predictions on structured business data like spreadsheets and databases rather than text."},{"q":"Why did SAP acquire Prior Labs?","a":"SAP wanted to secure an early lead in tabular foundation models — AI designed for the structured enterprise data that large language models handle poorly — and to build a frontier AI research lab based in Europe."}]
---

**SAP agreed to acquire Prior Labs, a German AI startup building tabular foundation models, in a deal announced on May 4, 2026.** The purchase price was not disclosed, but SAP said it would invest more than **€1 billion over the next four years** to grow Prior Labs into an independent, globally leading frontier AI lab headquartered in Europe. The deal was expected to close in Q2 or Q3 2026, pending regulatory approval.

It's a small-name acquisition with an outsized thesis: SAP is betting that the next real breakthrough in enterprise AI isn't a bigger chatbot, it's a model that actually understands a spreadsheet.

## What is Prior Labs?

Prior Labs is an 18-month-old German AI lab founded by **Frank Hutter, Noah Hollmann, and Sauraj Gambhir**. It's the company behind **TabPFN**, a family of **tabular foundation models (TFMs)** — AI systems trained specifically to make predictions on structured data: rows, columns, numbers, categories, the stuff that fills enterprise databases rather than the free text that large language models are built for.

The technical pitch is unusual for the current AI moment. Instead of scaling up a transformer on internet text, TabPFN pretrains on huge synthetic distributions of tabular tasks and then makes predictions through in-context learning — a single forward pass — rather than the gradient-descent training loop that a normal machine learning pipeline needs every time it sees a new dataset. In practice, that means TabPFN can often outperform carefully tuned tree-based models (the long-reigning champions of tabular ML, like gradient-boosted trees) without any per-dataset retraining.

The model family scaled fast: TabPFNv1 handled datasets up to 1,000 rows, TabPFNv2 pushed that to 10,000, TabPFN-2.5 went 20x further, and TabPFN-3 — released shortly before the acquisition — scales to **1 million training rows**. Prior Labs also lined up serious scientific credibility, with **Yann LeCun and Bernhard Schölkopf** advising the company's scientific board.

## The deal

The headline numbers, as disclosed by SAP:

- **Acquirer:** SAP SE
- **Target:** Prior Labs GmbH
- **Announced:** May 4, 2026
- **Deal price:** Undisclosed
- **Investment commitment:** More than €1 billion over four years
- **Expected close:** Q2 or Q3 2026, subject to regulatory approval
- **Structure:** Prior Labs continues operating as an independent entity within SAP

That distinction matters and is worth being precise about: the €1 billion is not the acquisition price. SAP has not disclosed what it actually paid to acquire Prior Labs. The €1 billion figure is a forward-looking investment commitment — capital SAP says it will pour into the lab over four years to scale its research, talent, and infrastructure after the deal closes. Several outlets have reported an estimated total deal value north of $1 billion when combining the transaction with SAP's commitments, but the underlying purchase price for the 18-month-old startup itself remains unconfirmed.

SAP CTO Philipp Herzig framed the rationale plainly: "Early on, SAP recognized that the greatest untapped opportunity in enterprise AI wasn't large language models; it was AI built for the structured data that runs the world's businesses." Prior Labs CEO Frank Hutter's response pointed the other direction — access to scale: "Joining the SAP family gives us the resources, data environment and customer reach to take this category to its full potential."

## Why SAP bought Prior Labs

SAP's underlying argument is a real technical gap. Large language models are trained on text, and their grasp of tables, numbers, and statistical structure is genuinely shallow — ask an LLM to spot a subtle anomaly across a million-row transaction ledger and it will often reason its way to a plausible-sounding but wrong answer. That's a serious liability for a company whose entire business is enterprise data: SAP runs the ERP systems, finance ledgers, and supply chain databases for a huge share of the world's largest companies. If tabular foundation models turn out to be the right architecture for making predictions on that kind of data, owning the leading research team gives SAP a head start that would be very expensive to build in-house or buy later, once the category is obvious to everyone else.

This is also a distribution play as much as a research one. Prior Labs has the models and the academic pedigree; what it doesn't have — and what a startup rarely has — is a direct line into the structured data of thousands of enterprise customers. SAP has spent the past year assembling data infrastructure pieces (its Dremio acquisition among them) to feed exactly this kind of model. Buying Prior Labs isn't just about acquiring a research team, it's about giving that team a production surface area no independent startup could match.

## What it means (Europe's AI ambitions)

The acquisition lands squarely inside a broader story: Europe trying to field a credible frontier AI player without simply importing one from the US. SAP explicitly framed the deal as establishing "a globally leading frontier AI lab" in Europe — language that echoes the ambitions behind [Mistral's funding](/blog/mistral-funding), the most prominent example of a European lab racing to compete on the world stage.

The difference is the playbook. Mistral is trying to build a general-purpose frontier lab from scratch, competing directly with OpenAI and Anthropic on broad capability. SAP's approach with Prior Labs is narrower and arguably shrewder: rather than chasing general intelligence, it's betting on a specific, defensible niche — enterprise tabular data — where it already owns the distribution and the customer relationships. That's a bet on winning a category rather than winning the leaderboard.

Whether it works depends on whether tabular foundation models really do outperform decades of entrenched tree-based methods at production scale, and whether SAP can integrate a fast-moving 18-month-old research lab without smothering it. But the signal is clear: acquiring frontier AI talent and keeping it in Europe, funded by a European enterprise giant, is now a live strategy — not just a funding-round talking point.

For more on how capital is moving through the AI market this year, Wortins tracks the deals as they land in the [AI Funding Tracker](/funding).

---

*Sources: [SAP Newsroom — SAP to Acquire Prior Labs to Establish a Globally Leading Frontier AI Lab in Europe](https://news.sap.com/2026/05/sap-to-acquire-prior-labs-establish-frontier-ai-lab-europe/)*
