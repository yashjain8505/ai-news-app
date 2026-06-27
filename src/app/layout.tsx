import type { Metadata } from "next";
import {
  Bricolage_Grotesque,
  Newsreader,
  Playfair_Display,
} from "next/font/google";
import "./globals.css";

const sans = Bricolage_Grotesque({
  subsets: ["latin"],
  variable: "--font-sans",
  weight: ["400", "500", "600", "700", "800"],
});

const serif = Newsreader({
  subsets: ["latin"],
  variable: "--font-serif",
  weight: ["400", "500"],
  style: ["normal", "italic"],
});

const display = Playfair_Display({
  subsets: ["latin"],
  variable: "--font-display",
  weight: ["600", "700", "800"],
});

export const metadata: Metadata = {
  title: "Signal: AI, curated to your taste",
  description:
    "Daily AI updates, obscure new tools, and the most interesting AI reads, personalized.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className={`${sans.variable} ${serif.variable} ${display.variable}`}>
        <div className="h-0.5 w-full bg-[#cdff3a]" />
        {children}
      </body>
    </html>
  );
}
