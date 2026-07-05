// Reader-friendly topic labels for the taste picker + Tune page. Plain language
// with concrete examples — NOT jargon like "big-lab power plays". Shared so the
// onboarding cards and the Tune bars always match.
export const TOPICS: { tag: string; label: string; hint: string }[] = [
  { tag: "coding", label: "AI coding & agents", hint: "coding assistants, autonomous agents, dev AI" },
  { tag: "media", label: "Images, video & audio", hint: "AI image, video and voice generation" },
  { tag: "writing", label: "Writing & content", hint: "writing, summaries, content tools" },
  { tag: "music", label: "Music & audio", hint: "AI music and sound" },
  { tag: "science", label: "Science & health", hint: "medicine, biology, research breakthroughs" },
  { tag: "business", label: "Business & startups", hint: "startups, funding, the AI industry" },
  { tag: "safety", label: "Safety & risk", hint: "misuse, alignment, AI going wrong" },
  { tag: "policy", label: "Policy & regulation", hint: "laws, governments, courts" },
  { tag: "jobs", label: "AI & jobs", hint: "automation, careers, the future of work" },
  { tag: "daily-life", label: "AI in daily life", hint: "everyday apps, culture, society" },
  { tag: "world", label: "AI around the world", hint: "China, India, Europe and beyond" },
];

// How much technical depth the reader wants: 1 = plain news, 4 = deep/jargon.
export const LEVELS: { pref: number; label: string; hint: string }[] = [
  { pref: 1, label: "Keep it simple", hint: "Just the news in plain English — no jargon" },
  { pref: 2, label: "Mostly big-picture", hint: "The gist, with a little detail" },
  { pref: 3, label: "Some depth is good", hint: "I'm fine with technical detail" },
  { pref: 4, label: "Go as deep as it gets", hint: "Bring on the models, research and internals" },
];
