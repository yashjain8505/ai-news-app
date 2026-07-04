import type { Metadata } from "next";
import { SITE, absoluteUrl } from "@/lib/seo";
import PublicChrome from "@/components/PublicChrome";
import JsonLd from "@/components/JsonLd";

export const revalidate = 86400;

const CONTACT_EMAIL = "hello@wortins.com";

const TITLE = "Contact Wortins";
const DESCRIPTION =
  "Get in touch with Wortins — feedback, tips, story suggestions, and partnership enquiries.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: absoluteUrl("/contact") },
  openGraph: { title: TITLE, description: DESCRIPTION, url: absoluteUrl("/contact"), type: "website", siteName: SITE.name },
};

export default function ContactPage() {
  const ld = {
    "@context": "https://schema.org",
    "@type": "ContactPage",
    name: TITLE,
    url: absoluteUrl("/contact"),
    isPartOf: { "@type": "WebSite", name: SITE.name, url: SITE.url },
    about: {
      "@type": "Organization",
      name: SITE.name,
      url: SITE.url,
      email: CONTACT_EMAIL,
    },
  };
  const breadcrumb = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: SITE.url },
      { "@type": "ListItem", position: 2, name: "Contact", item: absoluteUrl("/contact") },
    ],
  };

  return (
    <>
      <JsonLd data={[ld, breadcrumb]} />
      <PublicChrome subtitle="Contact">
        <h1 className="display" style={{ fontSize: "clamp(30px,4.5vw,46px)", lineHeight: 1.05, color: "var(--ink)", margin: "0 0 16px" }}>
          Contact
        </h1>
        <div style={{ maxWidth: "60ch" }}>
          <p className="serif" style={{ fontSize: 18, lineHeight: 1.6, color: "var(--muted)", margin: "0 0 20px" }}>
            Feedback, a story tip, a correction, or a partnership idea? We&#8217;d like to hear it.
          </p>
          <p className="serif" style={{ fontSize: 18, lineHeight: 1.6, color: "var(--ink)", margin: "0 0 8px" }}>
            Email:{" "}
            <a href={`mailto:${CONTACT_EMAIL}`} style={{ color: "var(--accent)", textDecoration: "none", borderBottom: "1px solid var(--accent)" }}>
              {CONTACT_EMAIL}
            </a>
          </p>
          <p className="mono" style={{ fontSize: 12, letterSpacing: "0.04em", color: "var(--faint)", marginTop: 20 }}>
            {SITE.name} &middot; the daily AI briefing
          </p>
        </div>
      </PublicChrome>
    </>
  );
}
