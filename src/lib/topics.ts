// Reader-friendly topic labels for the taste picker + Tune page. Plain language
// with concrete examples — NOT jargon like "big-lab power plays". Shared so the
// onboarding cards and the Tune bars always match.
export const TOPICS: { tag: string; label: string; hint: string }[] = [
  { tag: "lab-power", label: "The big AI labs", hint: "OpenAI, Anthropic, Google, Meta and their big moves" },
  { tag: "strategy", label: "The business of AI", hint: "competition, big bets, who's winning" },
  { tag: "drama", label: "Drama & personalities", hint: "feuds, controversy, the big names" },
  { tag: "policy", label: "Rules & governments", hint: "laws, regulation, government moves" },
  { tag: "regional", label: "AI around the world", hint: "China, India, Europe and beyond" },
  { tag: "technical", label: "New tech & breakthroughs", hint: "new models, research, what's now possible" },
  { tag: "culture", label: "AI in everyday life", hint: "society, creativity, how it changes daily life" },
  { tag: "future-of-work", label: "Jobs & the future of work", hint: "automation, careers, how work changes" },
];

// How much technical depth the reader wants: 1 = plain news, 4 = deep/jargon.
export const LEVELS: { pref: number; label: string; hint: string }[] = [
  { pref: 1, label: "Keep it simple", hint: "Just the news in plain English — no jargon" },
  { pref: 2, label: "Mostly big-picture", hint: "The gist, with a little detail" },
  { pref: 3, label: "Some depth is good", hint: "I'm fine with technical detail" },
  { pref: 4, label: "Go as deep as it gets", hint: "Bring on the models, research and internals" },
];
