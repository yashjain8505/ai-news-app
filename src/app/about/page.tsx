import type { Metadata } from "next";
import { SITE, absoluteUrl } from "@/lib/seo";
import PublicChrome from "@/components/PublicChrome";
import JsonLd from "@/components/JsonLd";

export const revalidate = 86400;

const TITLE = "About Wortins — who we are & how the briefing works";
const DESCRIPTION =
  "Wortins is a daily AI news briefing that curates the most interesting stories across the AI world and writes an original take on each. Here's who's behind it and how it works.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: absoluteUrl("/about") },
  openGraph: { title: TITLE, description: DESCRIPTION, url: absoluteUrl("/about"), type: "website", siteName: SITE.name },
  twitter: { card: "summary_large_image", title: TITLE, description: DESCRIPTION },
};

// Reused for both the visible FAQ and the FAQPage structured data.
const FAQ: { q: string; a: string }[] = [
  {
    q: "What is Wortins?",
    a: "Wortins is a daily AI news briefing. Every day it curates the most interesting stories across the AI world — emerging startups, real product launches, applied real-world AI, notable funding, and genuine breakthroughs — and writes an original take on each, so you get the signal without the hype.",
  },
  {
    q: "How is Wortins different from other AI newsletters?",
    a: "Two things. First, it deliberately looks beyond the big-lab press cycle: megacap corporate news is capped in favour of the builders, tools, and applied AI that don't always make the front page. Second, every story carries an original Wortins take in our own words, not a copied summary — which is what makes it worth reading and citable.",
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

export default function AboutPage() {
  const faqLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: FAQ.map((f) => ({
      "@type": "Question",
      name: f.q,
      acceptedAnswer: { "@type": "Answer", text: f.a },
    })),
  };
  const aboutLd = {
    "@context": "https://schema.org",
    "@type": "AboutPage",
    name: TITLE,
    description: DESCRIPTION,
    url: absoluteUrl("/about"),
    isPartOf: { "@type": "WebSite", name: SITE.name, url: SITE.url },
    about: {
      "@type": "Organization",
      name: SITE.name,
      url: SITE.url,
      logo: `${SITE.url}/icon.svg`,
    },
  };
  const breadcrumb = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: SITE.url },
      { "@type": "ListItem", position: 2, name: "About", item: absoluteUrl("/about") },
    ],
  };

  return (
    <>
      <JsonLd data={[aboutLd, faqLd, breadcrumb]} />
      <PublicChrome subtitle="About">
        <h1 className="display" style={{ fontSize: "clamp(30px,4.5vw,46px)", lineHeight: 1.05, color: "var(--ink)", margin: "0 0 16px" }}>
          About Wortins
        </h1>
        <div style={{ maxWidth: "66ch" }}>
          <p className="serif" style={{ fontSize: 19, lineHeight: 1.6, color: "var(--muted)", margin: "0 0 18px" }}>
            Wortins is a daily AI news briefing. Every day it curates the most interesting
            stories across the AI world — emerging startups, real product launches, applied
            real-world AI, notable funding, and genuine breakthroughs — and writes an original
            take on each, so you get the signal without the noise or the hype.
          </p>
          <p className="serif" style={{ fontSize: 17, lineHeight: 1.6, color: "var(--muted)", margin: "0 0 18px" }}>
            The edition refreshes through the day. You can read the public edition, or sign in
            to get a version tuned to your taste: the topics, tools and sources you actually
            follow, and nothing you don&#8217;t.
          </p>
          <h2 className="display" style={{ fontSize: 24, color: "var(--ink)", margin: "34px 0 12px" }}>
            Our editorial approach
          </h2>
          <p className="serif" style={{ fontSize: 17, lineHeight: 1.6, color: "var(--muted)", margin: "0 0 18px" }}>
            Wortins deliberately looks beyond the big-lab press cycle. Megacap corporate news is
            capped in favour of the builders, tools, and applied AI that don&#8217;t always make
            the front page. Every story links to its original source, and the &#8220;Wortins
            read&#8221; on each is our own words — original analysis, never a republished article.
          </p>
        </div>

        <section style={{ marginTop: 48 }}>
          <h2 className="display" style={{ fontSize: 28, color: "var(--ink)", margin: "0 0 8px", borderBottom: "3px solid var(--ruleStrong)", paddingBottom: 10 }}>
            Frequently asked questions
          </h2>
          <div style={{ marginTop: 8 }}>
            {FAQ.map((f) => (
              <div key={f.q} style={{ padding: "20px 0", borderBottom: "1px solid var(--rule)" }}>
                <h3 className="display" style={{ fontSize: 20, lineHeight: 1.2, color: "var(--ink)", margin: "0 0 8px" }}>
                  {f.q}
                </h3>
                <p className="serif" style={{ fontSize: 16, lineHeight: 1.6, color: "var(--muted)", margin: 0, maxWidth: "66ch" }}>
                  {f.a}
                </p>
              </div>
            ))}
          </div>
        </section>
      </PublicChrome>
    </>
  );
}
