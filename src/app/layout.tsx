import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";
import {
  Libre_Caslon_Display,
  Libre_Caslon_Text,
  Newsreader,
  Space_Mono,
} from "next/font/google";
import "./globals.css";
import { SITE, SAME_AS } from "@/lib/seo";
import JsonLd from "@/components/JsonLd";
import Script from "next/script";

const display = Libre_Caslon_Display({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-display",
  weight: ["400"],
});

const text = Libre_Caslon_Text({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-text",
  weight: ["400", "700"],
});

const serif = Newsreader({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-serif",
  weight: ["400", "500"],
  style: ["normal", "italic"],
});

const mono = Space_Mono({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-mono",
  weight: ["400", "700"],
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE.url),
  title: {
    default: `${SITE.name} — ${SITE.tagline}`,
    template: `%s | ${SITE.name}`,
  },
  description: SITE.description,
  applicationName: SITE.name,
  openGraph: {
    title: `${SITE.name} — ${SITE.tagline}`,
    description: SITE.description,
    siteName: SITE.name,
    type: "website",
    locale: SITE.locale,
    url: SITE.url,
  },
  twitter: {
    card: "summary_large_image",
    site: SITE.twitter,
    title: `${SITE.name} — ${SITE.tagline}`,
    description: SITE.description,
  },
  robots: {
    index: true,
    follow: true,
    "max-image-preview": "large",
    "max-snippet": -1,
    "max-video-preview": -1,
  },
  alternates: { types: { "application/rss+xml": "/feed.xml" } },
};

export const viewport: Viewport = {
  themeColor: "#f3ecda",
};

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const theme =
    (await cookies()).get("sig_theme")?.value === "dark" ? "dark" : "light";
  return (
    <html
      lang="en"
      data-theme={theme}
      className={`${display.variable} ${text.variable} ${serif.variable} ${mono.variable}`}
    >
      <body>
        <JsonLd
          data={{
            "@context": "https://schema.org",
            "@graph": [
              {
                "@type": "Organization",
                "@id": `${SITE.url}/#organization`,
                name: SITE.name,
                url: SITE.url,
                logo: `${SITE.url}/icon.svg`,
                description: SITE.description,
                email: SITE.email,
                sameAs: SAME_AS,
                contactPoint: {
                  "@type": "ContactPoint",
                  contactType: "customer support",
                  email: SITE.email,
                },
              },
              {
                "@type": "WebSite",
                name: SITE.name,
                url: SITE.url,
                description: SITE.description,
              },
            ],
          }}
        />
        <Script
          src="https://www.googletagmanager.com/gtag/js?id=G-2FVE41J49X"
          strategy="afterInteractive"
        />
        <Script id="ga4" strategy="afterInteractive">
          {`window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('js', new Date());
gtag('config', 'G-2FVE41J49X');`}
        </Script>
        {children}
      </body>
    </html>
  );
}
