import type { Metadata } from "next";
import { SITE, absoluteUrl } from "@/lib/seo";
import FeedPage from "@/components/FeedPage";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: { absolute: `${SITE.name} · ${SITE.tagline}, tuned to your taste` },
  description: SITE.description,
  alternates: { canonical: absoluteUrl("/") },
  openGraph: {
    title: `${SITE.name} · ${SITE.tagline}`,
    description: SITE.description,
    url: absoluteUrl("/"),
    type: "website",
    siteName: SITE.name,
  },
  twitter: {
    card: "summary_large_image",
    title: `${SITE.name} · ${SITE.tagline}`,
    description: SITE.description,
  },
};

// The home is the Daily section of the feed · the SAME newspaper layout for
// everyone; FeedPage renders it personalized when signed in, non-personalized
// (with a sign-in prompt) when not.
export default function Home() {
  return <FeedPage section="daily" />;
}
