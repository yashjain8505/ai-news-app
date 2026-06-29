export type Section = "daily" | "tools" | "articles" | "funding";

export interface Item {
  id: string;
  section: Section;
  title: string;
  summary: string | null;
  url: string | null;
  source: string | null;
  author: string | null;
  traction: string | null;
  image_url: string | null;
  highlight: string | null;
  tags: string[];
  published_at: string | null;
  read_time: number | null;
  edition_date: string | null;
  rank: number;
  created_at: string;
}

export interface QuizArticle {
  id: string;
  title: string;
  url: string | null;
  image_url: string | null;
  summary: string | null;
  tags: string[];
}

export const SECTIONS: { key: Section; label: string; blurb: string }[] = [
  {
    key: "daily",
    label: "Daily AI Updates",
    blurb: "Big-lab power moves and the surprising consequences of AI",
  },
  {
    key: "tools",
    label: "New Tools",
    blurb: "Obscure, novel tools before anyone else knows them",
  },
  {
    key: "articles",
    label: "Interesting Articles",
    blurb: "Strategic parallels and sharp takes worth reading",
  },
];
