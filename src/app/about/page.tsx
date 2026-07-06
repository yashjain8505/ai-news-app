import type { Metadata } from "next";
import { SITE, absoluteUrl } from "@/lib/seo";
import { SITE_FAQ, GLOSSARY } from "@/lib/faq";
import PublicChrome from "@/components/PublicChrome";
import JsonLd from "@/components/JsonLd";

export const revalidate = 86400;

const TITLE = "About Wortins — how the briefing works";
const DESCRIPTION =
  "Wortins is a daily AI news briefing that curates the most interesting stories across the AI world and writes an original take on each. Here's how it works.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: absoluteUrl("/about") },
  openGraph: { title: TITLE, description: DESCRIPTION, url: absoluteUrl("/about"), type: "website", siteName: SITE.name },
  twitter: { card: "summary_large_image", title: TITLE, description: DESCRIPTION },
};

export default function AboutPage() {
  const faqLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: SITE_FAQ.map((f) => ({
      "@type": "Question",
      name: f.q,
      acceptedAnswer: { "@type": "Answer", text: f.a },
    })),
  };
  // Answer-first definitions, marked up so answer engines can lift crisp,
  // attributable definitions of the terms Wortins uses.
  const glossaryLd = {
    "@context": "https://schema.org",
    "@type": "DefinedTermSet",
    name: `${SITE.name} AI glossary`,
    url: absoluteUrl("/about"),
    hasDefinedTerm: GLOSSARY.map((t) => ({
      "@type": "DefinedTerm",
      name: t.term,
      description: t.definition,
      inDefinedTermSet: absoluteUrl("/about"),
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
      <JsonLd data={[aboutLd, faqLd, glossaryLd, breadcrumb]} />
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
            Key terms
          </h2>
          <dl style={{ marginTop: 8 }}>
            {GLOSSARY.map((t) => (
              <div key={t.term} style={{ padding: "18px 0", borderBottom: "1px solid var(--rule)" }}>
                <dt className="display" style={{ fontSize: 19, lineHeight: 1.2, color: "var(--ink)", margin: "0 0 6px" }}>
                  {t.term}
                </dt>
                <dd className="serif" style={{ fontSize: 16, lineHeight: 1.6, color: "var(--muted)", margin: 0, maxWidth: "66ch" }}>
                  {t.definition}
                </dd>
              </div>
            ))}
          </dl>
        </section>

        <section style={{ marginTop: 48 }}>
          <h2 className="display" style={{ fontSize: 28, color: "var(--ink)", margin: "0 0 8px", borderBottom: "3px solid var(--ruleStrong)", paddingBottom: 10 }}>
            Frequently asked questions
          </h2>
          <div style={{ marginTop: 8 }}>
            {SITE_FAQ.map((f) => (
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
