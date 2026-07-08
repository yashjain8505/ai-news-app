// Shared Q&A + glossary content, reused across the visible FAQ, the FAQPage
// structured data, and the Markdown twins. Question-shaped, answer-first copy is
// what answer engines (ChatGPT, Perplexity, Google AI) can quote directly, so it
// lives in one place and is rendered everywhere it helps.

export type QA = { q: string; a: string };

// Site-wide FAQ (also rendered on /about).
export const SITE_FAQ: QA[] = [
  {
    q: "What is Wortins?",
    a: "Wortins is a daily AI news briefing. Every day it curates the most interesting stories across the AI world, emerging startups, real product launches, applied real-world AI, notable funding, and genuine breakthroughs, and writes an original take on each, so you get the signal without the hype.",
  },
  {
    q: "How is Wortins different from other AI newsletters?",
    a: "Two things. First, it deliberately looks beyond the big-lab press cycle: megacap corporate news is capped in favour of the builders, tools, and applied AI that don't always make the front page. Second, every story carries an original Wortins take in our own words, not a copied summary, which is what makes it worth reading and citable.",
  },
  {
    q: "How often is Wortins updated?",
    a: "The edition refreshes through the day, roughly every couple of hours, so it stays current rather than being a once-a-morning digest.",
  },
  {
    q: "Is Wortins free?",
    a: "Yes. You can read the full public edition without signing in. Signing in with Google unlocks a personalized edition tuned to your taste.",
  },
  {
    q: "How does the personalized edition work?",
    a: "Sign in with Google and answer a few quick questions about which kinds of AI stories you care about. Wortins then orders your edition around those interests and keeps learning as you read.",
  },
  {
    q: "What does Wortins cover?",
    a: "Four sections: Daily AI (startups, products, applied AI and breakthroughs), New Tools (obscure, novel launches), Interesting Articles (strategy and sharp takes), and an AI Funding Tracker (notable raises, IPOs and acquisitions).",
  },
  {
    q: "Where does the content come from?",
    a: "Wortins curates from a wide range of sources across the AI industry and links every item to its original publisher. The 'Wortins read' on each story is our own original analysis; we never republish a source's article text.",
  },
];

// Per-section FAQ, question-shaped, answer-first, one short answer each. Keyed by
// the internal section key (daily | funding | tools | articles).
export const SECTION_FAQ: Record<string, QA[]> = {
  daily: [
    {
      q: "What is the Wortins Daily AI briefing?",
      a: "It's a running feed of the day's most interesting AI developments, emerging startups, real product launches, applied real-world AI, and genuine breakthroughs, each with an original Wortins take. It refreshes through the day rather than once each morning.",
    },
    {
      q: "How is the daily AI news chosen?",
      a: "Wortins scans a wide range of AI sources and prioritises what's genuinely new or consequential over big-lab press releases, so the daily briefing surfaces the builders and applied AI that the mainstream cycle often skips.",
    },
    {
      q: "How often does the daily AI news update?",
      a: "Through the day, roughly every couple of hours, so the briefing reflects what's happening now rather than yesterday's headlines.",
    },
  ],
  funding: [
    {
      q: "What is the AI Funding Tracker?",
      a: "The Wortins AI Funding Tracker is a running record of notable AI funding events, the biggest venture raises, IPOs, and acquisitions, with the amounts, valuations, and lead investors, plus an original take on why each deal matters.",
    },
    {
      q: "What counts as notable AI funding?",
      a: "Rounds, IPOs, and M&A that signal where capital and conviction are moving in AI: large or strategically important raises, first institutional rounds for fast-rising startups, and acquisitions that reshape the landscape.",
    },
    {
      q: "How current is the AI funding data?",
      a: "The tracker updates through the day as new raises and deals are reported, so it stays close to real time.",
    },
  ],
  tools: [
    {
      q: "What are the New AI Tools on Wortins?",
      a: "A stream of obscure, novel AI tools and launches, trending repositories, Show HN projects, and indie builds, surfaced early, often before they're widely known, each with a short original take on what it does and who it's for.",
    },
    {
      q: "How does Wortins find new AI tools?",
      a: "By watching where builders actually ship: open-source repositories, launch boards, and maker communities, filtered for tools that are genuinely new or useful rather than rebranded wrappers.",
    },
    {
      q: "Are these AI tools free to try?",
      a: "Many are open-source or offer a free tier; Wortins links directly to each tool's own page so you can check pricing and try it yourself.",
    },
  ],
  articles: [
    {
      q: "What are Interesting AI Articles on Wortins?",
      a: "A curated set of the most worthwhile essays and analysis on the AI industry, competitive dynamics, strategy, and sharp insider takes, each with an original Wortins read on why it's worth your time.",
    },
    {
      q: "What makes an AI article worth featuring?",
      a: "Depth and originality: pieces that explain how the AI industry actually works, draw useful parallels, or make a non-obvious argument, rather than restating the day's news.",
    },
    {
      q: "Does Wortins republish these articles?",
      a: "No. Wortins links to each article at its original publisher and adds a short original take; it never republishes the source's text.",
    },
  ],
};

// A small glossary of core terms, marked up as schema.org DefinedTerm so answer
// engines can lift crisp, attributable definitions. Rendered on /about.
export type Term = { term: string; definition: string };

export const GLOSSARY: Term[] = [
  {
    term: "Applied AI",
    definition:
      "Artificial intelligence put to concrete, real-world use, shipping products, workflows, and tools that solve an actual problem, as opposed to research demos or benchmark results.",
  },
  {
    term: "AI Funding Tracker",
    definition:
      "A continuously updated record of notable AI investment activity, including venture rounds, IPOs, and acquisitions, with amounts, valuations, and lead investors.",
  },
  {
    term: "Answer Engine Optimization (AEO)",
    definition:
      "The practice of structuring web content so that AI answer engines, such as ChatGPT, Perplexity, and Google's AI overviews, can read, understand, and cite it accurately.",
  },
  {
    term: "Wortins take",
    definition:
      "Wortins' own original, one-paragraph analysis of a story, why it matters and what to make of it, written in-house and never copied from the source article.",
  },
];
