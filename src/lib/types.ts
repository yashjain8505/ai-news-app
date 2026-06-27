export type Section = "daily" | "tools" | "articles";

export interface Item {
  id: string;
  section: Section;
  title: string;
  summary: string | null;
  url: string | null;
  source: string | null;
  author: string | null;
  traction: string | null;
  published_at: string | null;
  rank: number;
  created_at: string;
}

export const SECTIONS: { key: Section; label: string; blurb: string }[] = [
  { key: "daily", label: "Daily AI Updates", blurb: "Big-lab power moves & the surprising consequences of AI" },
  { key: "tools", label: "New Tools", blurb: "Obscure, novel tools before anyone else knows them" },
  { key: "articles", label: "Interesting Articles", blurb: "Strategic parallels & sharp takes worth reading" },
];
